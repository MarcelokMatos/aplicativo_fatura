import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceTransaction } from "../src/domain/transaction";
import {
  copyTransactions,
  formatTransactionDate,
  OUTPUT_HEADERS,
  serializeTransactionsForClipboard,
} from "../src/export/clipboard";

const header = "Data\tHistórico\tMoeda de origem\tUS$\tCotação US$\tR$\tParcela\tValor";

function transaction(overrides: Partial<InvoiceTransaction> = {}): InvoiceTransaction {
  return {
    date: "2026-10-01", history: "COMPRA SINTÉTICA", originalCurrency: null,
    usd: null, usdRate: null, brl: 1234.56, installment: "2/10", value: 1234.56,
    source: { page: 1, line: 1 }, warnings: [], ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("serializeTransactionsForClipboard", () => {
  it("exporta somente o cabeçalho exato para lista vazia", () => {
    expect(OUTPUT_HEADERS).toEqual([
      "Data", "Histórico", "Moeda de origem", "US$", "Cotação US$", "R$", "Parcela", "Valor",
    ]);
    expect(serializeTransactionsForClipboard([])).toBe(header);
  });

  it("mantém oito colunas, ordem, duplicadas, negativos e precisão decimal", () => {
    const rows = [transaction(), transaction({
      history: "CRÉDITO SINTÉTICO", originalCurrency: -10.25, usd: -2,
      usdRate: 5.1234, brl: null, installment: "1/1", value: -10.25,
    }), transaction()];
    expect(serializeTransactionsForClipboard(rows)).toBe(
      header + "\n01/10/2026\tCOMPRA SINTÉTICA\t\t\t\t1234,56\t2/10\t1234,56" +
      "\n01/10/2026\tCRÉDITO SINTÉTICO\t-10,25\t-2\t5,1234\t\t1/1\t-10,25" +
      "\n01/10/2026\tCOMPRA SINTÉTICA\t\t\t\t1234,56\t2/10\t1234,56",
    );
  });

  it("preserva zero como número", () => {
    expect(serializeTransactionsForClipboard([transaction({
      originalCurrency: 0, usd: 0, usdRate: 0, brl: 0, value: 0,
    })])).toBe(header + "\n01/10/2026\tCOMPRA SINTÉTICA\t0\t0\t0\t0\t2/10\t0");
  });

  it.each([NaN, Infinity, -Infinity])("exporta %s como célula vazia em qualquer coluna numérica", (value) => {
    expect(serializeTransactionsForClipboard([transaction({
      originalCurrency: value, usd: value, usdRate: value, brl: value, value,
    })])).toBe(header + "\n01/10/2026\tCOMPRA SINTÉTICA\t\t\t\t\t2/10\t");
  });

  it("substitui tabs e quebras internas sem criar novas células ou linhas", () => {
    expect(serializeTransactionsForClipboard([transaction({ history: "LOJA\tA\r\nB\nC\rD" })]))
      .toBe(header + "\n01/10/2026\tLOJA A B C D\t\t\t\t1234,56\t2/10\t1234,56");
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r\n+1+1", "  @SUM(A1)"])(
    "neutraliza histórico de fórmula %j como texto literal", (history) => {
      const cells = serializeTransactionsForClipboard([transaction({ history })]).split("\n")[1]!.split("\t");
      expect(cells).toHaveLength(8);
      expect(cells[1]).toBe("'" + history.replace(/\r\n|[\t\r\n]/g, " "));
    },
  );
});

describe("formatTransactionDate", () => {
  it.each([["2026-01-05", "05/01/2026"], ["2024-02-29", "29/02/2024"]])(
    "formata %s sem depender do fuso", (input, expected) => {
      expect(formatTransactionDate(input)).toBe(expected);
    },
  );
  it.each(["", "inválida", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-00", "2026-1-01", "2026-10-01T00:00:00Z"])(
    "exporta data inválida %j como vazio", (date) => {
      expect(formatTransactionDate(date)).toBe("");
      expect(serializeTransactionsForClipboard([transaction({ date })]).split("\n")[1]!.split("\t")[0]).toBe("");
    },
  );
});

describe("copyTransactions", () => {
  const text = header + "\n01/10/2026\tCOMPRA SINTÉTICA\t\t\t\t1234,56\t2/10\t1234,56";

  it("copia o texto exato no clipboard injetado e aguarda a gravação", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyTransactions([transaction()], { writeText })).toEqual({ copied: true, text });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
  });

  it("usa a Clipboard API do navegador quando não há dependência injetada", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyTransactions([transaction()])).toEqual({ copied: true, text });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
  });

  it("preserva texto intacto quando a gravação é rejeitada", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permissão negada"));
    expect(await copyTransactions([transaction()], { writeText })).toEqual({ copied: false, text });
  });

  it("preserva texto intacto quando Clipboard API está ausente", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyTransactions([transaction()])).toEqual({ copied: false, text });
  });
});
