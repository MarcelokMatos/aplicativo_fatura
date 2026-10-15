import { transactionIssues, validateCell } from "../app/invoice-controller";
import type { EditableField, InvoiceController } from "../app/invoice-controller";
import type { InvoiceTransaction } from "../domain/transaction";
import { formatTransactionDate, OUTPUT_HEADERS } from "../export/clipboard";

const fields: readonly EditableField[] = ["date", "history", "originalCurrency", "usd", "usdRate", "brl", "installment", "value"];

interface RowView {
  element: HTMLTableRowElement;
  index: number;
  transaction: InvoiceTransaction;
  editors: Map<EditableField, HTMLInputElement>;
  drafts: Map<EditableField, string>;
  warning: HTMLParagraphElement;
  remove: HTMLButtonElement;
}

function displayValue(row: InvoiceTransaction, field: EditableField): string {
  const value = row[field];
  return field === "date" ? formatTransactionDate(row.date)
    : value === null ? "" : typeof value === "number" ? String(value).replace(".", ",") : value;
}

export function transactionTable(controller: InvoiceController) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "Lançamentos editáveis; role horizontalmente para revisar as oito colunas");
  wrapper.tabIndex = 0;
  const table = document.createElement("table");
  const caption = table.createCaption();
  caption.textContent = "Revise as oito colunas. Datas: dd/mm/aaaa. Decimais: vírgula. Excluir remove somente a linha indicada.";
  const header = table.createTHead().insertRow();
  for (const label of OUTPUT_HEADERS) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    header.append(cell);
  }
  const body = table.createTBody();
  const views = new Map<number, RowView>();
  let reviewVersion = -1;
  const message = document.createElement("p");
  message.className = "warning";
  message.setAttribute("role", "alert");

  function invalidDrafts() {
    return [...views.values()].flatMap((view) => [...view.drafts]
      .filter(([field, text]) => !validateCell(field, text)).map(([field]) => ({ view, field })));
  }
  function refreshMessage() {
    message.textContent = invalidDrafts().length ? "Revise o valor antes de continuar." : "";
  }
  function refresh(view: RowView) {
    const issues = transactionIssues(view.transaction);
    for (const [column, field] of fields.entries()) {
      const editor = view.editors.get(field)!;
      const text = view.drafts.get(field) ?? displayValue(view.transaction, field);
      if (editor.value !== text) editor.value = text;
      const valid = validateCell(field, text);
      editor.setAttribute("aria-label", `${OUTPUT_HEADERS[column]}, linha ${view.index + 1}`);
      editor.setAttribute("aria-invalid", String(!valid));
      editor.setCustomValidity(!valid && view.drafts.has(field) ? "Revise o valor antes de continuar." : "");
      if (!valid && view.drafts.has(field)) issues.push(`${OUTPUT_HEADERS[column]}: revisão pendente`);
    }
    view.element.className = issues.length ? "suspect" : "";
    view.warning.textContent = issues.length ? `Linha suspeita: ${issues.join("; ")}` : "";
    view.warning.hidden = !issues.length;
    view.remove.textContent = `Excluir linha ${view.index + 1}`;
  }
  function createRow(transaction: InvoiceTransaction, index: number, id: number): RowView {
    const row = document.createElement("tr");
    const warning = document.createElement("p");
    warning.className = "warning";
    warning.id = `row-warning-${id}`;
    row.setAttribute("aria-describedby", warning.id);
    const remove = document.createElement("button");
    remove.type = "button";
    const view: RowView = { element: row, index, transaction, editors: new Map(), drafts: new Map(), warning, remove };
    remove.addEventListener("click", () => controller.deleteRow(view.index));
    fields.forEach((field, column) => {
      const cell = row.insertCell();
      const editor = document.createElement("input");
      const raw = transaction[field];
      editor.type = "text";
      if (typeof raw === "number" || raw === null) editor.inputMode = "decimal";
      view.editors.set(field, editor);
      editor.addEventListener("input", () => {
        view.drafts.set(field, editor.value);
        refresh(view);
        refreshMessage();
        controller.draftChanged();
      });
      editor.addEventListener("change", () => {
        const text = editor.value;
        view.drafts.set(field, text);
        if (validateCell(field, text)) {
          view.drafts.delete(field);
          controller.editCell(view.index, field, text);
        } else controller.draftChanged();
        refresh(view);
        refreshMessage();
      });
      cell.append(editor);
      if (field === "history") cell.append(remove, warning);
    });
    return view;
  }
  wrapper.append(table, message);
  return { element: wrapper,
    hasDrafts() { return [...views.values()].some((view) => view.drafts.size > 0); },
    update(rows: InvoiceTransaction[], rowIds: readonly number[], version: number) {
      if (version !== reviewVersion) {
        for (const view of views.values()) view.drafts.clear();
        reviewVersion = version;
      }
      const present = new Set(rowIds);
      for (const [id, view] of views) {
        if (!present.has(id)) { view.element.remove(); views.delete(id); }
      }
      rows.forEach((transaction, index) => {
        const id = rowIds[index]!;
        const view = views.get(id) ?? createRow(transaction, index, id);
        views.set(id, view);
        view.index = index;
        view.transaction = transaction;
        refresh(view);
        // Do not detach an existing editor during blur/change or pointer interactions.
        if (body.rows[index] !== view.element) body.insertBefore(view.element, body.rows[index] ?? null);
      });
      refreshMessage();
    },
    commitDrafts(): boolean {
      // Only user edits block copy; original parser issues can be explicitly overridden.
      const invalid = invalidDrafts()[0];
      if (invalid) {
        refreshMessage();
        invalid.view.editors.get(invalid.field)?.focus();
        return false;
      }
      const drafts = [...views.values()].flatMap((view) => [...view.drafts].map(([field, text]) => ({ view, field, text })));
      for (const { view, field, text } of drafts) {
        view.drafts.delete(field);
        controller.editCell(view.index, field, text);
      }
      return true;
    },
  };
}
