import { describe, expect, it } from "vitest";
import { groupTextItemsIntoLines } from "../src/pdf/group-lines";
import { emptyPage, unorderedPage } from "./fixtures/pdf-items.synthetic";

describe("groupTextItemsIntoLines", () => {
  it("reconstrói linhas na ordem visual com itens por x e origem preservada", () => {
    const lines = groupTextItemsIntoLines(unorderedPage);
    expect(lines.map(({ page, line, y, text }) => ({ page, line, y, text }))).toEqual([
      { page: 2, line: 1, y: 701, text: "01/10 LOJA A 10,00" },
      { page: 2, line: 2, y: 690, text: "02/10 LOJA B 20,00" },
    ]);
    expect(lines.map((line) => line.items.map((item) => item.x))).toEqual([
      [20, 90, 450], [20, 90, 450],
    ]);
    expect(lines[0]?.items[1]).toEqual(unorderedPage.items[1]);
  });

  it("não altera os itens nem sua ordem na página original", () => {
    const before = structuredClone(unorderedPage);
    groupTextItemsIntoLines(unorderedPage);
    expect(unorderedPage).toEqual(before);
  });

  it("retorna lista vazia para página sem itens", () => {
    expect(groupTextItemsIntoLines(emptyPage)).toEqual([]);
  });

  it("respeita tolerância configurável, incluindo a borda", () => {
    expect(groupTextItemsIntoLines(unorderedPage, 0).map((line) => line.y)).toEqual([
      701, 700.5, 700, 690,
    ]);
    expect(groupTextItemsIntoLines(unorderedPage, 1)).toHaveLength(2);
  });

  it("não une linhas por encadeamento de pequenas variações verticais", () => {
    const page = { ...unorderedPage, items: [
      { ...unorderedPage.items[0]!, text: "A", y: 700 },
      { ...unorderedPage.items[0]!, text: "B", y: 698.5 },
      { ...unorderedPage.items[0]!, text: "C", y: 697 },
    ] };
    expect(groupTextItemsIntoLines(page, 2).map((line) => line.text)).toEqual(["A B", "C"]);
  });
});
