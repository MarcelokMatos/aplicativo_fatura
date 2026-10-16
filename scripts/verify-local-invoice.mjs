import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

// Este processo só publica o esquema agregado abaixo. Bibliotecas e erros podem
// conter texto do documento ou caminhos locais; suas saídas não são encaminhadas.
const writeReport = process.stdout.write.bind(process.stdout);
process.stdout.write = () => true;
process.stderr.write = () => true;

const report = {
  recognized: false,
  pages: 0,
  transactions: 0,
  balancedWithinOneCent: false,
  diagnostics: [],
};
const parserCodes = new Set([
  "LAYOUT_NOT_RECOGNIZED", "INVALID_REFERENCE_DATE", "REFERENCE_DATE_MISSING", "AMBIGUOUS_REFERENCE_DATE",
  "INVALID_TRANSACTION_DATE", "INVALID_TRANSACTION_AMOUNT", "MISSING_TRANSACTION_VALUE",
]);

if (process.argv.length !== 3) {
  report.diagnostics.push("PDF_ARGUMENT_REQUIRED");
} else {
  let hooks;
  try {
    // O Node carrega TypeScript nativamente. O hook só adapta a resolução dos
    // imports sem extensão e do recurso ?url usado pelo extrator do navegador.
    const sourceRoot = new URL("../src/", import.meta.url).href;
    // O build legacy do próprio PDF.js fornece os polyfills de Node, inclusive
    // Uint8Array.toHex; o build de navegador pressupõe APIs mais recentes.
    const pdfjsUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const workerUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
    hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "pdfjs-dist") return nextResolve(pdfjsUrl, context);
        if (specifier === "pdfjs-dist/build/pdf.worker.min.mjs?url") {
          return { url: `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(workerUrl)}`)}`, shortCircuit: true };
        }
        if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
          return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
      },
    });
    const { extractPdfPages } = await import("../src/pdf/extract-pdf.ts");
    const { parseBradescoInvoice } = await import("../src/parsers/bradesco-parser.ts");
    const { reconcileInvoice } = await import("../src/domain/reconciliation.ts");
    const data = await readFile(process.argv[2]);
    const pages = await extractPdfPages(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const invoice = parseBradescoInvoice(pages);
    const reconciliation = reconcileInvoice(invoice.transactions,
      invoice.summary.purchasesAndDebits ?? invoice.summary.invoiceTotal);
    report.recognized = invoice.recognizedLayout;
    report.pages = pages.length;
    report.transactions = invoice.transactions.length;
    report.balancedWithinOneCent = reconciliation.isBalanced;
    report.diagnostics = invoice.diagnostics.map(({ code }) => parserCodes.has(code) ? code : "PARSER_DIAGNOSTIC");
    if (!report.recognized) report.diagnostics.push("LAYOUT_NOT_RECOGNIZED");
    if (report.transactions === 0) report.diagnostics.push("NO_TRANSACTIONS");
    if (!report.balancedWithinOneCent) report.diagnostics.push("RECONCILIATION_FAILED");
  } catch {
    report.diagnostics.push("PDF_PROCESSING_FAILED");
  } finally {
    hooks?.deregister();
  }
}
report.diagnostics = [...new Set(report.diagnostics)].sort();
process.exitCode = report.recognized && report.transactions > 0
  && report.balancedWithinOneCent && report.diagnostics.length === 0 ? 0 : 1;
writeReport(`${JSON.stringify(report)}\n`);
