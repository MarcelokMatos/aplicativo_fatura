import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Boundary: application-owned TS modules reachable from main.ts, including type
// imports. PDF.js internals and the generated shell service worker are excluded.
// This conservative static guard is not a browser network/storage audit.
const forbidden = new Set([
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
  "indexedDB", "localStorage", "sessionStorage", "caches", "openDatabase",
  "eval", "Function", "require",
]);

function inspect(source: string) {
  const file = ts.createSourceFile("boundary.ts", source, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && forbidden.has(node.text)) {
      violations.push(node.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      violations.push("dynamic import");
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { violations, imports };
}

describe("fronteira local do fluxo de fatura", () => {
  it.each([
    'fetch("/upload", { body: pdf })',
    'window.fetch("/upload", { body: pdf })',
    'globalThis["fetch"]("/upload", { body: pdf })',
    'const { fetch: upload } = window; upload(pdf)',
    'new XMLHttpRequest().send(pdf)',
    'navigator["sendBeacon"]("/upload", pdf)',
    'window.localStorage.setItem("invoice", text)',
    'window["sessionStorage"].setItem("invoice", text)',
    'indexedDB.open("invoice")',
    'caches.open("invoice")',
    'import("./hidden-upload")',
  ])("detecta API proibida mesmo com acesso alternativo: %s", (source) => {
    expect(inspect(source).violations.length).toBeGreaterThan(0);
  });

  it("não encontra rede/persistência no grafo real de processamento nem dependência externa nova", () => {
    const root = resolve("src");
    const pending = [resolve(root, "main.ts")];
    const visited = new Set<string>();
    const violations: string[] = [];
    while (pending.length) {
      const path = pending.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      const name = relative(root, path).replaceAll("\\", "/");
      const result = inspect(readFileSync(path, "utf8"));
      violations.push(...result.violations.map((api) => `${name}: ${api}`));
      for (const specifier of result.imports) {
        if (name === "main.ts" && specifier === "./styles.css") continue;
        if (name === "pdf/extract-pdf.ts" && ["pdfjs-dist", "pdfjs-dist/build/pdf.worker.min.mjs?url"].includes(specifier)) continue;
        if (!specifier.startsWith(".")) {
          violations.push(`${name}: external import ${specifier}`);
          continue;
        }
        const dependency = resolve(dirname(path), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
        expect(relative(root, dependency).startsWith("..")).toBe(false);
        pending.push(dependency);
      }
    }
    expect([...visited].map((path) => relative(root, path).replaceAll("\\", "/"))).toEqual(expect.arrayContaining([
      "main.ts", "app/invoice-controller.ts", "pdf/extract-pdf.ts",
      "parsers/bradesco-parser.ts", "export/clipboard.ts", "ui/render-app.ts",
    ]));
    expect(violations).toEqual([]);
    // URL-based PDF loading would delegate networking to the excluded library.
    const extractor = ts.createSourceFile("extract-pdf.ts", readFileSync(resolve(root, "pdf/extract-pdf.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    const pdfCalls: ts.CallExpression[] = [];
    function visitPdf(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "getDocument") pdfCalls.push(node);
      ts.forEachChild(node, visitPdf);
    }
    visitPdf(extractor);
    expect(pdfCalls).toHaveLength(1);
    const argument = pdfCalls[0]!.arguments[0]!;
    expect(ts.isObjectLiteralExpression(argument)).toBe(true);
    const properties = (argument as ts.ObjectLiteralExpression).properties;
    expect(properties).toHaveLength(1);
    expect(ts.isShorthandPropertyAssignment(properties[0]!)).toBe(true);
    expect(properties[0]!.name?.getText(extractor)).toBe("data");
  });
});
