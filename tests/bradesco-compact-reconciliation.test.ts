import { describe, expect, it } from "vitest";
import { reconcileInvoice } from "../src/domain/reconciliation";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { compactInvoice } from "./fixtures/bradesco-compact.synthetic";
import { syntheticPage } from "./fixtures/bradesco-invoice.synthetic";

// Somente dados inventados. Os itens adicionais simulam fragmentação do PDF.
function fragmentedSyntheticInvoice() {
  const pages = structuredClone(compactInvoice);
  const date = pages[1]!.items.find((item) => item.text === "03/01")!;
  pages[1]!.items.push({ ...date, text: "", x: 0, width: 0 });
  const credit = pages[1]!.items.find((item) => item.text === "20,00-")!;
  credit.text = "20,00";
  credit.width = 20;
  pages[1]!.items.push({ ...credit, text: "-", x: credit.x + credit.width + 2, width: 4 });
  pages.push(syntheticPage(4, [
    [[20, "Bradesco Cartões"]],
    [[20, "06/01"], [70, "PGTO. DA FATURA"], [326, "900,00 -"]],
    [[20, "Total para grupo inventado"]],
  ]));
  return pages;
}

describe("conciliação compacta com itens sintéticos fragmentados", () => {
  it("não perde compra quando item vazio precede a data", () => {
    const pages = structuredClone(compactInvoice);
    const date = pages[1]!.items.find((item) => item.text === "03/01")!;
    pages[1]!.items.push({ ...date, text: "", x: 0, width: 0 });
    const result = parseBradescoInvoice(pages);
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0]).toMatchObject({ date: "2026-01-03", history: "LOJA INVENTADA A", value: 100 });
    expect(result.diagnostics).toEqual([]);
  });

  it("preserva negativo em item separado imediatamente após o valor", () => {
    const pages = structuredClone(compactInvoice);
    const credit = pages[1]!.items.find((item) => item.text === "20,00-")!;
    credit.text = "20,00";
    credit.width = 20;
    pages[1]!.items.push({ ...credit, text: "-", x: credit.x + credit.width + 2, width: 4 });
    const result = parseBradescoInvoice(pages);
    expect(result.transactions[1]).toMatchObject({ brl: -20, value: -20 });
    expect(reconcileInvoice(result.transactions, 140).isBalanced).toBe(true);
  });

  it.each(["PGTO. DA FATURA", "PAGTO. POR DÉBITO"])("exclui pagamento abreviado %s e mantém compra incompleta", (payment) => {
    const pages = [...structuredClone(compactInvoice), syntheticPage(4, [
      [[20, "Bradesco Cartões"]],
      [[20, "06/01"], [70, payment], [326, "900,00 -"]],
      [[20, "07/01"], [70, "LOJA INVENTADA INCOMPLETA"]],
      [[20, "Total para grupo inventado"]],
    ])];
    const result = parseBradescoInvoice(pages);
    expect(result.transactions).toHaveLength(5);
    expect(result.transactions[4]).toMatchObject({ history: "LOJA INVENTADA INCOMPLETA", warnings: ["MISSING_TRANSACTION_VALUE"] });
    expect(result.transactions[4]!.value).toBeNaN();
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "MISSING_TRANSACTION_VALUE", page: 4 })]);
  });

  it("concilia sem omitir compras, perder crédito ou incluir pagamento administrativo", () => {
    const result = parseBradescoInvoice(fragmentedSyntheticInvoice());
    expect(result.recognizedLayout).toBe(true);
    expect(result.transactions.map(({ value }) => value)).toEqual([100, -20, 30, 30]);
    expect(result.diagnostics).toEqual([]);
    expect(reconcileInvoice(result.transactions, result.summary.invoiceTotal)).toMatchObject({ difference: 0, isBalanced: true });
  });
});
