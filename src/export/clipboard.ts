import type { InvoiceTransaction } from "../domain/transaction";

export const OUTPUT_HEADERS: readonly string[] = [
  "Data", "Histórico", "Moeda de origem", "US$", "Cotação US$", "R$", "Parcela", "Valor",
];

export function formatTransactionDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return "";
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

function formatNumber(value: number | null): string {
  return value !== null && Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

function formatHistory(history: string): string {
  const text = history.replace(/\r\n|[\t\r\n]/g, " ");
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

export function serializeTransactionsForClipboard(transactions: InvoiceTransaction[]): string {
  const rows = transactions.map((transaction) => [
    formatTransactionDate(transaction.date),
    formatHistory(transaction.history),
    formatNumber(transaction.originalCurrency),
    formatNumber(transaction.usd),
    formatNumber(transaction.usdRate),
    formatNumber(transaction.brl),
    "'" + transaction.installment,
    formatNumber(transaction.value),
  ].join("\t"));
  return [OUTPUT_HEADERS.join("\t"), ...rows].join("\n");
}

export async function copyTransactions(
  transactions: InvoiceTransaction[],
  clipboard?: Pick<Clipboard, "writeText">,
): Promise<{ copied: boolean; text: string }> {
  const text = serializeTransactionsForClipboard(transactions);
  try {
    const target = clipboard ?? (typeof navigator === "undefined" ? undefined : navigator.clipboard);
    if (!target) return { copied: false, text };
    await target.writeText(text);
    return { copied: true, text };
  } catch {
    return { copied: false, text };
  }
}
