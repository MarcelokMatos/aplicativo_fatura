import { describe, expect, it } from "vitest";
import { reconcileInvoice } from "../src/domain/reconciliation";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { compactInvoice } from "./fixtures/bradesco-compact.synthetic";

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
});
