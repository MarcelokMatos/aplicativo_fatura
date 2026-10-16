import { describe, expect, it } from "vitest";
import {
  chooseTransactionValue,
  extractInstallment,
  hasInvalidInstallmentSuffix,
  inferTransactionDate,
  parseBrDecimal,
} from "../src/domain/normalization";

describe("parseBrDecimal", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["-123,45", -123.45],
    ["123,45-", -123.45],
    ["\u00a01.234,56\u00a0", 1234.56],
    ["1\u00a0234,56", 1234.56],
    ["1\u202f234,56", 1234.56],
    [" 123,45 ", 123.45],
    ["0,00", 0],
    ["123", 123],
    ["5,1234", 5.1234],
  ])("converte %j sem depender de locale", (input, expected) => {
    expect(parseBrDecimal(input)).toBe(expected);
  });

  it.each(["", "\u00a0", "inválido", "123,45abc", "1.23,45", "123.45", "1,2,3", "-123,45-", "12 3,45"])(
    "rejeita %j sem conversão parcial",
    (input) => {
      expect(parseBrDecimal(input)).toBeNull();
    },
  );
});

describe("inferTransactionDate", () => {
  const januaryReference = new Date("2026-01-10T00:00:00.000Z");

  it.each([
    ["12/12", "2025-12-12"],
    ["05/01", "2026-01-05"],
  ])("infere %s na virada do ano", (input, expected) => {
    expect(inferTransactionDate(input, januaryReference)).toBe(expected);
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(inferTransactionDate("29/02", new Date("2024-03-10T00:00:00Z"))).toBe("2024-02-29");
  });

  it("usa o ano anterior quando o dia no mesmo mês é posterior à referência", () => {
    expect(inferTransactionDate("12/01", januaryReference)).toBe("2025-01-12");
  });

  it.each(["29/02", "31/04", "00/01", "10/13", "5/01", "05/01/2026"])(
    "rejeita data inválida %s sem ajuste silencioso",
    (input) => {
      expect(() => inferTransactionDate(input, januaryReference)).toThrow(RangeError);
    },
  );

  it("rejeita referência inválida", () => {
    expect(() => inferTransactionDate("05/01", new Date(NaN))).toThrow(RangeError);
  });

  it("usa o mês e o ano UTC da referência", () => {
    expect(inferTransactionDate("12/12", new Date("2026-01-01T00:30:00Z"))).toBe("2025-12-12");
  });
});

describe("extractInstallment", () => {
  it("remove somente a parcela terminal e normaliza zeros", () => {
    expect(extractInstallment("LOJA 02/10")).toEqual({ history: "LOJA", installment: "2/10" });
  });

  it("preserva barras internas ao remover parcela terminal", () => {
    expect(extractInstallment("LOJA A/B 03/12  ")).toEqual({ history: "LOJA A/B", installment: "3/12" });
  });

  it.each([
    ["SESI FARMACIA FM 57402/02", "SESI FARMACIA FM 574", "2/2"],
    ["ASSOCIACAO CONGREGAC06/10", "ASSOCIACAO CONGREGAC", "6/10"],
    ["LOJA123/30", "LOJA1", "23/30"],
    ["LOJA7/9  ", "LOJA", "7/9"],
    ["LOJA A/B06/10", "LOJA A/B", "6/10"],
  ])("extrai os dois dígitos junto à última barra de %j", (input, history, installment) => {
    expect(extractInstallment(input)).toEqual({ history, installment });
  });

  it.each([
    "LOJA A/B", "LOJA 02/10 CENTRO", "LOJA/02/10", "LOJA/102/10",
    "LOJA 102/110", "LOJA06/100", "LOJA 00/10", "LOJA00/10",
    "LOJA 01/00", "LOJA01/00", "LOJA 11/10", "LOJA11/10", "LOJA", "",
  ])(
    "mantém %j e usa 1/1 sem parcela terminal válida",
    (history) => {
      expect(extractInstallment(history)).toEqual({ history, installment: "1/1" });
    },
  );
});

describe("hasInvalidInstallmentSuffix", () => {
  it.each(["LOJA INVENTADA06/0", "LOJA 00/10", "LOJA 11/10", "LOJA 01/00"])(
    "sinaliza somente candidato terminal numericamente inválido em %j",
    (history) => expect(hasInvalidInstallmentSuffix(history)).toBe(true),
  );

  it.each(["LOJA 02/10", "LOJA/02/10", "LOJA A/B", "LOJA 02/10 CENTRO", "LOJA 102/110"])(
    "não sinaliza parcela válida, barra interna ou caminho ambíguo em %j",
    (history) => expect(hasInvalidInstallmentSuffix(history)).toBe(false),
  );
});

describe("chooseTransactionValue", () => {
  it.each([
    [123.45, 20, 123.45],
    [0, 20, 0],
    [-123.45, 20, -123.45],
    [null, 20, 20],
    [null, 0, 0],
    [null, -20, -20],
    [123.45, null, 123.45],
    [null, null, null],
  ])("prioriza R$ %s sobre origem %s", (brl, originalCurrency, expected) => {
    expect(chooseTransactionValue(brl, originalCurrency)).toBe(expected);
  });
});
