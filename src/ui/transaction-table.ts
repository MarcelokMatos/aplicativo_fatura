import { transactionIssues, validateCell } from "../app/invoice-controller";
import type { EditableField, InvoiceController } from "../app/invoice-controller";
import type { InvoiceTransaction } from "../domain/transaction";
import { formatTransactionDate, OUTPUT_HEADERS } from "../export/clipboard";

const fields: readonly EditableField[] = ["date", "history", "originalCurrency", "usd", "usdRate", "brl", "installment", "value"];

export function transactionTable(rows: InvoiceTransaction[], controller: InvoiceController) {
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
  const pending = new Map<HTMLInputElement, { index: number; field: EditableField }>();
  rows.forEach((transaction, index) => {
    const row = body.insertRow();
    const issues = transactionIssues(transaction);
    if (issues.length) row.className = "suspect";
    fields.forEach((field, column) => {
      const cell = row.insertCell();
      const editor = document.createElement("input");
      const raw = transaction[field];
      editor.type = "text";
      editor.value = field === "date" ? formatTransactionDate(transaction.date)
        : raw === null ? "" : typeof raw === "number" ? String(raw).replace(".", ",") : raw;
      editor.setAttribute("aria-label", `${OUTPUT_HEADERS[column]}, linha ${index + 1}`);
      if (typeof raw === "number" || raw === null) editor.inputMode = "decimal";
      if (!validateCell(field, editor.value)) editor.setAttribute("aria-invalid", "true");
      editor.addEventListener("input", () => {
        pending.set(editor, { index, field });
        const valid = validateCell(field, editor.value);
        editor.setAttribute("aria-invalid", String(!valid));
        editor.setCustomValidity(valid ? "" : "Revise o valor antes de continuar.");
        message.textContent = valid ? "" : "Revise o valor antes de continuar.";
      });
      editor.addEventListener("change", () => {
        if (controller.editCell(index, field, editor.value)) pending.delete(editor);
      });
      cell.append(editor);
      if (field === "history") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = `Excluir linha ${index + 1}`;
        remove.addEventListener("click", () => controller.deleteRow(index));
        cell.append(remove);
        if (issues.length) {
          const warning = document.createElement("p");
          warning.className = "warning";
          warning.id = `row-warning-${index}`;
          warning.textContent = `Linha suspeita: ${issues.join("; ")}`;
          row.setAttribute("aria-describedby", warning.id);
          cell.append(warning);
        }
      }
    });
  });
  const message = document.createElement("p");
  message.className = "warning";
  message.setAttribute("role", "alert");
  wrapper.append(table, message);
  return { element: wrapper,
    commitDrafts(): boolean {
      // Only user edits block copy; original parser issues can be explicitly overridden.
      if ([...pending.keys()].some((editor) => !editor.checkValidity())) {
        message.textContent = "Revise o valor antes de continuar.";
        [...pending.keys()].find((editor) => !editor.checkValidity())?.focus();
        return false;
      }
      const drafts = [...pending].map(([editor, position]) => ({ ...position, text: editor.value }));
      pending.clear();
      for (const draft of drafts) controller.editCell(draft.index, draft.field, draft.text);
      return true;
    },
  };
}
