import type { PdfTextLine } from "../pdf/group-lines";

export const COLUMN_NAMES = ["date", "history", "originalCurrency", "usd", "usdRate", "brl"] as const;
export type ColumnName = typeof COLUMN_NAMES[number];
export type BradescoColumns = Record<ColumnName, number> & { compact?: boolean };

const HEADERS = ["data", "historico", "moeda de origem", "us$", "cotacao us$", "r$"] as const;

export function normalizeLayoutText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectBradescoColumns(line: PdfTextLine, previous?: PdfTextLine): BradescoColumns | null {
  const find = (label: string) => line.items.find((item) => normalizeLayoutText(item.text) === label);
  const date = find("data");
  const history = find("historico de lancamentos");
  const rate = find("us$");
  const brl = find("r$");
  if (date && history && rate && brl && date.x < history.x && history.x < rate.x && rate.x < brl.x
    && previous && previous.y > line.y && previous.y - line.y <= 24
    && previous.items.some((item) => normalizeLayoutText(item.text) === "cotacao"
      && Math.abs(item.x - rate.x) < (brl.x - rate.x) / 2)) {
    return { date: date.x, history: history.x, originalCurrency: rate.x, usd: rate.x, usdRate: rate.x, brl: brl.x, compact: true };
  }
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
  return Object.fromEntries(COLUMN_NAMES.map((name, index) => [name, positions[index]!])) as Record<ColumnName, number>;
}

export function readBradescoColumns(line: PdfTextLine, columns: BradescoColumns): Record<ColumnName, string> & { historyAmbiguous?: boolean } {
  if (columns.compact) {
    const historyStart = (columns.date + columns.history) / 2;
    const right = columns.brl + (columns.brl - columns.usdRate) / 2;
    const items = line.items.filter((item) => item.text.trim() && item.x <= right);
    const monetary = (item: typeof items[number]) => /^-?[\d.]+,\d+-?$/.test(item.text.trim())
      && item.x + item.width >= columns.usdRate;
    const join = (selected: typeof items) => selected.map((item) => item.text).join(" ").trim();
    const historyItems = items.filter((item) => item.x >= historyStart && item.x < columns.usdRate && !monetary(item));
    const installment = (item: typeof items[number]) => /^\d{1,2}\/\d{1,2}$/.test(item.text.trim());
    // No compacto, a faixa posterior do histórico contém a coluna sem rótulo
    // de localidade. Só separe quando houver estabelecimento antes dela e um
    // vão maior que a altura do texto, sem sobreposição de nenhum fragmento.
    const localityBoundary = (columns.history + columns.usdRate) / 2;
    const localityIndex = historyItems.findIndex((item) => item.x >= localityBoundary && !installment(item));
    const locality = historyItems[localityIndex];
    const beforeLocality = historyItems.slice(0, localityIndex);
    const separated = locality && localityIndex > 0 && beforeLocality.every((item) =>
      locality.x - (item.x + item.width) > Math.max(Math.abs(item.height), Math.abs(locality.height)));
    const history = separated
      ? [...beforeLocality, ...historyItems.slice(-1).filter(installment)]
      : historyItems;
    const joinAmounts = (selected: typeof items) => selected.map((item) => {
      const next = items[items.indexOf(item) + 1];
      const text = item.text.trim();
      const edge = item.x + item.width;
      const lower = edge < columns.brl ? columns.usdRate : columns.brl;
      const upper = edge < columns.brl ? columns.brl : right;
      const gap = next ? next.x - edge : Number.POSITIVE_INFINITY;
      const tolerance = next ? Math.min(Math.abs(item.height), Math.abs(next.height)) / 2 : 0;
      const appendMinus = !text.includes("-") && next?.text.trim() === "-"
        && gap >= 0 && gap <= tolerance && next.x >= lower && next.x + next.width <= upper;
      return `${text}${appendMinus ? "-" : ""}`;
    }).join(" ");
    return {
      date: join(items.filter((item) => item.x >= columns.date && item.x < historyStart)),
      history: join(history),
      historyAmbiguous: !!locality && !separated,
      originalCurrency: "", usd: "",
      usdRate: joinAmounts(items.filter((item) => monetary(item) && item.x + item.width < columns.brl)),
      brl: joinAmounts(items.filter((item) => monetary(item) && item.x + item.width >= columns.brl)),
    };
  }
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
  return /^(?:saldo anterior\b|pagamento (?:da fatura|por debito em conta)\b|(?:pagto|pgto)\b[.\s:]+(?:da\s+fatura|por\s+debito|por\s+deb\b[.\s:]+(?:em\s+)?(?:conta|c\/c))\b|total(?: para\b| geral\b| da fatura\b|$)|subtotal\b|limite\b|taxas informativas\b|mensagem administrativa\b)/.test(normalizeLayoutText(text));
}
