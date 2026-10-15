import "./styles.css";
import { createInvoiceController } from "./app/invoice-controller";
import { parseBradescoInvoice } from "./parsers/bradesco-parser";
import { extractPdfPages } from "./pdf/extract-pdf";
import { renderApp } from "./ui/render-app";

const root = document.querySelector<HTMLElement>("#app");
if (root) renderApp(root, createInvoiceController({ extract: extractPdfPages, parse: parseBradescoInvoice }));
