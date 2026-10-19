import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { build } from "vite";
import { describe, expect, it } from "vitest";

describe("shell PWA", () => {
  it("limita permissões do GitHub Pages ao job de deploy", () => {
    const workflow = readFileSync(".github/workflows/deploy-pages.yml", "utf8");
    const buildJob = workflow.match(/^  build:\s*\n([\s\S]*?)(?=^  deploy:)/m)?.[1] ?? "";
    const deployJob = workflow.match(/^  deploy:\s*\n([\s\S]*)$/m)?.[1] ?? "";

    expect(workflow).not.toMatch(/^permissions:/m);
    expect(buildJob).toMatch(/^    permissions:\s*\n      contents: read$/m);
    expect(buildJob).not.toMatch(/pages: write|id-token: write|actions\/configure-pages/);
    expect(deployJob).toMatch(/^    permissions:\s*\n      pages: write\s*\n      id-token: write$/m);
    expect(deployJob).toContain("actions/configure-pages@v5");
  });

  it("usa raiz local por padrão e aceita VITE_BASE_PATH em publicações", async () => {
    const originalBasePath = process.env.VITE_BASE_PATH;
    const defaultOutDir = resolve(".superpowers/sdd/2026-10-13-fatura-cartao-pwa-v1/task-10-default-base-dist");
    const pagesOutDir = resolve(".superpowers/sdd/2026-10-13-fatura-cartao-pwa-v1/task-10-pages-base-dist");

    try {
      delete process.env.VITE_BASE_PATH;
      await build({ configFile: resolve("vite.config.ts"), logLevel: "silent", build: { outDir: defaultOutDir, emptyOutDir: true } });
      expect(readFileSync(resolve(defaultOutDir, "index.html"), "utf8")).toContain('src="/assets/');

      process.env.VITE_BASE_PATH = "/aplicativo_fatura/";
      await build({ configFile: resolve("vite.config.ts"), logLevel: "silent", build: { outDir: pagesOutDir, emptyOutDir: true } });
      const pagesHtml = readFileSync(resolve(pagesOutDir, "index.html"), "utf8");
      expect(pagesHtml).toContain('src="/aplicativo_fatura/assets/');
      expect(pagesHtml).toContain('src="/aplicativo_fatura/registerSW.js"');
    } finally {
      if (originalBasePath === undefined) delete process.env.VITE_BASE_PATH;
      else process.env.VITE_BASE_PATH = originalBasePath;
    }
  }, 30_000);

  it("vincula o manifesto à página inicial", () => {
    const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html");
    expect(page.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("./manifest.webmanifest");
  });

  it("oferece manifesto local instalável e ícones próprios nas duas dimensões", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest).toMatchObject({
      name: "Fatura do cartão", display: "standalone", start_url: "./",
    });
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.icons).toEqual([
      { src: "icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ]);
    for (const size of [192, 512]) {
      const svg = new DOMParser().parseFromString(readFileSync(`public/icons/icon-${size}.svg`, "utf8"), "image/svg+xml").documentElement;
      expect(svg.localName).toBe("svg");
      expect(svg.getAttribute("width")).toBe(String(size));
      expect(svg.getAttribute("height")).toBe(String(size));
      expect(svg.getAttribute("viewBox")).toBe(`0 0 ${size} ${size}`);
      expect(svg.querySelector("image, script, foreignObject")).toBeNull();
    }
  });

  it("gera e registra SW que precacheia somente o shell e worker PDF.js, sem rotas de runtime", async () => {
    // Real production plugin/build; scratch output is isolated from dist/.
    const outDir = resolve(".superpowers/sdd/2026-10-13-fatura-cartao-pwa-v1/task-8-test-dist");
    await build({ configFile: resolve("vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
    const html = new DOMParser().parseFromString(readFileSync(resolve(outDir, "index.html"), "utf8"), "text/html");
    expect(html.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("./manifest.webmanifest");
    expect(html.querySelector('script[src="/registerSW.js"]')).not.toBeNull();
    expect(readFileSync(resolve(outDir, "registerSW.js"), "utf8")).toMatch(/register\((["'])\/sw\.js\1/);
    expect(JSON.parse(readFileSync(resolve(outDir, "manifest.webmanifest"), "utf8"))).toMatchObject({ display: "standalone" });

    const worker = ts.createSourceFile("sw.js", readFileSync(resolve(outDir, "sw.js"), "utf8"), ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    }
    visit(worker);
    const named = (name: string) => calls.filter((call) => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === name);
    const precaches = named("precacheAndRoute");
    expect(precaches).toHaveLength(1);
    const entries = precaches[0]!.arguments[0]!;
    expect(ts.isArrayLiteralExpression(entries)).toBe(true);
    const urls = (entries as ts.ArrayLiteralExpression).elements.map((entry) => {
      expect(ts.isObjectLiteralExpression(entry)).toBe(true);
      const property = (entry as ts.ObjectLiteralExpression).properties.find((item) => ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === "url") as ts.PropertyAssignment;
      expect(property).toBeDefined();
      expect(ts.isStringLiteral(property.initializer)).toBe(true);
      return (property.initializer as ts.StringLiteral).text;
    });
    expect(urls).toEqual(expect.arrayContaining(["index.html", "registerSW.js", "manifest.webmanifest", "icons/icon-192.svg", "icons/icon-512.svg"]));
    expect(urls.some((url) => /^assets\/pdf\.worker\.min-[\w-]+\.mjs$/.test(url))).toBe(true);
    expect(urls.some((url) => /^assets\/index-[\w-]+\.js$/.test(url))).toBe(true);
    expect(urls.some((url) => /^assets\/index-[\w-]+\.css$/.test(url))).toBe(true);
    for (const url of urls) {
      expect(url).toMatch(/^(?:index\.html|registerSW\.js|manifest\.webmanifest|icons\/icon-(?:192|512)\.svg|assets\/index-[\w-]+\.(?:js|css)|assets\/pdf\.worker\.min-[\w-]+\.mjs)$/);
    }
    // The only non-precache route is navigation to the cached app shell.
    const routes = named("registerRoute");
    expect(routes).toHaveLength(1);
    expect(routes[0]!.arguments[0]!.getText(worker)).toMatch(/new \w+\.NavigationRoute\(/);
    expect(named("createHandlerBoundToURL")[0]?.arguments[0]?.getText(worker)).toBe('"index.html"');
  }, 30_000);
});
