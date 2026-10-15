import { syntheticPage } from "./bradesco-invoice.synthetic";

// Tudo inventado: apenas cabeçalho compacto, alinhamento à direita e continuação
// sem cabeçalho reproduzem a classe estrutural investigada localmente.
export const compactInvoice = [
  syntheticPage(1, [
    [[20, "Bradesco Cartões"]],
    [[20, "Resumo"], [480, "Vencimento"]],
    [[480, "10/01/2026"]],
    [[20, "Total da fatura"], [340, "140,00"]],
  ]),
  syntheticPage(2, [
    [[20, "Bradesco Cartões"]],
    [[280, "Cotação"]],
    [[20, "Data"], [70, "Histórico de Lançamentos"], [280, "US$"], [340, "R$"]],
    [[20, "03/01"], [70, "LOJA INVENTADA A 02/10"], [326, "100,00"]],
    [[20, "04/01"], [70, "ESTORNO INVENTADO"], [326, "20,00-"]],
    [[20, "05/01"], [70, "LOJA INVENTADA DUPLA"], [330, "30,00"]],
  ]),
  syntheticPage(3, [
    [[20, "Bradesco Cartões"]],
    [[20, "05/01"], [70, "LOJA INVENTADA DUPLA"], [330, "30,00"]],
    [[20, "Total para cartão sintético"], [330, "140,00"]],
  ]),
];
