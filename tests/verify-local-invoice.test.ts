import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// PDFs inteiramente inventados; o teste executa extração, parser e conciliação reais.
const folders: string[] = [];
type Row = [number, string][];
const header: Row = [[20, "Data"], [80, "Historico"], [300, "Moeda de origem"],
  [405, "US$"], [465, "Cotacao US$"], [565, "R$"]];
function invoiceRows(control = "80,00"): Row[] {
  return [
    [[20, "Bradesco Cartoes"]],
    [[20, "Vencimento 10/01/2026"]],
    [[20, `Compras e debitos ${control}`]],
    header,
    [[20, "03/01"], [80, "HISTORICO SINTETICO RESERVADO"], [565, "100,00"]],
    [[20, "04/01"], [80, "ESTORNO SINTETICO RESERVADO"], [565, "20,00-"]],
  ];
}
function syntheticPdf(rows: Row[]): Buffer {
  const stream = rows.flatMap((row, index) => row.map(([x, text]) =>
    `BT /F1 8 Tf 1 0 0 1 ${x} ${860 - index * 20} Tm (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`,
  )).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 900] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
function file(data: Buffer | string): string {
  const folder = mkdtempSync(join(tmpdir(), "invoice-cli-synthetic-"));
  folders.push(folder);
  const path = join(folder, "PRIVATE_SYNTHETIC_FILENAME.pdf");
  writeFileSync(path, data);
  return path;
}
function run(args: string[]) {
  const result = spawnSync(process.execPath, ["scripts/verify-local-invoice.mjs", ...args], {
    encoding: "utf8", timeout: 30_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.stdout).toMatch(/^\{/);
  expect(result.stdout).not.toMatch(/RESERVADO|PRIVATE_SYNTHETIC_FILENAME|100,00|20,00|80,00/);
  return { exit: result.status, output: JSON.parse(result.stdout) as Record<string, unknown> };
}
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("verificador local com saída agregada e segura", () => {
  it.each(["80,00", "80,01"])("aprova PDF sintético conciliado com controle %s", (control) => {
    expect(run([file(syntheticPdf(invoiceRows(control)))])).toEqual({ exit: 0, output: {
      recognized: true, pages: 1, transactions: 2, balancedWithinOneCent: true, diagnostics: [],
    } });
  });
  it("reprova divergência acima de um centavo", () => {
    expect(run([file(syntheticPdf(invoiceRows("80,02")))])).toEqual({ exit: 1, output: {
      recognized: true, pages: 1, transactions: 2, balancedWithinOneCent: false,
      diagnostics: ["RECONCILIATION_FAILED"],
    } });
  });
  it("reprova layout desconhecido sem expor texto", () => {
    expect(run([file(syntheticPdf([[[20, "CONTEUDO SINTETICO RESERVADO"]]]))])).toEqual({ exit: 1, output: {
      recognized: false, pages: 1, transactions: 0, balancedWithinOneCent: false,
      diagnostics: ["LAYOUT_NOT_RECOGNIZED", "NO_TRANSACTIONS", "RECONCILIATION_FAILED"],
    } });
  });
  it("reprova reconhecimento sem referência e sem lançamentos", () => {
    const rows = invoiceRows().filter((_row, index) => index !== 1);
    expect(run([file(syntheticPdf(rows))])).toEqual({ exit: 1, output: {
      recognized: true, pages: 1, transactions: 0, balancedWithinOneCent: false,
      diagnostics: ["NO_TRANSACTIONS", "RECONCILIATION_FAILED", "REFERENCE_DATE_MISSING"],
    } });
  });
  it("publica somente código seguro específico para vencimento ambíguo", () => {
    const rows = invoiceRows();
    rows.splice(2, 0, [[20, "Vencimento 11/01/2026"]]);
    expect(run([file(syntheticPdf(rows))])).toEqual({ exit: 1, output: {
      recognized: true, pages: 1, transactions: 0, balancedWithinOneCent: false,
      diagnostics: ["AMBIGUOUS_REFERENCE_DATE", "NO_TRANSACTIONS", "RECONCILIATION_FAILED"],
    } });
  });
  it("não aprova documento sem lançamentos mesmo com controle zero", () => {
    expect(run([file(syntheticPdf(invoiceRows("0,00").slice(0, 4)))])).toEqual({ exit: 1, output: {
      recognized: true, pages: 1, transactions: 0, balancedWithinOneCent: true,
      diagnostics: ["NO_TRANSACTIONS"],
    } });
  });
  it("oculta erros de leitura e de PDF inválido", () => {
    for (const path of ["PRIVATE_SYNTHETIC_FILENAME_MISSING.pdf", file("CONTEUDO SINTETICO RESERVADO")]) {
      expect(run([path])).toEqual({ exit: 1, output: {
        recognized: false, pages: 0, transactions: 0, balancedWithinOneCent: false,
        diagnostics: ["PDF_PROCESSING_FAILED"],
      } });
    }
  });
  it("recusa chamada sem caminho com código seguro", () => {
    expect(run([])).toEqual({ exit: 1, output: {
      recognized: false, pages: 0, transactions: 0, balancedWithinOneCent: false,
      diagnostics: ["PDF_ARGUMENT_REQUIRED"],
    } });
  });
});
