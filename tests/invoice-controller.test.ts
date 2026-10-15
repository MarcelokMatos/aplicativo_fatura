import { describe, expect, it, vi } from "vitest";
import { createInvoiceController } from "../src/app/invoice-controller";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import type { ParsedInvoice } from "../src/parsers/bradesco-parser";
import type { InvoiceTransaction } from "../src/domain/transaction";
import { singleTableInvoice } from "./fixtures/bradesco-invoice.synthetic";

const pages = singleTableInvoice([
  [[20, "03/01"], [80, "COMPRA SINTÉTICA"], [565, "470,00"]],
]);
const file = (name = "sintetica.pdf", type = "application/pdf") => ({
  name, type, arrayBuffer: async () => new ArrayBuffer(1),
}) as File;
const parsed = (): ParsedInvoice => parseBradescoInvoice(pages);
const setup = (invoice = parsed()) => {
  const copy = vi.fn(async (_rows: InvoiceTransaction[]) => ({ copied: true, text: "saída sintética" }));
  const extract = vi.fn(async () => pages);
  return { controller: createInvoiceController({ extract, parse: () => invoice, copy }), copy, extract };
};

describe("controlador de revisão local", () => {
  it("recusa não-PDF sem extrair e informa erro", async () => {
    const { controller, extract } = setup();
    await controller.loadFile(file("texto.txt", "text/plain"));
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().diagnostics[0]?.code).toBe("PDF_REQUIRED");
    expect(extract).not.toHaveBeenCalled();
  });

  it("publica reading antes de ready com páginas, resumo e controle de compras", async () => {
    const { controller } = setup();
    const statuses: string[] = [];
    controller.subscribe((state) => statuses.push(state.status));
    await controller.loadFile(file());
    expect(statuses).toEqual(["idle", "reading", "ready"]);
    expect(controller.getState()).toMatchObject({ fileName: "sintetica.pdf", pageCount: 1,
      reconciliation: { netTotal: 470, controlTotal: 470, difference: 0, isBalanced: true } });
  });

  it("usa total da fatura apenas se controle de compras estiver ausente", async () => {
    const invoice = parsed();
    invoice.summary.purchasesAndDebits = null;
    const { controller } = setup(invoice);
    await controller.loadFile(file());
    expect(controller.getState().reconciliation?.controlTotal).toBe(450);
  });

  it("layout não reconhecido e PDF vazio nunca liberam transações", async () => {
    const { controller, copy } = setup({ ...parsed(), recognizedLayout: false });
    await controller.loadFile(file());
    expect(controller.getState().status).toBe("unsupported");
    expect(controller.getState().transactions).toEqual([]);
    await controller.requestCopy();
    await controller.confirmCopy();
    expect(copy).not.toHaveBeenCalled();
    const empty = createInvoiceController({ extract: async () => [], parse: parseBradescoInvoice, copy });
    await empty.loadFile(file());
    expect(empty.getState().status).toBe("unsupported");
    await empty.requestCopy();
    expect(copy).not.toHaveBeenCalled();
  });

  it("preserva diagnóstico seguro para falha de extração e permite novo arquivo", async () => {
    const extract = vi.fn().mockRejectedValueOnce(new Error("conteúdo privado não pode vazar"))
      .mockResolvedValueOnce(pages);
    const controller = createInvoiceController({ extract, parse: parseBradescoInvoice });
    await controller.loadFile(file());
    expect(controller.getState().status).toBe("error");
    expect(JSON.stringify(controller.getState().diagnostics)).not.toContain("conteúdo privado");
    expect(controller.getState().diagnostics[0]?.code).toBe("PDF_PROCESSING_FAILED");
    await controller.loadFile(file());
    expect(controller.getState().status).toBe("ready");
  });

  it("ignora conclusão obsoleta quando outro arquivo foi selecionado", async () => {
    let resolveFirst!: (value: typeof pages) => void;
    const extract = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(pages);
    const controller = createInvoiceController({ extract, parse: parseBradescoInvoice });
    const first = controller.loadFile(file("primeiro.pdf"));
    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
    await controller.loadFile(file("segundo.pdf"));
    resolveFirst([]);
    await first;
    expect(controller.getState()).toMatchObject({ status: "ready", fileName: "segundo.pdf" });
  });

  it.each([
    ["date", "04/01/2026", "2026-01-04"], ["history", "AJUSTE SINTÉTICO", "AJUSTE SINTÉTICO"],
    ["originalCurrency", "15,20", 15.2], ["usd", "10,50", 10.5], ["usdRate", "5,1234", 5.1234],
    ["brl", "469,99", 469.99], ["installment", "02/10", "2/10"], ["value", "-20,50", -20.5],
  ] as const)("valida e edita a célula %s", async (field, input, expected) => {
    const { controller } = setup();
    await controller.loadFile(file());
    expect(controller.editCell(0, field, input)).toBe(true);
    expect(controller.getState().transactions[0]?.[field]).toBe(expected);
  });

  it.each([["date", "31/02/2026"], ["date", ""], ["history", " "], ["installment", "3/2"],
    ["installment", "=1+1"], ["value", "NaN"], ["value", ""], ["brl", "1,2,3"]] as const)(
    "rejeita edição inválida %s=%s sem contaminar domínio", async (field, input) => {
      const { controller } = setup();
      await controller.loadFile(file());
      expect(controller.editCell(0, field, input)).toBe(false);
      expect(controller.getState().transactions).toEqual(parsed().transactions);
    });

  it("recalcula Valor ao editar a origem, mantém null e conciliação após exclusão/restauração", async () => {
    const { controller, extract } = setup();
    await controller.loadFile(file());
    controller.editCell(0, "originalCurrency", "100,00");
    controller.editCell(0, "brl", "");
    expect(controller.getState().transactions[0]).toMatchObject({ brl: null, value: 100 });
    expect(controller.getState().reconciliation?.difference).toBe(-370);
    controller.deleteRow(0);
    expect(controller.getState().transactions).toHaveLength(0);
    expect(controller.getState().reconciliation?.isBalanced).toBe(false);
    controller.restoreOriginal();
    expect(controller.getState().transactions[0]?.value).toBe(470);
    expect(controller.getState().reconciliation?.isBalanced).toBe(true);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("snapshot e estados publicados são cópias profundas, incluindo warnings/source e NaN", async () => {
    const invoice = parsed();
    invoice.transactions[0]!.value = Number.NaN;
    invoice.transactions[0]!.warnings = ["MISSING_TRANSACTION_VALUE"];
    const { controller } = setup(invoice);
    await controller.loadFile(file());
    const state = controller.getState();
    state.transactions[0]!.warnings.push("CONTAMINAÇÃO");
    state.originalTransactions[0]!.source.page = 99;
    invoice.transactions[0]!.warnings.push("MUTAÇÃO DO PARSER");
    controller.deleteRow(0);
    controller.restoreOriginal();
    expect(controller.getState().transactions[0]).toMatchObject({ source: { page: 1 }, warnings: ["MISSING_TRANSACTION_VALUE"] });
    expect(controller.getState().transactions[0]?.value).toBeNaN();
  });

  it("copia conciliado e exige segunda ação para divergência; edição revoga confirmação", async () => {
    const { controller, copy } = setup();
    await controller.loadFile(file());
    await controller.requestCopy();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(controller.getState().copyStatus).toBe("copied");
    controller.editCell(0, "value", "10");
    await controller.confirmCopy();
    expect(copy).toHaveBeenCalledTimes(1);
    await controller.requestCopy();
    expect(controller.getState().copyStatus).toBe("confirmation-required");
    expect(copy).toHaveBeenCalledTimes(1);
    controller.editCell(0, "value", "20");
    await controller.confirmCopy();
    expect(copy).toHaveBeenCalledTimes(1);
    await controller.requestCopy();
    await controller.confirmCopy();
    expect(copy).toHaveBeenCalledTimes(2);
    expect(copy.mock.calls[1]?.[0]).toMatchObject([{ value: 20 }]);
  });

  it.each(["date", "warnings", "value"])("extração suspeita por %s exige confirmação", async (field) => {
    const invoice = parsed();
    if (field === "date") invoice.transactions[0]!.date = "";
    if (field === "warnings") invoice.transactions[0]!.warnings = ["REVIEW_REQUIRED"];
    if (field === "value") invoice.transactions[0]!.value = Number.NaN;
    const { controller, copy } = setup(invoice);
    await controller.loadFile(file());
    await controller.requestCopy();
    expect(copy).not.toHaveBeenCalled();
    expect(controller.getState().copyStatus).toBe("confirmation-required");
    await controller.confirmCopy();
    expect(copy).toHaveBeenCalledTimes(1);
  });
});
