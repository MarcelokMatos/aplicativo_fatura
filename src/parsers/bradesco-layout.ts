import type { PdfTextLine } from "../pdf/group-lines";

export const COLUMN_NAMES = ["date", "history", "originalCurrency", "usd", "usdRate", "brl"] as const;
export type ColumnName = typeof COLUMN_NAMES[number];
export type BradescoColumns = Record<ColumnName, number>;

const HEADERS = ["data", "historico", "moeda de origem", "us$", "cotacao us$", "r$"] as const;

export function normalizeLayoutText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectBradescoColumns(line: PdfTextLine): BradescoColumns | null {
  const positions: number[] = [];
  let itemIndex = 0;
  for (const header of HEADERS) {
    let found = false;
    for (; itemIndex < line.items.length; itemIndex++) {
      let text = "";
      for (let end = itemIndex; end < line.items.length; end++) {
        text = normalizeLayoutText(`${text} ${line.items[end]!.text}`);
        if (text === header) {
          positions.push(line.items[itemIndex]!.x);
          itemIndex = end + 1;
          found = true;
          break;
        }
        if (!header.startsWith(text)) break;
      }
      if (found) break;
    }
    if (!found) return null;
  }
  if (positions.some((x, index) => index > 0 && x <= positions[index - 1]!)) return null;
  return Object.fromEntries(COLUMN_NAMES.map((name, index) => [name, positions[index]!])) as BradescoColumns;
}

export function readBradescoColumns(line: PdfTextLine, columns: BradescoColumns): Record<ColumnName, string> {
  return Object.fromEntries(COLUMN_NAMES.map((name, index) => {
    const next = COLUMN_NAMES[index + 1];
    const text = line.items
      .filter((item) => item.x >= columns[name] && (!next || item.x < columns[next]))
      .map((item) => item.text).join(" ").trim();
    return [name, text];
  })) as Record<ColumnName, string>;
}

// Pagamentos da fatura são administrativos; créditos/estornos reais ficam fora desta lista.
export function isAdministrativeLine(text: string): boolean {
  return /^(?:saldo anterior\b|pagamento (?:da fatura|por debito em conta)\b|total(?: para\b| geral\b| da fatura\b|$)|subtotal\b|limite\b|taxas informativas\b|mensagem administrativa\b)/.test(normalizeLayoutText(text));
}
