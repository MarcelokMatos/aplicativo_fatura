import { transactionIssues } from "../app/invoice-controller";
import type { InvoiceController } from "../app/invoice-controller";
import { transactionTable } from "./transaction-table";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function action(label: string, handler: () => void) {
  const button = element("button", label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}
function money(value: number | null) {
  return value !== null && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "Indisponível";
}

export function renderApp(root: HTMLElement, controller: InvoiceController) {
  root.replaceChildren();
  root.append(element("h1", "Fatura do cartão"), element("p", "Seu PDF é processado somente neste aparelho"));
  const upload = element("section", "");
  upload.className = "upload-area";
  upload.setAttribute("aria-labelledby", "upload-title");
  const title = element("h2", "Selecionar ou arrastar fatura");
  title.id = "upload-title";
  const label = element("label", "Arquivo PDF da fatura");
  label.htmlFor = "invoice-file";
  const picker = document.createElement("input");
  picker.id = "invoice-file";
  picker.type = "file";
  picker.accept = "application/pdf";
  picker.setAttribute("aria-describedby", "upload-status");
  const status = element("p", "Selecione um PDF para começar.");
  status.id = "upload-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const load = (file: File | undefined) => { if (file) void controller.loadFile(file); };
  picker.addEventListener("change", () => { load(picker.files?.[0]); picker.value = ""; });
  upload.addEventListener("dragover", (event) => { event.preventDefault(); });
  upload.addEventListener("drop", (event) => { event.preventDefault(); load(event.dataTransfer?.files[0]); });
  upload.append(title, label, picker, status);
  const result = element("section", "");
  result.setAttribute("aria-label", "Revisão da extração");
  root.append(upload, result);
  return controller.subscribe((state) => {
    const active = document.activeElement;
    const editorLabel = active instanceof HTMLInputElement && result.contains(active)
      ? active.getAttribute("aria-label") : null;
    const selection = active instanceof HTMLInputElement ? active.selectionStart : null;
    result.replaceChildren();
    const messages = { idle: "Selecione um PDF para começar.", reading: "Lendo PDF localmente…",
      ready: "Extração disponível para revisão.", unsupported: "Modelo não suportado ou PDF sem texto extraível.",
      error: "Falha ao processar o arquivo." };
    status.textContent = messages[state.status];
    if (state.fileName) result.append(element("p", `Arquivo: ${state.fileName}`));
    if (state.diagnostics.length) {
      const diagnostics = element("pre", state.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
      diagnostics.className = "warning diagnostics";
      diagnostics.setAttribute("aria-label", "Diagnósticos técnicos selecionáveis");
      diagnostics.tabIndex = 0;
      result.append(diagnostics);
    }
    if (state.status !== "ready" || !state.reconciliation) return;
    const totals = state.reconciliation;
    const summary = element("dl", "");
    summary.className = "summary";
    const facts = [ ["Páginas", String(state.pageCount)], ["Lançamentos", String(state.transactions.length)],
      ["Positivos", money(totals.positiveTotal)], ["Negativos", money(totals.negativeTotal)],
      ["Líquido", money(totals.netTotal)], ["Controle", money(totals.controlTotal)], ["Diferença", money(totals.difference)] ];
    for (const [name, value] of facts) {
      const fact = element("div", "");
      fact.append(element("dt", name!), element("dd", value!));
      summary.append(fact);
    }
    const suspicious = state.transactions.some((row) => transactionIssues(row).length > 0) || state.diagnostics.length > 0;
    const balanced = totals.isBalanced && state.transactions.length > 0;
    const reconciliation = element("p", !balanced ? "Não conciliado. Revise os valores e a diferença."
      : suspicious ? "Totais coincidem, mas há dados suspeitos. Revise os avisos." : "Conciliado");
    reconciliation.className = !balanced || suspicious ? "warning" : "success";
    const table = transactionTable(state.transactions, controller);
    const actions = element("div", "");
    actions.className = "actions";
    const copy = action("Copiar tabela", () => { if (table.commitDrafts()) void controller.requestCopy(); });
    copy.disabled = !state.transactions.length || state.copyStatus === "copying";
    actions.append(action("Restaurar extração original", () => controller.restoreOriginal()), copy);
    result.append(summary, reconciliation, table.element, actions);
    const copyStatus = element("p", "");
    copyStatus.setAttribute("role", "status");
    copyStatus.setAttribute("aria-live", "polite");
    if (state.copyStatus === "confirmation-required") {
      copyStatus.className = "warning";
      copyStatus.textContent = "Há divergências ou dados suspeitos. A saída pode estar incompleta. Confirme a cópia após revisar.";
      actions.append(action("Copiar mesmo assim", () => { if (table.commitDrafts()) void controller.confirmCopy(); }));
    }
    if (state.copyStatus === "copying") copyStatus.textContent = "Copiando tabela…";
    if (state.copyStatus === "copied") copyStatus.textContent = "Tabela copiada. Cole os valores na sua planilha.";
    result.append(copyStatus);
    if (editorLabel) {
      const editor = Array.from(result.querySelectorAll("input"))
        .find((candidate) => candidate.getAttribute("aria-label") === editorLabel);
      editor?.focus();
      if (selection !== null) editor?.setSelectionRange(selection, selection);
    }
    if (state.copyStatus === "fallback") {
      copyStatus.textContent = "Cópia automática indisponível. Copie manualmente o texto selecionado.";
      const fallbackLabel = element("label", "Tabela tabulada para cópia manual");
      fallbackLabel.htmlFor = "clipboard-fallback";
      const fallback = document.createElement("textarea");
      fallback.id = "clipboard-fallback";
      fallback.readOnly = true;
      fallback.value = state.copyText;
      result.append(fallbackLabel, fallback);
      fallback.focus();
      fallback.select();
    }
  });
}
