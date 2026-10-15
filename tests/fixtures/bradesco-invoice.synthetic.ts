import type { PdfPageText, PdfTextItem } from "../../src/pdf/pdf-types";

// Dados inteiramente inventados. As colunas da segunda página mudam de posição.
export type SyntheticRow = readonly (readonly [x: number, text: string])[];

export function syntheticPage(pageNumber: number, rows: readonly SyntheticRow[]): PdfPageText {
  return {
    pageNumber, width: 700, height: 900,
    items: rows.flatMap((row, index) => row.map(([x, text]): PdfTextItem => ({
      text, page: pageNumber, x, y: 860 - index * 20, width: text.length * 4, height: 10,
    }))),
  };
}

export const columns: SyntheticRow = [
  [20, "Data"], [80, "Histórico"], [300, "Moeda de origem"],
  [405, "US$"], [465, "Cotação US$"], [565, "R$"],
];

export const invoiceIntro: SyntheticRow[] = [
  [[20, "Bradesco Cartões"]],
  [[20, "Vencimento"], [220, "10/01/2026"]],
  [[20, "Compras e débitos"], [565, "470,00"]],
  [[20, "Total da fatura"], [565, "450,00"]],
];

export function singleTableInvoice(rows: readonly SyntheticRow[]): PdfPageText[] {
  return [syntheticPage(1, [...invoiceIntro, columns, ...rows])];
}

export const bradescoInvoice: PdfPageText[] = [
  syntheticPage(1, [
    ...invoiceIntro,
    [[20, "Cartão sintético A"]],
    [[20, "TITULAR SINTÉTICO A"]],
    [[20, "**** **** **** XXXX"]],
    columns,
    [[20, "12/12"], [80, "LOJA SINTÉTICA A 02/10"], [565, "100,00"]],
    [[20, "13/12"], [80, "SERVIÇO SINTÉTICO B"], [300, "10,00"], [405, "12,00"], [465, "5,00"], [565, "60,00"]],
    [[20, "14/12"], [80, "ESTORNO SINTÉTICO"], [565, "20,00-"]],
    [[20, "15/12"], [80, "LOJA SINTÉTICA DUPLA"], [565, "50,00"]],
    [[20, "15/12"], [80, "LOJA SINTÉTICA DUPLA"], [565, "50,00"]],
    [[20, "01/01"], [80, "SALDO ANTERIOR"], [565, "99,00"]],
    [[20, "02/01"], [80, "PAGAMENTO POR DÉBITO EM CONTA"], [565, "99,00-"]],
    [[20, "Total para cartão sintético A"], [565, "240,00"]],
  ]),
  syntheticPage(2, [
    [[20, "Bradesco Cartões - continuação"]],
    [[20, "Cartão sintético B"]],
    [[20, "TITULAR SINTÉTICO B"]],
    columns.map(([x, text]) => [x + 17, text] as const),
    [[37, "03/01"], [97, "LOJA SINTÉTICA C"], [317, "80,00"]],
    [[37, "04/01"], [97, "LOJA/SINTÉTICA D"], [582, "130,00"]],
    [[37, "05/01"], [97, "LINHA SINTÉTICA INCOMPLETA"]],
    [[20, "Subtotal"], [582, "210,00"]],
    [[20, "Limite disponível"], [582, "999,00"]],
    [[20, "Mensagem administrativa sintética"]],
  ]),
];
