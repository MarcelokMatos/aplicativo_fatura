import type { PdfPageText } from "../../src/pdf/pdf-types";

// Coordenadas PDF: origem inferior; y maior aparece primeiro na página.
export const unorderedPage: PdfPageText = {
  pageNumber: 2,
  width: 600,
  height: 800,
  items: [
    { text: "20,00", page: 2, x: 450, y: 690, width: 30, height: 10 },
    { text: "LOJA A", page: 2, x: 90, y: 700.5, width: 60, height: 10 },
    { text: "01/10", page: 2, x: 20, y: 701, width: 30, height: 10 },
    { text: "10,00", page: 2, x: 450, y: 700, width: 30, height: 10 },
    { text: "02/10", page: 2, x: 20, y: 690, width: 30, height: 10 },
    { text: "LOJA B", page: 2, x: 90, y: 690, width: 60, height: 10 },
  ],
};

export const emptyPage: PdfPageText = {
  pageNumber: 3, width: 600, height: 800, items: [],
};
