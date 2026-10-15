import { describe, expect, it } from "vitest";
import { reconcileInvoice } from "../src/domain/reconciliation";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { compactInvoice } from "./fixtures/bradesco-compact.synthetic";
import { syntheticPage } from "./fixtures/bradesco-invoice.synthetic";

describe("layout Bradesco compacto sintético", () => {
  it("reconhece cabeçalho em duas linhas, vencimento abaixo do rótulo e continuação", () => {
    const result = parseBradescoInvoice(compactInvoice);
    expect(result.recognizedLayout).toBe(true);
    expect(result.summary).toEqual({ referenceDate: "2026-01-10", purchasesAndDebits: null, invoiceTotal: 140 });
    expect(result.transactions.map(({ date, history, installment, value, originalCurrency, usd, usdRate, brl }) =>
      ({ date, history, installment, value, originalCurrency, usd, usdRate, brl }))).toEqual([
      { date: "2026-01-03", history: "LOJA INVENTADA A", installment: "2/10", value: 100, originalCurrency: null, usd: null, usdRate: null, brl: 100 },
      { date: "2026-01-04", history: "ESTORNO INVENTADO", installment: "1/1", value: -20, originalCurrency: null, usd: null, usdRate: null, brl: -20 },
      { date: "2026-01-05", history: "LOJA INVENTADA DUPLA", installment: "1/1", value: 30, originalCurrency: null, usd: null, usdRate: null, brl: 30 },
      { date: "2026-01-05", history: "LOJA INVENTADA DUPLA", installment: "1/1", value: 30, originalCurrency: null, usd: null, usdRate: null, brl: 30 },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(reconcileInvoice(result.transactions, result.summary.invoiceTotal).isBalanced).toBe(true);
  });

  it("exige o rótulo de cotação para interpretar US$ como cotação", () => {
    const pages = structuredClone(compactInvoice);
    pages[1]!.items = pages[1]!.items.filter((item) => item.text !== "Cotação");
    expect(parseBradescoInvoice(pages)).toMatchObject({ recognizedLayout: false, transactions: [] });
  });

  it("tolera centralização diferente das duas partes do cabeçalho de cotação", () => {
    const pages = structuredClone(compactInvoice);
    pages[1]!.items.find((item) => item.text === "Cotação")!.x -= 16;
    expect(parseBradescoInvoice(pages).recognizedLayout).toBe(true);
  });

  it("separa data e histórico quando o corpo começa antes do rótulo do histórico", () => {
    const pages = structuredClone(compactInvoice);
    for (const page of pages.slice(1)) {
      for (const item of page.items) {
        if (/^(?:LOJA|ESTORNO)/.test(item.text)) item.x = 58;
      }
    }
    const result = parseBradescoInvoice(pages);
    expect(result.recognizedLayout).toBe(true);
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0]).toMatchObject({ history: "LOJA INVENTADA A", value: 100 });
  });

  it("recusa herdar geometria para continuação de tamanho diferente", () => {
    const pages = structuredClone(compactInvoice);
    pages[2]!.width += 100;
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: false, transactions: [] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED", page: 3 }));
  });

  it("não transforma aviso datado de página timbrada não tabular em lançamento", () => {
    const pages = [...structuredClone(compactInvoice), syntheticPage(4, [
      [[20, "Bradesco Cartões"]],
      [[20, "06/01"], [70, "AVISO INVENTADO PARA CONFERÊNCIA"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: false, transactions: [] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED", page: 4 }));
    expect(result.diagnostics.some(({ code }) => code === "MISSING_TRANSACTION_VALUE")).toBe(false);
  });

  it("preserva candidata incompleta em continuação identificada por subtotal de cartão", () => {
    const pages = [...structuredClone(compactInvoice), syntheticPage(4, [
      [[20, "Bradesco Cartões"]],
      [[20, "06/01"], [70, "LOJA INVENTADA INCOMPLETA"]],
      [[20, "07/01"], [70, "LOJA INVENTADA DE CONTROLE"], [330, "30,00"]],
      [[20, "Total para grupo inventado"], [330, "30,00"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result.recognizedLayout).toBe(true);
    expect(result.transactions).toHaveLength(6);
    expect(result.transactions[4]).toMatchObject({ history: "LOJA INVENTADA INCOMPLETA", warnings: ["MISSING_TRANSACTION_VALUE"] });
    expect(result.transactions[4]!.value).toBeNaN();
    expect(result.transactions[5]).toMatchObject({ history: "LOJA INVENTADA DE CONTROLE", value: 30 });
  });

  it("recusa aviso datado com histórico e R$ alinhados em página timbrada sem marcador de tabela", () => {
    const pages = [...structuredClone(compactInvoice), syntheticPage(4, [
      [[20, "Bradesco Cartões"]],
      [[20, "06/01"], [70, "AVISO INVENTADO PARA CONFERÊNCIA"], [330, "30,00"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: false, transactions: [] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED", page: 4 }));
  });

  it("herda continuação marcada contendo somente uma candidata incompleta sem apagar anteriores", () => {
    const pages = [...structuredClone(compactInvoice), syntheticPage(4, [
      [[20, "Bradesco Cartões"]],
      [[20, "06/01"], [70, "LOJA INVENTADA INCOMPLETA"]],
      [[20, "Total para grupo inventado"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result.recognizedLayout).toBe(true);
    expect(result.transactions).toHaveLength(5);
    expect(result.transactions.slice(0, 4).map(({ value }) => value)).toEqual([100, -20, 30, 30]);
    expect(result.transactions[4]).toMatchObject({ history: "LOJA INVENTADA INCOMPLETA", warnings: ["MISSING_TRANSACTION_VALUE"] });
    expect(result.transactions[4]!.value).toBeNaN();
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "MISSING_TRANSACTION_VALUE", page: 4 })]);
  });

  it("rejeita vencimentos separados concorrentes entre páginas sem sobrescrever", () => {
    const pages = [syntheticPage(1, [
      [[20, "Bradesco Cartões"]], [[20, "Resumo"], [480, "Vencimento"]], [[480, "10/01/2026"]],
    ]), ...structuredClone(compactInvoice).slice(1), syntheticPage(4, [
      [[20, "Bradesco Cartões"]], [[20, "Resumo"], [480, "Vencimento"]], [[480, "11/02/2026"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result.summary.referenceDate).toBe("");
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "AMBIGUOUS_REFERENCE_DATE" }));
  });

  it("rejeita duas datas abaixo do mesmo rótulo com diagnóstico de ambiguidade", () => {
    const pages = structuredClone(compactInvoice);
    pages[0] = syntheticPage(1, [
      [[20, "Bradesco Cartões"]], [[20, "Resumo"], [480, "Vencimento"]],
      [[480, "10/01/2026"]], [[480, "11/01/2026"]],
    ]);
    const result = parseBradescoInvoice(pages);
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "AMBIGUOUS_REFERENCE_DATE" }));
  });

  it("aceita vencimento isolado em linha própria com a data válida abaixo", () => {
    const pages = structuredClone(compactInvoice);
    pages[0] = syntheticPage(1, [
      [[20, "Bradesco Cartões"]], [[480, "Vencimento"]], [[480, "10/01/2026"]],
    ]);
    const result = parseBradescoInvoice(pages);
    expect(result.summary.referenceDate).toBe("2026-01-10");
    expect(result.transactions).toHaveLength(4);
    expect(result.diagnostics).toEqual([]);
  });

  it.each([false, true])("diagnostica calendário inválido abaixo de rótulo isolado=%s", (isolated) => {
    const pages = structuredClone(compactInvoice);
    pages[0] = syntheticPage(1, [
      [[20, "Bradesco Cartões"]],
      isolated ? [[480, "Vencimento"]] : [[20, "Resumo"], [480, "Vencimento"]],
      [[480, "31/02/2026"]],
    ]);
    const result = parseBradescoInvoice(pages);
    expect(result.summary.referenceDate).toBe("");
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "INVALID_REFERENCE_DATE", severity: "error" })]);
  });

  it("mantém cotação opcional separada de R$ e do Valor", () => {
    const pages = structuredClone(compactInvoice);
    const amount = pages[1]!.items.find((item) => item.text === "100,00")!;
    pages[1]!.items.push({ ...amount, text: "5,00", x: 284, width: 16 });
    const result = parseBradescoInvoice(pages);
    expect(result.transactions[0]).toMatchObject({ usd: null, usdRate: 5, brl: 100, value: 100, warnings: [] });
  });

  it.each([
    { x: 323, usdRate: 9, brl: null, value: null },
    { x: 324, usdRate: null, brl: 9, value: 9 },
  ])("associa pela borda direita na fronteira cotação/R$: %j", ({ x, usdRate, brl, value }) => {
    const pages = structuredClone(compactInvoice);
    const amount = pages[1]!.items.find((item) => item.text === "100,00")!;
    Object.assign(amount, { text: "9,00", x, width: 16 });
    const row = parseBradescoInvoice(pages).transactions[0]!;
    expect(row).toMatchObject({ originalCurrency: null, usd: null, usdRate, brl });
    if (value === null) {
      expect(row.value).toBeNaN();
      expect(row.warnings).toContain("MISSING_TRANSACTION_VALUE");
    } else {
      expect(row.value).toBe(9);
      expect(row.warnings).toEqual([]);
    }
  });
});
