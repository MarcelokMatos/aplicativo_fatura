# Fatura Cartão PWA V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma PWA sem backend que leia localmente uma fatura Bradesco em PDF, produza os oito campos do Excel atual, permita revisão e copie valores tabulados para colagem manual no Google Sheets.

**Architecture:** Aplicação estática em TypeScript separada em extração posicional do PDF, parser Bradesco determinístico, domínio/normalização, conciliação, serialização para clipboard e interface. O navegador processa tudo em memória; não há upload, persistência de lançamentos, autenticação nem integração com Google na V1.

**Tech Stack:** Node.js 22 LTS, npm, TypeScript estrito, Vite, Vitest + jsdom, PDF.js (`pdfjs-dist`), `vite-plugin-pwa`, HTML/CSS sem framework, GitHub Pages após homologação.

**Spec:** `docs/superpowers/specs/2026-10-12-fatura-cartao-pwa-design.md`

## Global Constraints

- O cabeçalho exportado deve ser exatamente: `Data`, `Histórico`, `Moeda de origem`, `US$`, `Cotação US$`, `R$`, `Parcela`, `Valor`.
- Valores monetários permanecem `number` no domínio e são formatados somente na apresentação/exportação.
- O parser nunca deduplica linhas iguais; a ordem do PDF é preservada.
- O PDF e os lançamentos não saem do dispositivo nem são gravados em armazenamento persistente.
- PDFs reais, texto bruto, nomes, números de cartão e resultados identificáveis ficam fora do Git.
- Fixtures versionadas são sintéticas. A fatura fornecida é usada apenas na homologação manual local.
- Não adicionar backend, banco, OCR, LLM, login, Google Sheets ou previsão de parcelas.
- Cada tarefa termina com testes verdes e um commit pequeno. Não misturar refatorações não relacionadas.
- Convenção de commits: Conventional Commits em português ou inglês, sem dados pessoais.

## Review Focus

- Virada de ano: uma compra de dezembro em fatura de janeiro deve usar o ano anterior.
- Créditos com sinal antes ou depois do número devem continuar negativos.
- Duas compras idênticas devem gerar duas linhas.
- Pequenas mudanças de espaçamento, múltiplas páginas e múltiplos cartões não podem deslocar colunas.
- Se o layout não for reconhecido, a aplicação deve falhar de modo explícito, sem apresentar uma tabela aparentemente válida.
- O fallback de clipboard deve permitir cópia manual sem alterar tabs ou quebras de linha.

---

## Task 1: Criar o esqueleto executável e os contratos de domínio

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src/domain/transaction.ts`
- Create: `src/pdf/pdf-types.ts`
- Create: `tests/setup.ts`
- Create: `.gitignore`

**Interfaces:**

```ts
export interface InvoiceTransaction {
  date: string; // yyyy-MM-dd
  history: string;
  originalCurrency: number | null;
  usd: number | null;
  usdRate: number | null;
  brl: number | null;
  installment: string;
  value: number;
  source: { page: number; line: number };
  warnings: string[];
}

export interface PdfTextItem {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}
```

- [ ] **Step 1: Preparar somente a infraestrutura de testes**

Criar `package.json`, lockfile e configurações TypeScript/Vite/Vitest, instalar as dependências e criar `tests/setup.ts`. Ainda não criar `index.html` nem o código da aplicação.

Run: `npm install && npm run typecheck`

Expected: dependências instaladas e configuração válida, sem funcionalidade de produto.

- [ ] **Step 2: Escrever o teste de fumaça que falha**

Criar `tests/app-smoke.test.ts` verificando que `index.html` contém o título `Fatura do cartão`, um `input[type=file][accept="application/pdf"]` e um ponto de montagem `#app`.

- [ ] **Step 3: Executar o teste e confirmar a falha**

Run: `npm test -- --run tests/app-smoke.test.ts`

Expected: FAIL porque o projeto e a página ainda não existem.

- [ ] **Step 4: Implementar a base mínima**

Configurar scripts `dev`, `build`, `test`, `test:watch` e `typecheck`; ativar `strict`, `noUncheckedIndexedAccess` e ambiente `jsdom`. Criar a página inicial com área de upload e aviso “Seu PDF é processado somente neste aparelho”. Não implementar parser ainda.

- [ ] **Step 5: Validar base e tipos**

Run: `npm test -- --run tests/app-smoke.test.ts && npm run typecheck && npm run build`

Expected: PASS e build em `dist/`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html src tests .gitignore
git commit -m "chore: initialize invoice PWA"
```

## Task 2: Normalizar números, datas, parcelas e valor final

**Files:**

- Create: `src/domain/normalization.ts`
- Create: `tests/normalization.test.ts`

**Interfaces:**

```ts
export function parseBrDecimal(input: string): number | null;
export function inferTransactionDate(dayMonth: string, referenceDate: Date): string;
export function extractInstallment(history: string): {
  history: string;
  installment: string;
};
export function chooseTransactionValue(
  brl: number | null,
  originalCurrency: number | null,
): number | null;
```

- [ ] **Step 1: Escrever testes de normalização que falham**

Cobrir `1.234,56`, `-123,45`, `123,45-`, espaços não separáveis, string vazia e inválida. Cobrir `12/12` com referência `2026-01-10` resultando em `2025-12-12`, `05/01` resultando em `2026-01-05`, ano bissexto inválido, `LOJA 02/10` no final, barra interna que não é parcela e default `1/1`. Cobrir preferência por `R$` e fallback para moeda de origem.

- [ ] **Step 2: Confirmar as falhas**

Run: `npm test -- --run tests/normalization.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar apenas as regras testadas**

Fazer parsing independente de locale. Validar datas em UTC para evitar diferença de fuso. Reconhecer parcela apenas por token completo `\b\d{1,2}/\d{1,2}\b` na posição estruturada do final do histórico e remover somente esse token.

- [ ] **Step 4: Executar testes e tipos**

Run: `npm test -- --run tests/normalization.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/normalization.ts tests/normalization.test.ts
git commit -m "feat: normalize invoice transaction fields"
```

## Task 3: Extrair texto posicional e reconstruir linhas do PDF

**Files:**

- Create: `src/pdf/extract-pdf.ts`
- Create: `src/pdf/group-lines.ts`
- Create: `tests/fixtures/pdf-items.synthetic.ts`
- Create: `tests/group-lines.test.ts`

**Interfaces:**

```ts
export interface PdfTextLine {
  page: number;
  line: number;
  y: number;
  items: PdfTextItem[]; // x crescente
  text: string;
}

export async function extractPdfPages(data: ArrayBuffer): Promise<PdfPageText[]>;
export function groupTextItemsIntoLines(
  page: PdfPageText,
  yTolerance?: number,
): PdfTextLine[];
```

- [ ] **Step 1: Criar fixture sintética e testes que falham**

Simular itens fora de ordem, textos na mesma linha com pequena variação vertical, linhas próximas distintas e uma página vazia. Exigir ordenação por `y` visual e por `x` dentro da linha, mantendo número de página e linha.

- [ ] **Step 2: Confirmar a falha**

Run: `npm test -- --run tests/group-lines.test.ts`

Expected: FAIL por funções inexistentes.

- [ ] **Step 3: Implementar agrupamento e adaptador PDF.js**

Usar `getDocument({ data })`, iterar páginas, converter `TextItem.transform` em `x/y`, e configurar worker como recurso empacotado pelo Vite. O agrupador deve ser puro e testável sem abrir PDF real.

- [ ] **Step 4: Verificar testes, tipos e bundle**

Run: `npm test -- --run tests/group-lines.test.ts && npm run typecheck && npm run build`

Expected: PASS; nenhum worker ausente no build.

- [ ] **Step 5: Commit**

```bash
git add src/pdf tests/fixtures/pdf-items.synthetic.ts tests/group-lines.test.ts package.json package-lock.json
git commit -m "feat: extract positional PDF text"
```

## Task 4: Interpretar o layout Bradesco com fixtures sintéticas

**Files:**

- Create: `src/parsers/bradesco-layout.ts`
- Create: `src/parsers/bradesco-parser.ts`
- Create: `tests/fixtures/bradesco-invoice.synthetic.ts`
- Create: `tests/bradesco-parser.test.ts`

**Interfaces:**

```ts
export interface InvoiceSummary {
  referenceDate: string;
  purchasesAndDebits: number | null;
  invoiceTotal: number | null;
}

export interface ParserDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  page?: number;
  line?: number;
}

export interface ParsedInvoice {
  transactions: InvoiceTransaction[];
  summary: InvoiceSummary;
  diagnostics: ParserDiagnostic[];
  recognizedLayout: boolean;
}

export function parseBradescoInvoice(pages: PdfPageText[]): ParsedInvoice;
```

- [ ] **Step 1: Escrever testes de parser que falham**

Criar fixtures sintéticas com: dois cartões, quebra de página, compra nacional, compra internacional, crédito com hífen final, parcela, compra sem parcela, duas compras idênticas e conteúdo administrativo. Exigir a ordem original, exclusão de cabeçalhos/totais/pagamento, preservação das duplicadas, oito campos coerentes e diagnóstico para linha com data/histórico sem valor.

- [ ] **Step 2: Adicionar testes de falha segura**

Exigir `recognizedLayout: false`, transações vazias e diagnóstico `LAYOUT_NOT_RECOGNIZED` quando marcadores essenciais do Bradesco não existirem. Exigir erro para resumo sem data de referência, pois o ano não pode ser inferido com segurança.

- [ ] **Step 3: Confirmar as falhas**

Run: `npm test -- --run tests/bradesco-parser.test.ts`

Expected: FAIL por parser inexistente.

- [ ] **Step 4: Implementar reconhecimento por regiões e colunas**

Detectar marcadores do documento e limites das colunas pelas posições dos cabeçalhos. Associar itens pela coordenada `x`, não por `split` de espaços. Aplicar lista explícita de linhas administrativas. Criar uma transação para cada linha candidata; nunca usar chave de deduplicação.

- [ ] **Step 5: Executar suíte focal e cobertura**

Run: `npm test -- --run tests/bradesco-parser.test.ts --coverage`

Expected: PASS; ramos críticos de sinais, parcelas, filtros e falha segura exercitados.

- [ ] **Step 6: Commit**

```bash
git add src/parsers tests/fixtures/bradesco-invoice.synthetic.ts tests/bradesco-parser.test.ts
git commit -m "feat: parse Bradesco invoice layout"
```

## Task 5: Conciliar lançamentos e bloquear falso sucesso

**Files:**

- Create: `src/domain/reconciliation.ts`
- Create: `tests/reconciliation.test.ts`

**Interfaces:**

```ts
export interface ReconciliationResult {
  positiveTotal: number;
  negativeTotal: number;
  netTotal: number;
  controlTotal: number | null;
  difference: number | null;
  isBalanced: boolean;
}

export function reconcileInvoice(
  transactions: InvoiceTransaction[],
  controlTotal: number | null,
  tolerance?: number,
): ReconciliationResult;
```

- [ ] **Step 1: Escrever testes que falham**

Cobrir débitos, créditos, resultado líquido, arredondamento em centavos, tolerância de R$ 0,01, controle ausente e resultado não conciliado. O controle ausente nunca é `isBalanced: true`.

- [ ] **Step 2: Confirmar a falha**

Run: `npm test -- --run tests/reconciliation.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar aritmética em centavos**

Converter cada valor para centavos antes de somar para evitar ruído binário e devolver números em reais.

- [ ] **Step 4: Executar testes**

Run: `npm test -- --run tests/reconciliation.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reconciliation.ts tests/reconciliation.test.ts
git commit -m "feat: reconcile extracted invoice totals"
```

## Task 6: Serializar exatamente as oito colunas e copiar com fallback

**Files:**

- Create: `src/export/clipboard.ts`
- Create: `tests/clipboard.test.ts`

**Interfaces:**

```ts
export const OUTPUT_HEADERS: readonly string[];
export function serializeTransactionsForClipboard(
  transactions: InvoiceTransaction[],
): string;
export function formatTransactionDate(isoDate: string): string;
export async function copyTransactions(
  transactions: InvoiceTransaction[],
  clipboard?: Pick<Clipboard, "writeText">,
): Promise<{ copied: boolean; text: string }>;
```

- [ ] **Step 1: Escrever testes de saída que falham**

Exigir cabeçalho exato, tabs, CRLF ou LF consistente, data `dd/MM/yyyy`, vírgula decimal sem símbolo, célula vazia para `null`, negativos e nenhuma fórmula. Simular `clipboard.writeText` disponível, rejeitado e ausente.

- [ ] **Step 2: Confirmar a falha**

Run: `npm test -- --run tests/clipboard.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar serialização pura e fallback**

Escapar tabs/quebras internas do histórico como espaços para não deslocar colunas. Se Clipboard API falhar, devolver `copied: false` e o texto intacto para a interface selecionar em um `textarea`.

- [ ] **Step 4: Executar testes**

Run: `npm test -- --run tests/clipboard.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/export/clipboard.ts tests/clipboard.test.ts
git commit -m "feat: export invoice rows to clipboard"
```

## Task 7: Integrar upload, revisão editável e confirmação de cópia

**Files:**

- Create: `src/app/invoice-controller.ts`
- Create: `src/ui/render-app.ts`
- Create: `src/ui/transaction-table.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `index.html`
- Create: `tests/invoice-controller.test.ts`
- Create: `tests/ui-flow.test.ts`

**Interfaces:**

```ts
export type AppStatus =
  | "idle"
  | "reading"
  | "ready"
  | "unsupported"
  | "error";

export interface InvoiceAppState {
  status: AppStatus;
  fileName: string | null;
  pageCount: number;
  transactions: InvoiceTransaction[];
  reconciliation: ReconciliationResult | null;
  diagnostics: ParserDiagnostic[];
  originalTransactions: InvoiceTransaction[];
}
```

- [ ] **Step 1: Escrever testes do controlador que falham**

Injetar extrator/parser como dependências. Cobrir rejeição de não-PDF, estado de leitura, resultado pronto, layout não suportado, edição de célula, exclusão, restauração original e recálculo automático da conciliação.

- [ ] **Step 2: Escrever testes do fluxo visual que falham**

Cobrir resumo, oito colunas, aviso de linha suspeita, botão de cópia, bloqueio quando não conciliado, confirmação explícita “Copiar mesmo assim” e fallback com `textarea` selecionável.

- [ ] **Step 3: Confirmar as falhas**

Run: `npm test -- --run tests/invoice-controller.test.ts tests/ui-flow.test.ts`

Expected: FAIL porque controlador e UI não existem.

- [ ] **Step 4: Implementar fluxo completo com dependências injetáveis**

Manter a fonte de verdade no estado em memória. Editores monetários usam texto durante edição e só atualizam o domínio após validação. Excluir linha requer ação explícita. O botão de restauração reprocessa a cópia original em memória.

- [ ] **Step 5: Implementar layout responsivo acessível**

Usar tabela com rolagem horizontal em telas pequenas, cabeçalhos fixos quando possível, labels associados, foco visível, status com `aria-live` e cores que não sejam o único sinal de erro.

- [ ] **Step 6: Executar testes, tipos e build**

Run: `npm test -- --run tests/invoice-controller.test.ts tests/ui-flow.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src index.html tests/invoice-controller.test.ts tests/ui-flow.test.ts
git commit -m "feat: add invoice review and copy workflow"
```

## Task 8: Tornar instalável/offline e verificar privacidade

**Files:**

- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.svg`
- Create: `public/icons/icon-512.svg`
- Modify: `vite.config.ts`
- Create: `tests/pwa-config.test.ts`
- Create: `tests/privacy-boundary.test.ts`

- [ ] **Step 1: Escrever testes de PWA e fronteira de rede que falham**

Validar nome, `display: standalone`, `start_url`, ícones e configuração do service worker. Verificar estaticamente que o fluxo de processamento não usa `fetch`, `XMLHttpRequest`, IndexedDB, `localStorage` ou `sessionStorage` para PDF/transações.

- [ ] **Step 2: Confirmar as falhas**

Run: `npm test -- --run tests/pwa-config.test.ts tests/privacy-boundary.test.ts`

Expected: FAIL por manifesto/configuração ausentes.

- [ ] **Step 3: Implementar PWA mínima**

Adicionar manifesto, ícones simples do próprio projeto e cache apenas do shell estático. Não colocar PDF, blobs ou estado da fatura em runtime caching.

- [ ] **Step 4: Gerar e inspecionar o build**

Run: `npm test -- --run tests/pwa-config.test.ts tests/privacy-boundary.test.ts && npm run build`

Expected: PASS; `dist/manifest.webmanifest` e service worker presentes.

- [ ] **Step 5: Commit**

```bash
git add public vite.config.ts tests/pwa-config.test.ts tests/privacy-boundary.test.ts package.json package-lock.json
git commit -m "feat: add offline installable PWA shell"
```

## Task 9: Homologar com a fatura real sem versionar dados pessoais

**Files:**

- Create: `scripts/verify-local-invoice.mjs`
- Create: `docs/homologacao-v1.md`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Proteger dados locais antes do teste**

Adicionar a `.gitignore`: `private/`, `*.private.pdf`, `homologacao-local/` e resultados locais. Confirmar que o PDF fornecido não está no índice.

Run: `git ls-files | grep -Ei '\.(pdf|xlsx)$|private|homologacao-local'`

Expected: nenhum arquivo pessoal listado.

- [ ] **Step 2: Criar verificador local sem snapshot de dados**

O script recebe o caminho via argumento, executa o mesmo extrator/parser e imprime somente: páginas, quantidade de lançamentos, totais, diferença, códigos de diagnóstico e hashes não reversíveis opcionais. Não imprimir históricos, nomes ou cartões.

Run: `node scripts/verify-local-invoice.mjs <CAMINHO_LOCAL_DA_FATURA.pdf>`

Expected: layout reconhecido, lançamentos > 0 e diferença de conciliação até R$ 0,01; se falhar, voltar à Task 4 e adicionar primeiro uma fixture sintética que reproduza o caso.

- [ ] **Step 3: Testar manualmente a saída contra o Excel atual**

Comparar, em ambiente local e sem salvar no repositório: quantidade e ordem das linhas; oito colunas; parcelas; créditos; soma; colagem em Excel e Google Sheets. Registrar apenas “aprovado/reprovado” e métricas não identificáveis em `docs/homologacao-v1.md`.

- [ ] **Step 4: Testar em Android e computador**

Validar upload, edição, exclusão, cópia, confirmação de divergência, instalação e reabertura offline. Repetir com duas ou três faturas adicionais antes de marcar o parser como estável.

- [ ] **Step 5: Executar verificação final automatizada**

Run: `npm test -- --run && npm run typecheck && npm run build && git status --short`

Expected: todos os testes passam; build passa; status contém somente mudanças intencionais e nenhum PDF/XLSX real.

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/verify-local-invoice.mjs docs/homologacao-v1.md README.md
git commit -m "docs: add private invoice homologation workflow"
```

## Task 10: Preparar publicação estática e entrega

**Files:**

- Create: `.github/workflows/deploy-pages.yml`
- Modify: `vite.config.ts`
- Modify: `README.md`
- Create: `docs/release-checklist.md`

- [ ] **Step 1: Escrever o teste de configuração de base path que falha**

Adicionar caso em `tests/pwa-config.test.ts` exigindo que o build aceite `VITE_BASE_PATH` e use `/` como fallback local.

- [ ] **Step 2: Confirmar a falha**

Run: `npm test -- --run tests/pwa-config.test.ts`

Expected: FAIL porque o base path ainda é fixo.

- [ ] **Step 3: Implementar configuração publicável**

Configurar Vite/PWA para base dinâmica. Criar workflow do GitHub Pages com `npm ci`, suíte completa, `npm run build` e upload de `dist/`. O workflow só será ativado após o repositório pessoal ser conectado.

- [ ] **Step 4: Documentar execução e limites**

No README, incluir: pré-requisitos, `npm ci`, `npm run dev`, testes, build, privacidade, formatos suportados, como instalar no Android e como colar no Google Sheets. Não prometer suporte a layouts não homologados.

- [ ] **Step 5: Verificação antes da entrega**

Run: `npm ci && npm test -- --run && npm run typecheck && VITE_BASE_PATH=/fatura-cartao-pwa/ npm run build`

Expected: PASS em ambiente limpo.

- [ ] **Step 6: Revisar histórico e dados sensíveis**

Run: `git status --short && git log --oneline --decorate -12 && git grep -nEi 'marcelo|daniela|[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}' -- ':!docs/superpowers/specs/*'`

Expected: árvore limpa e nenhuma informação pessoal fora de documentação deliberadamente revisada; nenhum PDF real no histórico.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy-pages.yml vite.config.ts README.md docs/release-checklist.md tests/pwa-config.test.ts
git commit -m "ci: prepare static GitHub Pages deployment"
```

## Definition of Done

- [ ] Todos os critérios de aceite da especificação foram demonstrados.
- [ ] A fatura fornecida e pelo menos duas adicionais foram homologadas localmente.
- [ ] Testes, typecheck e build passam em instalação limpa.
- [ ] A colagem no Google Sheets mantém as oito colunas sem fórmulas.
- [ ] Nenhum PDF ou dado pessoal está no Git, no bundle ou no cache persistente.
- [ ] Marcelo e sua esposa conseguem executar o fluxo em Android e computador.
- [ ] A publicação estática só ocorre depois da aprovação explícita da homologação.
