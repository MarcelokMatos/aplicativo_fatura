import { chooseTransactionValue, parseBrDecimal } from "../domain/normalization";
import { reconcileInvoice } from "../domain/reconciliation";
import type { ReconciliationResult } from "../domain/reconciliation";
import type { InvoiceTransaction } from "../domain/transaction";
import { copyTransactions, formatTransactionDate, serializeTransactionsForClipboard } from "../export/clipboard";
import type { ParsedInvoice, ParserDiagnostic } from "../parsers/bradesco-parser";
import type { PdfPageText } from "../pdf/pdf-types";

export type AppStatus = "idle" | "reading" | "ready" | "unsupported" | "error";
export type EditableField = Exclude<keyof InvoiceTransaction, "source" | "warnings">;
export interface InvoiceAppState {
  status: AppStatus;
  fileName: string | null;
  pageCount: number;
  transactions: InvoiceTransaction[];
  reconciliation: ReconciliationResult | null;
  diagnostics: ParserDiagnostic[];
  originalTransactions: InvoiceTransaction[];
  copyStatus: "idle" | "confirmation-required" | "copying" | "copied" | "fallback";
  copyText: string;
}
interface Dependencies {
  extract: (data: ArrayBuffer) => Promise<PdfPageText[]>;
  parse: (pages: PdfPageText[]) => ParsedInvoice;
  copy?: (rows: InvoiceTransaction[]) => Promise<{ copied: boolean; text: string }>;
}

function cloneRows(rows: InvoiceTransaction[]): InvoiceTransaction[] {
  // JSON cloning would silently replace NaN with null.
  return rows.map((row) => ({ ...row, source: { ...row.source }, warnings: [...row.warnings] }));
}

function editedValue(field: EditableField, text: string): string | number | null | undefined {
  const trimmed = text.trim();
  if (field === "date") {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!match) return undefined;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    return formatTransactionDate(iso) ? iso : undefined;
  }
  if (field === "history") return trimmed ? text : undefined;
  if (field === "installment") {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
    if (!match) return undefined;
    const current = Number(match[1]);
    const total = Number(match[2]);
    return current >= 1 && current <= total ? `${current}/${total}` : undefined;
  }
  if (!trimmed) return field === "value" ? undefined : null;
  return parseBrDecimal(trimmed) ?? undefined;
}

export function validateCell(field: EditableField, text: string): boolean {
  return editedValue(field, text) !== undefined;
}

export function transactionIssues(row: InvoiceTransaction): string[] {
  const issues = [...row.warnings];
  if (!formatTransactionDate(row.date)) issues.push("Data ausente ou inválida");
  if (!row.history.trim()) issues.push("Histórico ausente");
  if (!validateCell("installment", row.installment)) issues.push("Parcela inválida");
  for (const field of ["originalCurrency", "usd", "usdRate", "brl", "value"] as const) {
    if (row[field] !== null && !Number.isFinite(row[field])) issues.push("Valor monetário inválido");
  }
  return [...new Set(issues)];
}

export function createInvoiceController(dependencies: Dependencies) {
  let state: InvoiceAppState = {
    status: "idle", fileName: null, pageCount: 0, transactions: [], originalTransactions: [],
    reconciliation: null, diagnostics: [], copyStatus: "idle", copyText: "",
  };
  let controlTotal: number | null = null;
  let revision = 0;
  const listeners = new Set<(state: InvoiceAppState) => void>();
  const getState = (): InvoiceAppState => ({ ...state,
    transactions: cloneRows(state.transactions), originalTransactions: cloneRows(state.originalTransactions),
    reconciliation: state.reconciliation ? { ...state.reconciliation } : null,
    diagnostics: state.diagnostics.map((item) => ({ ...item })),
  });
  const emit = () => { for (const listener of listeners) listener(getState()); };
  function changed() {
    revision += 1;
    state.copyStatus = "idle";
    state.copyText = "";
    state.reconciliation = reconcileInvoice(state.transactions, controlTotal);
    emit();
  }
  async function loadFile(file: File) {
    const request = ++revision;
    state = { status: "reading", fileName: file.name, pageCount: 0, transactions: [],
      originalTransactions: [], reconciliation: null, diagnostics: [], copyStatus: "idle", copyText: "" };
    if ((file.type && file.type !== "application/pdf") || !/\.pdf$/i.test(file.name)) {
      state.status = "error";
      state.diagnostics = [{ severity: "error", code: "PDF_REQUIRED", message: "Selecione um arquivo PDF." }];
      emit();
      return;
    }
    emit();
    try {
      const pages = await dependencies.extract(await file.arrayBuffer());
      if (request !== revision) return;
      state.pageCount = pages.length;
      const invoice = dependencies.parse(pages);
      state.diagnostics = invoice.diagnostics.map((item) => ({ ...item }));
      if (!invoice.recognizedLayout || !pages.some((page) => page.items.some((item) => item.text.trim()))) {
        state.status = "unsupported";
        if (!state.diagnostics.length) state.diagnostics.push({ severity: "error", code: "LAYOUT_NOT_RECOGNIZED",
          message: "PDF sem texto extraível ou layout não suportado." });
      } else {
        state.status = "ready";
        state.transactions = cloneRows(invoice.transactions);
        state.originalTransactions = cloneRows(invoice.transactions);
        controlTotal = invoice.summary.purchasesAndDebits ?? invoice.summary.invoiceTotal;
        state.reconciliation = reconcileInvoice(state.transactions, controlTotal);
      }
    } catch {
      if (request !== revision) return;
      state.status = "error";
      state.transactions = [];
      state.originalTransactions = [];
      state.reconciliation = null;
      // Error messages from PDF libraries can contain document data. Use a safe technical code.
      state.diagnostics = [{ severity: "error", code: "PDF_PROCESSING_FAILED",
        message: "Não foi possível ler o PDF. Tente novamente com um PDF de texto válido." }];
    }
    emit();
  }
  function editCell(index: number, field: EditableField, text: string): boolean {
    const row = state.transactions[index];
    const value = editedValue(field, text);
    if (state.status !== "ready" || !row || value === undefined) return false;
    if (field === "date" || field === "history" || field === "installment") row[field] = value as string;
    else if (field === "value") row.value = value as number;
    else row[field] = value as number | null;
    if (field === "brl" || field === "originalCurrency") {
      row.value = chooseTransactionValue(row.brl, row.originalCurrency) ?? Number.NaN;
    }
    changed();
    return true;
  }
  async function performCopy() {
    const request = revision;
    const rows = cloneRows(state.transactions);
    state.copyStatus = "copying";
    emit();
    let result: { copied: boolean; text: string };
    try { result = await (dependencies.copy ?? copyTransactions)(rows); }
    catch { result = { copied: false, text: serializeTransactionsForClipboard(rows) }; }
    if (request !== revision) return;
    state.copyStatus = result.copied ? "copied" : "fallback";
    state.copyText = result.text;
    emit();
  }
  function canCopy() { return state.status === "ready" && state.transactions.length > 0 && state.copyStatus !== "copying"; }
  return {
    getState, loadFile, editCell,
    subscribe(listener: (state: InvoiceAppState) => void) {
      listeners.add(listener);
      listener(getState());
      return () => { listeners.delete(listener); };
    },
    deleteRow(index: number) {
      if (state.status !== "ready" || !state.transactions[index]) return;
      state.transactions.splice(index, 1);
      changed();
    },
    restoreOriginal() {
      if (state.status !== "ready") return;
      state.transactions = cloneRows(state.originalTransactions);
      changed();
    },
    async requestCopy() {
      if (!canCopy()) return;
      if (!state.reconciliation?.isBalanced || state.transactions.some((row) => transactionIssues(row).length > 0)
        || state.diagnostics.length > 0) {
        state.copyStatus = "confirmation-required";
        emit();
        return;
      }
      await performCopy();
    },
    async confirmCopy() {
      if (canCopy() && state.copyStatus === "confirmation-required") await performCopy();
    },
  };
}
export type InvoiceController = ReturnType<typeof createInvoiceController>;
