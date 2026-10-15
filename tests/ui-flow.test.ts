import { describe, expect, it, vi } from "vitest";
import { createInvoiceController } from "../src/app/invoice-controller";
import { renderApp } from "../src/ui/render-app";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { copyTransactions } from "../src/export/clipboard";
import { singleTableInvoice } from "./fixtures/bradesco-invoice.synthetic";

const pages = singleTableInvoice([[[20, "03/01"], [80, "COMPRA SINTÉTICA"], [565, "470,00"]]]);
const file = { name: "sintetica.pdf", type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as File;
function mount(options: { unbalanced?: boolean; suspect?: boolean; fallback?: boolean } = {}) {
  const parsed = parseBradescoInvoice(pages);
  if (options.unbalanced) parsed.summary.purchasesAndDebits = 999;
  if (options.suspect) {
    parsed.transactions[0]!.date = "";
    parsed.transactions[0]!.value = Number.NaN;
    parsed.transactions[0]!.warnings = ["MISSING_TRANSACTION_VALUE"];
  }
  const writeText = vi.fn(async (_text: string) => { if (options.fallback) throw new Error("denied"); });
  const controller = createInvoiceController({ extract: async () => pages, parse: () => parsed,
    copy: (rows) => copyTransactions(rows, { writeText }) });
  const root = document.createElement("main");
  document.body.append(root);
  renderApp(root, controller);
  return { root, controller, writeText };
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((item) => item.textContent === text);
  if (!found) throw new Error(`Botão ausente: ${text}`);
  return found;
}
function input(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`Campo ausente: ${label}`);
  return found;
}

describe("fluxo visual da fatura", () => {
  it("aceita seleção de PDF e exibe resumo com oito colunas acessíveis", async () => {
    const { root, controller } = mount();
    const picker = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(picker.disabled).toBe(false);
    Object.defineProperty(picker, "files", { value: [file] });
    picker.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    expect(root.textContent).toContain("sintetica.pdf");
    for (const label of ["Páginas", "Lançamentos", "Positivos", "Negativos", "Líquido", "Controle", "Diferença"]) {
      expect(root.textContent).toContain(label);
    }
    expect(root.querySelectorAll("th")).toHaveLength(8);
    expect(Array.from(root.querySelectorAll("th")).map((cell) => cell.textContent)).toEqual([
      "Data", "Histórico", "Moeda de origem", "US$", "Cotação US$", "R$", "Parcela", "Valor",
    ]);
    expect(root.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(root.textContent).toContain("Conciliado");
  });

  it("mantém texto monetário durante digitação, rejeita inválido e recalcula só no commit válido", async () => {
    const { root, controller, writeText } = mount();
    await controller.loadFile(file);
    const editor = input("R$, linha 1");
    expect(editor.type).toBe("text");
    editor.value = "12,";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(controller.getState().transactions[0]?.brl).toBe(470);
    expect(editor.getAttribute("aria-invalid")).toBe("true");
    button("Copiar tabela").click();
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Revise o valor");
    editor.value = "469,99";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    expect(controller.getState().transactions[0]?.value).toBe(469.99);
    expect(root.textContent).toContain("-0,01");
  });

  it("exclui somente por botão explícito e restaura a extração original", async () => {
    const { root, controller } = mount();
    await controller.loadFile(file);
    button("Excluir linha 1").click();
    expect(root.querySelectorAll("tbody tr")).toHaveLength(0);
    button("Restaurar extração original").click();
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(controller.getState().transactions[0]?.value).toBe(470);
  });

  it("preserva foco no editor após confirmar uma célula válida", async () => {
    const { controller } = mount();
    await controller.loadFile(file);
    const editor = input("Histórico, linha 1");
    editor.focus();
    editor.value = "AJUSTE SINTÉTICO";
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.activeElement).toBe(input("Histórico, linha 1"));
    expect(input("Histórico, linha 1").value).toBe("AJUSTE SINTÉTICO");
  });

  it("não copia divergência até a segunda ação explícita", async () => {
    const { root, controller, writeText } = mount({ unbalanced: true });
    await controller.loadFile(file);
    expect(root.textContent).toContain("Não conciliado");
    button("Copiar tabela").click();
    expect(writeText).not.toHaveBeenCalled();
    button("Copiar mesmo assim").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Tabela copiada"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("03/01/2026\tCOMPRA SINTÉTICA\t\t\t\t470\t1/1\t470");
  });

  it("NaN, data ausente e warnings ficam visíveis como suspeitos, nunca como sucesso", async () => {
    const { root, controller, writeText } = mount({ suspect: true });
    await controller.loadFile(file);
    expect(root.textContent).toContain("Linha suspeita");
    expect(root.textContent).toContain("MISSING_TRANSACTION_VALUE");
    expect(input("Valor, linha 1").getAttribute("aria-invalid")).toBe("true");
    expect(input("Data, linha 1").getAttribute("aria-invalid")).toBe("true");
    expect(root.textContent).not.toContain("Conciliado");
    button("Copiar tabela").click();
    expect(writeText).not.toHaveBeenCalled();
    expect(button("Copiar mesmo assim")).toBeDefined();
  });

  it("clipboard negado oferece textarea intacto, focado e selecionado", async () => {
    const { root, controller } = mount({ fallback: true });
    await controller.loadFile(file);
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(root.querySelector("textarea")).not.toBeNull());
    const fallback = root.querySelector("textarea")!;
    expect(fallback.readOnly).toBe(true);
    expect(fallback.value).toContain("Data\tHistórico\tMoeda de origem\tUS$\tCotação US$\tR$\tParcela\tValor\n");
    expect(document.activeElement).toBe(fallback);
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
    expect(root.textContent).not.toContain("Tabela copiada");
  });

  it("copia conciliado com sucesso e renderiza conteúdo como texto seguro", async () => {
    const { root, controller } = mount();
    await controller.loadFile(file);
    controller.editCell(0, "history", '<img src=x onerror="alert(1)">');
    expect(root.querySelector("img")).toBeNull();
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Tabela copiada"));
  });
});
