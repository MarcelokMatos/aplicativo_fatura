import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfPages } from "../src/pdf/extract-pdf";

// PDF.js possui worker e APIs gráficas ausentes no jsdom. O limite simulado
// fornece itens no formato real; asserções verificam a saída do adaptador.
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  getDocument: pdf.getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
}));

describe("extractPdfPages", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("converte coordenadas e dimensões, preserva páginas vazias e ignora marcadores", async () => {
    const pages = [
      {
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({ items: [
          { str: "SINTETICO", dir: "ltr", width: 60, height: 12,
            transform: [12, 0, 0, 12, 40, 710], fontName: "f1", hasEOL: false },
          { type: "beginMarkedContent", id: "synthetic" },
        ] }),
      },
      { getViewport: () => ({ width: 500, height: 700 }),
        getTextContent: async () => ({ items: [] }) },
    ];
    pdf.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage: async (page: number) => pages[page - 1] }),
      destroy: pdf.destroy,
    });
    const result = await extractPdfPages(new ArrayBuffer(8));
    expect(result).toEqual([
      { pageNumber: 1, width: 600, height: 800, items: [
        { text: "SINTETICO", page: 1, x: 40, y: 710, width: 60, height: 12 },
      ] },
      { pageNumber: 2, width: 500, height: 700, items: [] },
    ]);
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("propaga falha de leitura e libera o documento", async () => {
    pdf.getDocument.mockReturnValue({ promise: Promise.reject(new Error("PDF inválido")), destroy: pdf.destroy });
    await expect(extractPdfPages(new ArrayBuffer(0))).rejects.toThrow("PDF inválido");
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });
});
