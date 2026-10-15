import { chooseTransactionValue, extractInstallment, inferTransactionDate, parseBrDecimal } from "../domain/normalization";
import type { InvoiceTransaction } from "../domain/transaction";
import { groupTextItemsIntoLines } from "../pdf/group-lines";
import type { PdfTextLine } from "../pdf/group-lines";
import type { PdfPageText } from "../pdf/pdf-types";
import { detectBradescoColumns, isAdministrativeLine, normalizeLayoutText, readBradescoColumns } from "./bradesco-layout";
import type { BradescoColumns } from "./bradesco-layout";

export interface InvoiceSummary {
  referenceDate: string;
  purchasesAndDebits: number | null;
  invoiceTotal: number | null;
}

export interface ParserDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  page?: number;
  line?: number;
}

export interface ParsedInvoice {
  transactions: InvoiceTransaction[];
  summary: InvoiceSummary;
  diagnostics: ParserDiagnostic[];
  recognizedLayout: boolean;
}

function readReferenceDate(line: Pick<PdfTextLine, "text">): string | null {
  const match = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(line.text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function readSummaryAmount(line: PdfTextLine): number | null {
  const match = /(-?[\d.]+,\d+-?)\s*$/.exec(line.text);
  return match ? parseBrDecimal(match[1]!) : null;
}

function hasCompactTableCandidate(lines: PdfTextLine[], columns: BradescoColumns, referenceDate: Date): boolean {
  return lines.some((line) => {
    if (!/^\d{2}\/\d{2}(?!\/)\b/.test(line.text) || isAdministrativeLine(line.text.slice(5).trim())) return false;
    const cells = readBradescoColumns(line, columns);
    if (!/^\d{2}\/\d{2}$/.test(cells.date) || !cells.history || isAdministrativeLine(cells.history)
      || parseBrDecimal(cells.brl) === null) return false;
    try {
      inferTransactionDate(cells.date, referenceDate);
      return true;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return false;
    }
  });
}

export function parseBradescoInvoice(pages: PdfPageText[]): ParsedInvoice {
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const pageLines = sortedPages.map((page) => groupTextItemsIntoLines(page));
  const lines = pageLines.flat();
  const result: ParsedInvoice = {
    transactions: [],
    summary: { referenceDate: "", purchasesAndDebits: null, invoiceTotal: null },
    diagnostics: [],
    recognizedLayout: false,
  };
  const pageColumns = pageLines.map((page) => page.map((line, index) => detectBradescoColumns(line, page[index - 1])));
  if (!lines.some((line) => /\bbradesco\b/.test(normalizeLayoutText(line.text))) || !pageColumns.some((page) => page.some(Boolean))) {
    result.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED", message: "Marcadores essenciais do layout Bradesco ausentes." });
    return result;
  }
  result.recognizedLayout = true;

  const references: Pick<PdfTextLine, "text" | "page" | "line">[] = [];
  let referenceLabels = 0;
  let invalidReference = false;
  for (const [pageIndex, page] of pageLines.entries()) {
    for (const line of page) {
      const text = normalizeLayoutText(line.text);
      const inlineLabel = /^vencimento\b/.test(text);
      const labels = line.items.filter((item) => normalizeLayoutText(item.text) === "vencimento");
      referenceLabels += Math.max(labels.length, inlineLabel ? 1 : 0);
      const inlineDates = inlineLabel ? line.text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? [] : [];
      if (inlineDates.length) {
        references.push(...inlineDates.map((text) => ({ text, page: line.page, line: line.line })));
      } else {
        if (inlineLabel && text !== "vencimento") invalidReference = true;
        for (const label of labels) {
          const candidates = sortedPages[pageIndex]!.items.filter((item) => label.y > item.y && label.y - item.y <= 40
            && Math.abs(item.x - label.x) <= 30 && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text.trim()));
          references.push(...candidates.map((item) => ({ text: item.text, page: line.page,
            line: page.find((candidate) => candidate.items.includes(item))!.line })));
        }
      }
      if (/^compras e debitos\b/.test(text)) result.summary.purchasesAndDebits = readSummaryAmount(line);
      if (/^total da fatura\b/.test(text)) result.summary.invoiceTotal = readSummaryAmount(line);
    }
  }
  if (referenceLabels > 1 || references.length > 1) {
    result.diagnostics.push({ severity: "error", code: "AMBIGUOUS_REFERENCE_DATE", message: "Mais de uma referência de vencimento encontrada; não é possível escolher com segurança." });
    return result;
  }
  const reference = references[0];
  const referenceValue = reference ? readReferenceDate(reference) : null;
  if (invalidReference || (reference && !referenceValue)) {
    result.diagnostics.push({ severity: "error", code: "INVALID_REFERENCE_DATE", message: "Data de referência inválida.",
      ...(reference ? { page: reference.page, line: reference.line } : {}) });
    return result;
  }
  if (!referenceValue) {
    result.diagnostics.push({ severity: "error", code: "REFERENCE_DATE_MISSING", message: "Data de referência ausente; não é possível inferir o ano dos lançamentos." });
    return result;
  }
  result.summary.referenceDate = referenceValue;
  const referenceDate = new Date(`${result.summary.referenceDate}T00:00:00Z`);

  const continuation: { columns: BradescoColumns | null; size: string } = { columns: null, size: "" };
  for (const [pageIndex, page] of pageLines.entries()) {
    const pageData = sortedPages[pageIndex]!;
    const size = `${pageData.width}:${pageData.height}`;
    let columns: BradescoColumns | null = continuation.columns?.compact && continuation.size === size
      && page.some((line) => /\bbradesco\b/.test(normalizeLayoutText(line.text)))
      && hasCompactTableCandidate(page, continuation.columns, referenceDate) ? continuation.columns : null;
    for (const [lineIndex, line] of page.entries()) {
      const detected = pageColumns[pageIndex]![lineIndex];
      if (detected) {
        columns = detected;
        continue;
      }
      if (!/^\d{2}\/\d{2}(?!\/)\b/.test(line.text)) continue;
      if (isAdministrativeLine(line.text.slice(5).trim())) continue;
      if (!columns) {
        result.recognizedLayout = false;
        result.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED", message: "Linha candidata fora de região com colunas reconhecidas.", page: line.page, line: line.line });
        continue;
      }
      const cells = readBradescoColumns(line, columns);
      if (isAdministrativeLine(cells.history)) continue;
      if (!/^\d{2}\/\d{2}$/.test(cells.date) || !cells.history) {
        const originalCurrencyX = columns.originalCurrency;
        const history = line.items.filter((item) => item.x < originalCurrencyX)
          .map((item) => item.text).join(" ").replace(/^\d{2}\/\d{2}\s*/, "").trim();
        if (!history || isAdministrativeLine(history)) continue;
        result.recognizedLayout = false;
        result.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED", message: "Linha candidata incompatível com os limites das colunas.", page: line.page, line: line.line });
        continue;
      }

      const warnings: string[] = [];
      const diagnose = (code: string, message: string, severity: ParserDiagnostic["severity"] = "error") => {
        if (!warnings.includes(code)) {
          warnings.push(code);
          result.diagnostics.push({ severity, code, message, page: line.page, line: line.line });
        }
      };
      let date = "";
      try {
        date = inferTransactionDate(cells.date, referenceDate);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        diagnose("INVALID_TRANSACTION_DATE", "Data do lançamento inválida; revise a linha.");
      }
      const amount = (name: "originalCurrency" | "usd" | "usdRate" | "brl") => {
        const value = parseBrDecimal(cells[name]);
        if (cells[name] && value === null) diagnose("INVALID_TRANSACTION_AMOUNT", "Coluna monetária inválida; revise a linha.", "warning");
        return value;
      };
      const originalCurrency = amount("originalCurrency");
      const usd = amount("usd");
      const usdRate = amount("usdRate");
      const brl = amount("brl");
      const value = chooseTransactionValue(brl, originalCurrency);
      if (value === null) diagnose("MISSING_TRANSACTION_VALUE", "Lançamento sem valor utilizável; revise a linha.");
      const installment = extractInstallment(cells.history);
      result.transactions.push({
        date, ...installment, originalCurrency, usd, usdRate, brl, value: value ?? Number.NaN,
        source: { page: line.page, line: line.line }, warnings,
      });
    }
    continuation.columns = columns;
    continuation.size = size;
  }
  // Uma página incompatível invalida a extração inteira: evita sucesso parcial silencioso.
  if (!result.recognizedLayout) result.transactions = [];
  return result;
}
