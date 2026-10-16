import { describe, expect, it, vi } from "vitest";
import { createInvoiceController } from "../src/app/invoice-controller";
import { renderApp } from "../src/ui/render-app";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { copyTransactions } from "../src/export/clipboard";
import { singleTableInvoice } from "./fixtures/bradesco-invoice.synthetic";

const pages = singleTableInvoice([[[20, "03/01"], [80, "COMPRA SINTÉTICA"], [565, "470,00"]]]);
const file = { name: "sintetica.pdf", type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as File;
function mount(options: { unbalanced?: boolean; suspect?: boolean; fallback?: boolean; secondRow?: boolean;
  waitForClipboard?: Promise<void> } = {}) {
  const sourcePages = options.secondRow ? singleTableInvoice([
    [[20, "03/01"], [80, "COMPRA SINTÉTICA A"], [565, "235,00"]],
    [[20, "04/01"], [80, "COMPRA SINTÉTICA B"], [565, "235,00"]],
  ]) : pages;
  const parsed = parseBradescoInvoice(sourcePages);
  if (options.unbalanced) parsed.summary.purchasesAndDebits = 999;
  if (options.suspect) {
    parsed.transactions[0]!.date = "";
    parsed.transactions[0]!.value = Number.NaN;
    parsed.transactions[0]!.warnings = ["MISSING_TRANSACTION_VALUE"];
  }
  const writeText = vi.fn(async (_text: string) => {
    await options.waitForClipboard;
    if (options.fallback) throw new Error("denied");
  });
  const controller = createInvoiceController({ extract: async () => sourcePages, parse: () => parsed,
    copy: (rows) => copyTransactions(rows, { writeText }) });
  const root = document.createElement("main");
  document.body.append(root);
  renderApp(root, controller);
  return { root, controller, writeText };
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((item) =>
    (item.getAttribute("aria-label") ?? item.textContent) === text);
  if (!found) throw new Error(`Botão ausente: ${text}`);
  return found;
}
function input(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`Campo ausente: ${label}`);
  return found;
}

describe("fluxo visual da fatura", () => {
  it("mostra lixeira sem texto na primeira célula e preserva oito campos na ordem de saída", async () => {
    const { root, controller, writeText } = mount();
    await controller.loadFile(file);
    const row = root.querySelector<HTMLTableRowElement>("tbody tr")!;
    const remove = button("Excluir linha 1");
    expect(row.cells).toHaveLength(9);
    expect(row.cells[0]?.querySelector("button")).toBe(remove);
    expect(row.cells[0]?.querySelector("input")).toBeNull();
    expect(remove.textContent).toBe("");
    expect(remove.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    expect(remove.type).toBe("button");
    remove.focus();
    expect(document.activeElement).toBe(remove);
    expect(Array.from(row.cells).slice(1).map((cell) =>
      cell.querySelector("input")?.getAttribute("aria-label"))).toEqual([
      "Data, linha 1", "Histórico, linha 1", "Moeda de origem, linha 1", "US$, linha 1",
      "Cotação US$, linha 1", "R$, linha 1", "Parcela, linha 1", "Valor, linha 1",
    ]);
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toBe(
      "Data\tHistórico\tMoeda de origem\tUS$\tCotação US$\tR$\tParcela\tValor\n" +
      "03/01/2026\tCOMPRA SINTÉTICA\t\t\t\t470\t1/1\t470",
    );
  });

  it("reindexa o nome da lixeira sem recriar a linha restante nem perder seu rascunho", async () => {
    const { root, controller, writeText } = mount({ secondRow: true });
    await controller.loadFile(file);
    const survivingRow = root.querySelectorAll("tbody tr")[1]!;
    const survivingRemove = button("Excluir linha 2");
    const amount = input("R$, linha 2");
    amount.value = "12,";
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    const remove = button("Excluir linha 1");
    expect(root.querySelector("tbody tr")?.firstElementChild?.contains(remove)).toBe(true);
    remove.click();
    expect(root.querySelector("tbody tr")).toBe(survivingRow);
    expect(button("Excluir linha 1")).toBe(survivingRemove);
    expect(survivingRemove.textContent).toBe("");
    expect(input("R$, linha 1")).toBe(amount);
    expect(amount.value).toBe("12,");
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    button("Copiar tabela").click();
    expect(writeText).not.toHaveBeenCalled();
    button("Restaurar extração original").click();
    expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(input("R$, linha 2").value).toBe("235");
    expect(button("Excluir linha 2").getAttribute("aria-label")).toBe("Excluir linha 2");
  });

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

  it("preserva rascunho inválido após editar outra célula e continua bloqueando cópia", async () => {
    const { controller, writeText } = mount();
    await controller.loadFile(file);
    const amount = input("R$, linha 1");
    amount.value = "12,";
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    amount.dispatchEvent(new Event("change", { bubbles: true }));
    const history = input("Histórico, linha 1");
    history.value = "REVISÃO SINTÉTICA";
    history.dispatchEvent(new Event("input", { bubbles: true }));
    history.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input("R$, linha 1").value).toBe("12,");
    expect(input("R$, linha 1").getAttribute("aria-invalid")).toBe("true");
    button("Copiar tabela").click();
    expect(writeText).not.toHaveBeenCalled();
    const corrected = input("R$, linha 1");
    corrected.value = "470,00";
    corrected.dispatchEvent(new Event("input", { bubbles: true }));
    corrected.dispatchEvent(new Event("change", { bubbles: true }));
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain("REVISÃO SINTÉTICA");
  });

  it("mantém o botão alvo conectado quando change ocorre entre mousedown e click", async () => {
    const { controller, writeText } = mount();
    await controller.loadFile(file);
    const editor = input("Histórico, linha 1");
    editor.focus();
    editor.value = "EDIÇÃO ANTES DO CLIQUE";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    const target = button("Copiar tabela");
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    expect(target.isConnected).toBe(true);
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain("EDIÇÃO ANTES DO CLIQUE");
  });

  it("preserva o rascunho da linha restante ao excluir outra e limpa ao restaurar", async () => {
    const { controller, writeText } = mount({ secondRow: true });
    await controller.loadFile(file);
    const amount = input("R$, linha 2");
    amount.value = "12,";
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    amount.dispatchEvent(new Event("change", { bubbles: true }));
    button("Excluir linha 1").click();
    expect(input("R$, linha 1").value).toBe("12,");
    expect(input("R$, linha 1").getAttribute("aria-invalid")).toBe("true");
    button("Copiar tabela").click();
    expect(writeText).not.toHaveBeenCalled();
    controller.restoreOriginal();
    expect(input("R$, linha 1").value).toBe("235");
    expect(input("R$, linha 2").value).toBe("235");
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it("descarta rascunho apenas da linha excluída e limpa todos em novo upload", async () => {
    const { controller, writeText } = mount({ secondRow: true });
    await controller.loadFile(file);
    const amount = input("R$, linha 1");
    amount.value = "12,";
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    button("Excluir linha 1").click();
    expect(input("R$, linha 1").value).toBe("235");
    button("Copiar tabela").click();
    button("Copiar mesmo assim").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const remaining = input("R$, linha 1");
    remaining.value = "12,";
    remaining.dispatchEvent(new Event("input", { bubbles: true }));
    await controller.loadFile(file);
    expect(input("R$, linha 1").value).toBe("235");
    expect(input("R$, linha 2").value).toBe("235");
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it("desabilita nova cópia durante escrita pendente e não anuncia sucesso de revisão obsoleta", async () => {
    let finish!: () => void;
    const waitForClipboard = new Promise<void>((resolve) => { finish = resolve; });
    const { root, controller, writeText } = mount({ waitForClipboard });
    await controller.loadFile(file);
    button("Copiar tabela").click();
    const history = input("Histórico, linha 1");
    history.value = "REVISÃO DURANTE CÓPIA";
    history.dispatchEvent(new Event("input", { bubbles: true }));
    history.dispatchEvent(new Event("change", { bubbles: true }));
    expect(button("Copiar tabela").disabled).toBe(true);
    expect(root.textContent).toContain("Aguarde para copiar outra revisão");
    button("Copiar tabela").click();
    expect(writeText).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(button("Copiar tabela").disabled).toBe(false));
    expect(root.textContent).not.toContain("Tabela copiada");
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Tabela copiada"));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[1]?.[0]).toContain("REVISÃO DURANTE CÓPIA");
  });

  it("iniciar rascunho invalida sucesso anterior mesmo antes do change", async () => {
    const { root, controller, writeText } = mount();
    await controller.loadFile(file);
    button("Copiar tabela").click();
    await vi.waitFor(() => expect(root.textContent).toContain("Tabela copiada"));
    const amount = input("R$, linha 1");
    amount.value = "12,";
    amount.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.textContent).not.toContain("Tabela copiada");
    expect(root.textContent).not.toContain("Conciliado");
    button("Copiar tabela").click();
    expect(writeText).toHaveBeenCalledTimes(1);
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
