import type { PdfPageText, PdfTextItem } from "./pdf-types";

export interface PdfTextLine {
  page: number;
  line: number;
  y: number;
  items: PdfTextItem[];
  text: string;
}

// Usa coordenadas PDF (origem inferior): y decrescente é a ordem visual.
export function groupTextItemsIntoLines(
  page: PdfPageText,
  yTolerance = 2,
): PdfTextLine[] {
  const lines: PdfTextLine[] = [];
  const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const previous = lines.at(-1);
    // Âncora fixa evita unir duas linhas por variações encadeadas de y.
    if (previous && Math.abs(previous.y - item.y) <= yTolerance) {
      previous.items.push(item);
    } else {
      lines.push({ page: page.pageNumber, line: lines.length + 1, y: item.y, items: [item], text: "" });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((item) => item.text).join(" ");
  }
  return lines;
}
