import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfPageText, PdfTextItem } from "./pdf-types";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfPages(data: ArrayBuffer): Promise<PdfPageText[]> {
  const loadingTask = getDocument({ data });
  try {
    const document = await loadingTask.promise;
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({
          text: item.str,
          page: pageNumber,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
      pages.push({ pageNumber, width: viewport.width, height: viewport.height, items });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
