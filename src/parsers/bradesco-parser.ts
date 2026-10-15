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

function readReferenceDate(line: PdfTextLine): string | null {
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

export function parseBradescoInvoice(pages: PdfPageText[]): ParsedInvoice {
  const pageLines = [...pages].sort((a, b) => a.pageNumber - b.pageNumber).map((page) => groupTextItemsIntoLines(page));
  const lines = pageLines.flat();
  const result: ParsedInvoice = {
    transactions: [],
    summary: { referenceDate: "", purchasesAndDebits: null, invoiceTotal: null },
    diagnostics: [],
    recognizedLayout: false,
  };
  if (!lines.some((line) => /\bbradesco\b/.test(normalizeLayoutText(line.text))) || !lines.some((line) => detectBradescoColumns(line))) {
    result.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED", message: "Marcadores essenciais do layout Bradesco ausentes." });
    return result;
  }
  result.recognizedLayout = true;

  for (const line of lines) {
    const text = normalizeLayoutText(line.text);
    if (/^vencimento\b/.test(text)) {
      const referenceDate = readReferenceDate(line);
      if (referenceDate) result.summary.referenceDate = referenceDate;
      else result.diagnostics.push({ severity: "error", code: "INVALID_REFERENCE_DATE", message: "Data de referência inválida.", page: line.page, line: line.line });
    }
    if (/^compras e debitos\b/.test(text)) result.summary.purchasesAndDebits = readSummaryAmount(line);
    if (/^total da fatura\b/.test(text)) result.summary.invoiceTotal = readSummaryAmount(line);
  }
  if (result.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_REFERENCE_DATE")) return result;
  if (!result.summary.referenceDate) {
    result.diagnostics.push({ severity: "error", code: "REFERENCE_DATE_MISSING", message: "Data de referência ausente; não é possível inferir o ano dos lançamentos." });
    return result;
  }
  const referenceDate = new Date(`${result.summary.referenceDate}T00:00:00Z`);

  for (const page of pageLines) {
    let columns: BradescoColumns | null = null;
    for (const line of page) {
      const detected = detectBradescoColumns(line);
      if (detected) {
        columns = detected;
        continue;
      }
      if (!/^\d{2}\/\d{2}\b/.test(line.text)) continue;
      if (!columns) {
        if (isAdministrativeLine(line.text.slice(5).trim())) continue;
        result.recognizedLayout = false;
        result.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED", message: "Linha candidata fora de região com colunas reconhecidas.", page: line.page, line: line.line });
        continue;
      }
      const cells = readBradescoColumns(line, columns);
      if (!/^\d{2}\/\d{2}$/.test(cells.date) || !cells.history || isAdministrativeLine(cells.history)) continue;

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
  }
  // Uma página incompatível invalida a extração inteira: evita sucesso parcial silencioso.
  if (!result.recognizedLayout) result.transactions = [];
  return result;
}
