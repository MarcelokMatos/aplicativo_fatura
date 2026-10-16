import { describe, expect, it } from "vitest";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import {
  bradescoInvoice, columns, invoiceIntro, singleTableInvoice, syntheticPage,
} from "./fixtures/bradesco-invoice.synthetic";

describe("parseBradescoInvoice", () => {
  it("preserva ordem, duplicatas e oito campos em dois cartões e duas páginas", () => {
    const result = parseBradescoInvoice(bradescoInvoice);
    expect(result.recognizedLayout).toBe(true);
    expect(result.summary).toEqual({ referenceDate: "2026-01-10", purchasesAndDebits: 470, invoiceTotal: 450 });
    expect(result.transactions.map(({ source, warnings, ...fields }) => fields)).toEqual([
      { date: "2025-12-12", history: "LOJA SINTÉTICA A", originalCurrency: null, usd: null, usdRate: null, brl: 100, installment: "2/10", value: 100 },
      { date: "2025-12-13", history: "SERVIÇO SINTÉTICO B", originalCurrency: 10, usd: 12, usdRate: 5, brl: 60, installment: "1/1", value: 60 },
      { date: "2025-12-14", history: "ESTORNO SINTÉTICO", originalCurrency: null, usd: null, usdRate: null, brl: -20, installment: "1/1", value: -20 },
      { date: "2025-12-15", history: "LOJA SINTÉTICA DUPLA", originalCurrency: null, usd: null, usdRate: null, brl: 50, installment: "1/1", value: 50 },
      { date: "2025-12-15", history: "LOJA SINTÉTICA DUPLA", originalCurrency: null, usd: null, usdRate: null, brl: 50, installment: "1/1", value: 50 },
      { date: "2026-01-03", history: "LOJA SINTÉTICA C", originalCurrency: 80, usd: null, usdRate: null, brl: null, installment: "1/1", value: 80 },
      { date: "2026-01-04", history: "LOJA/SINTÉTICA D", originalCurrency: null, usd: null, usdRate: null, brl: 130, installment: "1/1", value: 130 },
      { date: "2026-01-05", history: "LINHA SINTÉTICA INCOMPLETA", originalCurrency: null, usd: null, usdRate: null, brl: null, installment: "1/1", value: Number.NaN },
    ]);
    expect(result.transactions[0]?.source).toEqual({ page: 1, line: 9 });
    expect(result.transactions[7]?.source).toEqual({ page: 2, line: 7 });
    expect(result.transactions[7]?.warnings).toContain("MISSING_TRANSACTION_VALUE");
    expect(result.diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "MISSING_TRANSACTION_VALUE", page: 2, line: 7 })]);
  });

  it("associa valores por x mesmo com itens fora de ordem e espaços no histórico", () => {
    const pages = singleTableInvoice([[[20, "05/01"], [80, "LOJA    SINTÉTICA 123,45"], [300, "9,00"], [565, "0,00"]]]);
    pages[0]!.items.reverse();
    expect(parseBradescoInvoice(pages).transactions[0]).toMatchObject({ history: "LOJA    SINTÉTICA 123,45", originalCurrency: 9, brl: 0, value: 0 });
  });

  it("preserva a ordem física das páginas pelo número, sem mutar a entrada", () => {
    const pages = structuredClone(bradescoInvoice).reverse();
    const before = structuredClone(pages);
    expect(parseBradescoInvoice(pages).transactions.map((row) => row.source.page)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
    expect(pages).toEqual(before);
  });

  it("tolera pequenos desvios y, cabeçalhos fragmentados e mudança de x", () => {
    const pages = singleTableInvoice([[[20, "05/01"], [80, "LOJA"], [130, "SINTÉTICA 03/12"], [565, "30,00"]]]);
    const header = pages[0]!.items.find((item) => item.text === "Moeda de origem")!;
    header.text = "Moeda de";
    pages[0]!.items.push({ ...header, text: "origem", x: 350 });
    pages[0]!.items.at(-2)!.y += 0.6;
    expect(parseBradescoInvoice(pages).transactions[0]).toMatchObject({ history: "LOJA SINTÉTICA", installment: "3/12", brl: 30 });
  });

  it.each([
    ["SESI FARMACIA FM 57402/02", "SESI FARMACIA FM 574", "2/2"],
    ["ASSOCIACAO CONGREGAC06/10", "ASSOCIACAO CONGREGAC", "6/10"],
  ])("reconhece parcela colada ao histórico montado no padrão: %s", (input, history, installment) => {
    const pages = singleTableInvoice([
      [[20, "05/01"], [80, input], [300, "10,00"], [405, "12,00"], [465, "5,00"], [565, "60,00"]],
    ]);
    const result = parseBradescoInvoice(pages);
    expect(result.recognizedLayout).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      history, installment, originalCurrency: 10, usd: 12, usdRate: 5, brl: 60, value: 60, warnings: [],
    });
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    "SALDO ANTERIOR", "PAGAMENTO DA FATURA", "PAGAMENTO POR DÉBITO EM CONTA",
    "TOTAL PARA CARTÃO SINTÉTICO", "SUBTOTAL", "TOTAL GERAL", "LIMITE DISPONÍVEL",
    "TAXAS INFORMATIVAS", "MENSAGEM ADMINISTRATIVA",
  ])("exclui explicitamente a linha administrativa datada %s", (history) => {
    expect(parseBradescoInvoice(singleTableInvoice([[[20, "05/01"], [80, history], [565, "10,00"]]])).transactions).toEqual([]);
  });

  it("ignora cabeçalhos, titular, cartão e linha sem histórico; preserva crédito real", () => {
    const result = parseBradescoInvoice(singleTableInvoice([
      columns, [[20, "TITULAR SINTÉTICO"]], [[20, "**** **** XXXX"]],
      [[20, "05/01"], [565, "10,00"]],
      [[20, "05/01"], [80, "CRÉDITO SINTÉTICO"], [565, "-10,00"]],
    ]));
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ history: "CRÉDITO SINTÉTICO", value: -10 });
  });

  it.each(["", "inválido"])("mantém candidata com valor R$ '%s' sem fabricar zero", (amount) => {
    const result = parseBradescoInvoice(singleTableInvoice([[[20, "05/01"], [80, "LOJA SINTÉTICA"], [565, amount]]]));
    expect(result.transactions[0]?.value).toBeNaN();
    expect(result.transactions[0]?.warnings).toContain("MISSING_TRANSACTION_VALUE");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "MISSING_TRANSACTION_VALUE", page: 1, line: 6 }));
  });

  it("não oculta coluna opcional inválida quando existe R$ utilizável", () => {
    const result = parseBradescoInvoice(singleTableInvoice([[[20, "05/01"], [80, "LOJA SINTÉTICA"], [405, "inválido"], [565, "10,00"]]]));
    expect(result.transactions[0]).toMatchObject({ usd: null, value: 10, warnings: ["INVALID_TRANSACTION_AMOUNT"] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "INVALID_TRANSACTION_AMOUNT", severity: "warning" }));
  });

  it.each(["31/02", "29/02", "00/01", "05/13"])("converte RangeError de %s em diagnóstico e preserva a candidata", (date) => {
    const result = parseBradescoInvoice(singleTableInvoice([[[20, date], [80, "LOJA SINTÉTICA"], [565, "10,00"]]]));
    expect(result.transactions[0]).toMatchObject({ date: "", history: "LOJA SINTÉTICA", value: 10, warnings: ["INVALID_TRANSACTION_DATE"] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "INVALID_TRANSACTION_DATE", severity: "error", page: 1, line: 6 }));
  });

  it.each(["bradesco", "columns"])("falha seguramente sem o marcador essencial %s", (missing) => {
    const pages = singleTableInvoice([[[20, "05/01"], [80, "LOJA SINTÉTICA"], [565, "10,00"]]]);
    pages[0]!.items = pages[0]!.items.filter((item) => missing === "bradesco" ? item.text !== "Bradesco Cartões" : item.text !== "Cotação US$");
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: false, transactions: [] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED", severity: "error" }));
  });

  it("falha seguramente com documento vazio", () => {
    expect(parseBradescoInvoice([])).toMatchObject({ recognizedLayout: false, transactions: [], diagnostics: [expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED" })] });
  });

  it("exige referência em vez de inferir ano pela data atual", () => {
    const pages = singleTableInvoice([[[20, "05/01"], [80, "LOJA SINTÉTICA"], [565, "10,00"]]]);
    pages[0]!.items = pages[0]!.items.filter((item) => item.y !== 840);
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: true, transactions: [], summary: { referenceDate: "" } });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "REFERENCE_DATE_MISSING", severity: "error" }));
  });

  it("rejeita referência calendário inválida", () => {
    const pages = singleTableInvoice([]);
    pages[0]!.items.find((item) => item.text === "10/01/2026")!.text = "31/02/2026";
    const result = parseBradescoInvoice(pages);
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "INVALID_REFERENCE_DATE", severity: "error" }));
  });

  it("não transforma resumo ausente em controle zero", () => {
    const pages = [syntheticPage(1, [invoiceIntro[0]!, invoiceIntro[1]!, columns])];
    expect(parseBradescoInvoice(pages).summary).toEqual({ referenceDate: "2026-01-10", purchasesAndDebits: null, invoiceTotal: null });
  });

  it("não interpreta candidatos em região anterior ao cabeçalho", () => {
    const pages = [syntheticPage(1, [...invoiceIntro, [[20, "05/01"], [80, "MENSAGEM ADMINISTRATIVA"], [565, "10,00"]], columns])];
    expect(parseBradescoInvoice(pages).transactions).toEqual([]);
  });

  it("recusa página de continuação com candidata sem colunas reconhecíveis", () => {
    const pages = [...singleTableInvoice([]), syntheticPage(2, [[[20, "05/01"], [80, "LOJA SINTÉTICA"], [565, "10,00"]]])];
    const result = parseBradescoInvoice(pages);
    expect(result).toMatchObject({ recognizedLayout: false, transactions: [] });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "LAYOUT_NOT_RECOGNIZED", page: 2 }));
  });

  it.each([
    { dateX: 19, historyX: 80 },
    { dateX: 20, historyX: 79 },
  ])("diagnostica candidata que cruza o limite das colunas: %j", ({ dateX, historyX }) => {
    const result = parseBradescoInvoice(singleTableInvoice([
      [[20, "04/01"], [80, "LOJA SINTÉTICA VÁLIDA"], [565, "5,00"]],
      [[dateX, "05/01"], [historyX, "LOJA SINTÉTICA DESLOCADA"], [565, "10,00"]],
    ]));
    expect(result.recognizedLayout).toBe(false);
    expect(result.transactions).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "error", code: "LAYOUT_NOT_RECOGNIZED", page: 1, line: 7,
    }));
  });

  it.each([
    { dateX: 19, historyX: 80 },
    { dateX: 20, historyX: 79 },
  ])("continua excluindo administrativo deslocado: %j", ({ dateX, historyX }) => {
    const result = parseBradescoInvoice(singleTableInvoice([
      [[dateX, "05/01"], [historyX, "PAGAMENTO DA FATURA"], [565, "10,00-"]],
    ]));
    expect(result).toMatchObject({ recognizedLayout: true, transactions: [], diagnostics: [] });
  });
});
