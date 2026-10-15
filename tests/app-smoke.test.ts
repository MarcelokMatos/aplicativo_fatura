import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("página inicial", () => {
  it("oferece o título, a seleção de PDF e o ponto de montagem", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const page = new DOMParser().parseFromString(html, "text/html");

    expect(page.title).toBe("Fatura do cartão");
    expect(page.querySelector('input[type="file"][accept="application/pdf"]')).not.toBeNull();
    expect(page.querySelector("#app")).not.toBeNull();
    expect(page.body.textContent).toContain(
      "Seu PDF é processado somente neste aparelho",
    );
  });
});
