import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createInvoiceController } from "../src/app/invoice-controller";
import type { InvoiceTransaction } from "../src/domain/transaction";
import { parseBradescoInvoice } from "../src/parsers/bradesco-parser";
import { transactionTable } from "../src/ui/transaction-table";

const styles = readFileSync("src/styles.css", "utf8");
const row: InvoiceTransaction = {
  date: "2026-01-03", history: "COMPRA SINTÉTICA", originalCurrency: null,
  usd: null, usdRate: null, brl: 10, installment: "1/1", value: 10,
  source: { page: 1, line: 1 }, warnings: [],
};

afterEach(() => document.head.querySelectorAll("style").forEach((style) => style.remove()));

function mount() {
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.append(style);
  const table = transactionTable(createInvoiceController({ extract: async () => [], parse: parseBradescoInvoice }));
  table.update([row], [1], 0);
  document.body.append(table.element);
  return { style, table: document.querySelector("table")!,
    cell: document.querySelector("tbody td:has(input)")!,
    input: document.querySelector("tbody input")!,
    remove: document.querySelector<HTMLButtonElement>("tbody button")! };
}

describe("densidade da tabela de revisão", () => {
  it("aplica tipografia e espaçamentos compactos aos elementos renderizados", () => {
    const { table, cell, input, remove } = mount();
    expect(getComputedStyle(table).fontSize).toBe("14px");
    expect(getComputedStyle(table).lineHeight).toBe("1.25");
    expect(getComputedStyle(cell).padding).toBe("4px");
    expect(getComputedStyle(input).padding).toBe("4px");
    expect(getComputedStyle(input).marginTop).toBe("0px");
    expect(getComputedStyle(remove).marginTop).toBe("0px");
    expect(getComputedStyle(remove).minHeight).toBe("32px");
  });

  it.each([
    ["Data", "108px"],
    ["Moeda de origem", "112px"],
    ["US$", "80px"],
    ["Cotação US$", "104px"],
    ["R$", "96px"],
    ["Parcela", "72px"],
    ["Valor", "96px"],
  ])("dimensiona %s conforme seu conteúdo de referência", (label, expectedWidth) => {
    mount();
    const input = document.querySelector(`input[aria-label="${label}, linha 1"]`)!;
    expect(getComputedStyle(input).width).toBe(expectedWidth);
    expect(getComputedStyle(input.closest("td")!).width).toBe("1%");
  });

  it("reserva espaço flexível para Histórico com mínimo de 18rem e mantém rolagem", () => {
    const { table } = mount();
    const history = document.querySelector('input[aria-label="Histórico, linha 1"]')!;
    expect(getComputedStyle(history).minWidth).toBe("288px");
    expect(getComputedStyle(history).width).toBe("100%");
    expect(getComputedStyle(history.closest("td")!).width).toBe("auto");
    expect(getComputedStyle(table.parentElement!).overflowX).toBe("auto");
  });

  it("mantém alvos de toque de 44px no mínimo quando a regra de tela pequena é aplicada", () => {
    const { style, input, remove } = mount();
    const mobile = Array.from(style.sheet!.cssRules).find((rule): rule is CSSMediaRule =>
      rule instanceof CSSMediaRule && rule.conditionText === "(max-width: 40rem)");
    expect(mobile).toBeDefined();
    // jsdom não avalia viewport: aplica somente o conteúdo da media query existente.
    const matched = document.createElement("style");
    matched.textContent = Array.from(mobile!.cssRules).map((rule) => rule.cssText).join("\n");
    document.head.append(matched);
    expect(getComputedStyle(remove).minWidth).toBe("44px");
    expect(getComputedStyle(remove).minHeight).toBe("44px");
    expect(getComputedStyle(input).minHeight).toBe("44px");
  });
});
