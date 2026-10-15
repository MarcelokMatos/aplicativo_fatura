import { describe, expect, it } from "vitest";
import { reconcileInvoice } from "../src/domain/reconciliation";
import type { InvoiceTransaction } from "../src/domain/transaction";

function transactions(...values: number[]): InvoiceTransaction[] {
  return values.map((value, index) => ({
    date: "2026-10-01",
    history: "LANÇAMENTO SINTÉTICO",
    originalCurrency: null,
    usd: null,
    usdRate: null,
    brl: value,
    installment: "1/1",
    value,
    source: { page: 1, line: index + 1 },
    warnings: [],
  }));
}

describe("reconcileInvoice", () => {
  it("soma débitos e créditos com sinal e calcula o líquido", () => {
    expect(reconcileInvoice(transactions(100, 25.5, -20, -5.25, 0), 100.25)).toEqual({
      positiveTotal: 125.5,
      negativeTotal: -25.25,
      netTotal: 100.25,
      controlTotal: 100.25,
      difference: 0,
      isBalanced: true,
    });
  });

  it("soma em centavos sem resíduos binários", () => {
    expect(reconcileInvoice(transactions(0.1, 0.2), 0.3)).toMatchObject({
      positiveTotal: 0.3, netTotal: 0.3, difference: 0, isBalanced: true,
    });
  });

  it("arredonda cada lançamento antes de somar", () => {
    expect(reconcileInvoice(transactions(1.234, 1.234, -0.126), 2.33)).toMatchObject({
      positiveTotal: 2.46, negativeTotal: -0.13, netTotal: 2.33,
      difference: 0, isBalanced: true,
    });
  });

  it.each([1.005, -1.005])("arredonda meio centavo em %s preservando o sinal", (value) => {
    const expected = value > 0 ? 1.01 : -1.01;
    expect(reconcileInvoice(transactions(value), expected)).toMatchObject({
      netTotal: expected, difference: 0, isBalanced: true,
    });
  });

  it.each([
    [10.01, 0.01, true],
    [9.99, -0.01, true],
    [10.02, 0.02, false],
    [9.98, -0.02, false],
  ])("compara líquido %s com controle 10 e tolerância inclusiva", (value, difference, isBalanced) => {
    expect(reconcileInvoice(transactions(value), 10)).toMatchObject({ difference, isBalanced });
  });

  it("aceita tolerância explícita em centavos", () => {
    expect(reconcileInvoice(transactions(10.02), 10, 0.02).isBalanced).toBe(true);
    expect(reconcileInvoice(transactions(10.01), 10, 0).isBalanced).toBe(false);
  });

  it("não concilia sem controle mesmo quando o líquido é zero", () => {
    expect(reconcileInvoice(transactions(10, -10), null)).toEqual({
      positiveTotal: 10, negativeTotal: -10, netTotal: 0,
      controlTotal: null, difference: null, isBalanced: false,
    });
  });

  it("reconhece controle zero como presente", () => {
    expect(reconcileInvoice([], 0)).toEqual({
      positiveTotal: 0, negativeTotal: 0, netTotal: 0,
      controlTotal: 0, difference: 0, isBalanced: true,
    });
  });

  it("preserva o sinal da divergência", () => {
    expect(reconcileInvoice(transactions(15, -5), 12)).toMatchObject({
      netTotal: 10, difference: -2, isBalanced: false,
    });
  });

  it.each([NaN, Infinity, -Infinity])("bloqueia falso sucesso com valor não finito %s", (value) => {
    expect(reconcileInvoice(transactions(15, value, -5), 10)).toEqual({
      positiveTotal: 15, negativeTotal: -5, netTotal: 10,
      controlTotal: 10, difference: null, isBalanced: false,
    });
  });

  it.each([NaN, Infinity, -Infinity])("não concilia com controle não finito %s", (control) => {
    expect(reconcileInvoice(transactions(10), control)).toMatchObject({
      difference: null, isBalanced: false,
    });
  });
});
