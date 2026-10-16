import { describe, expect, it } from "vitest";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { compactHistoryInvoice } from "./fixtures/bradesco-compact.synthetic";
import { singleTableInvoice } from "./fixtures/bradesco-invoice.synthetic";

describe("histórico, localidade e parcela no layout compacto sintético", () => {
  it("retira somente a localidade em coluna separada depois da parcela", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "PORTO SEGURO"], [160, "03/10"], [290, "CIDADE SINTÉTICA"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history: "PORTO SEGURO", value: 10, warnings: [] });
    expect(result.diagnostics).toEqual([]);
  });

  it("reconhece parcela antes da localidade e normaliza zeros à esquerda", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "LOJA INVENTADA"], [160, "03/10"], [290, "CIDADE SINTÉTICA"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ installment: "3/10", warnings: [] });
  });

  it("reconhece parcela estruturada depois da localidade", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "LOJA INVENTADA"], [260, "CIDADE SINTÉTICA"], [360, "03/10"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history: "LOJA INVENTADA", installment: "3/10", warnings: [] });
    expect(result.diagnostics).toEqual([]);
  });

  it("mantém palavras semelhantes a cidades dentro do nome fragmentado do estabelecimento", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "PORTO"], [94, "SEGURO"], [290, "PORTO"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history: "PORTO SEGURO", installment: "1/1", warnings: [] });
  });

  it.each(["LOJA/ONLINE", "LOJA 03/10 ONLINE"])("preserva barra interna em %s", (history) => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, history], [290, "LOCALIDADE INVENTADA"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history, installment: "1/1", warnings: [] });
  });

  it("não transforma barra interna do segmento de localidade em parcela", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "LOJA INVENTADA"], [260, "LOCAL"], [284, "03/10"], [308, "SINTÉTICO"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history: "LOJA INVENTADA", installment: "1/1", warnings: [] });
  });

  it("não perde texto quando não há estrutura separada de localidade", () => {
    const result = parseBradescoInvoice(compactHistoryInvoice([
      [[20, "05/01"], [70, "PORTO SEGURO CIDADE SINTÉTICA"], [450, "10,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({ history: "PORTO SEGURO CIDADE SINTÉTICA", installment: "1/1" });
  });

  it.each(["adjacente", "sobreposta"])("preserva e sinaliza localidade de geometria ambígua %s", (geometry) => {
    const pages = compactHistoryInvoice([
      [[20, "05/01"], [70, "ESTABELECIMENTO INVENTADO"], [290, "LOCALIDADE INCERTA"], [450, "10,00"]],
    ]);
    pages[0]!.items.find((item) => item.text === "ESTABELECIMENTO INVENTADO")!.width = geometry === "adjacente" ? 216 : 230;
    const result = parseBradescoInvoice(pages);
    expect(result.transactions[0]).toMatchObject({
      history: "ESTABELECIMENTO INVENTADO LOCALIDADE INCERTA", installment: "1/1", value: 10,
      warnings: ["AMBIGUOUS_HISTORY_LOCALITY"],
    });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "AMBIGUOUS_HISTORY_LOCALITY", severity: "warning" })]);
  });

  it("preserva todos os campos do layout padrão de seis colunas", () => {
    const result = parseBradescoInvoice(singleTableInvoice([
      [[20, "05/01"], [80, "PORTO SEGURO 03/10"], [300, "10,00"], [405, "12,00"], [465, "5,00"], [565, "60,00"]],
    ]));
    expect(result.transactions[0]).toMatchObject({
      history: "PORTO SEGURO", installment: "3/10", originalCurrency: 10, usd: 12, usdRate: 5, brl: 60, value: 60, warnings: [],
    });
    expect(result.diagnostics).toEqual([]);
  });
});
