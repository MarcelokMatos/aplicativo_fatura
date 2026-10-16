# Homologação V1 — execução parcial da Task 9

Data da verificação: 16/10/2026. A fatura inicial permanece conciliada, mas a homologação está reprovada até a revisão manual de um sufixo de parcela inválido. A Task 9 permanece parcial e a V1 ainda não foi homologada como estável.

## Resultado agregado da fatura inicial

Verificador executado localmente após as correções do parser até o commit `9b79c8a`, sem gravar o PDF, o texto extraído ou os lançamentos no repositório.

| Critério | Resultado |
|---|---|
| Layout reconhecido | Sim |
| Páginas | 4 |
| Lançamentos extraídos | 122 |
| Conciliação dentro de R$ 0,01 | Sim |
| Diagnósticos | `INVALID_INSTALLMENT_SUFFIX` |
| Exit code | 1, esperado enquanto a revisão estiver pendente |

Esses agregados não comprovam igualdade linha a linha com a planilha de referência. Não são registrados nomes, cartões, históricos, datas privadas, valores individuais ou totais financeiros. O XLSX não foi aberto nesta etapa.

## Evidência automatizada

Ambiente verificado: Node.js `v24.21.0` e npm `11.19.0`.

| Comando executado | Resultado |
|---|---|
| `npm test -- --run tests/verify-local-invoice.test.ts` | 9/9 aprovados |
| `npm test -- --run` | 14 arquivos, 236/236 aprovados |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0 |
| `node --check scripts/verify-local-invoice.mjs` | Exit 0 |
| `git diff --check` | Exit 0 |
| `node scripts/verify-local-invoice.mjs <PDF>` | Exit 1; resultado agregado acima e falha explícita de parcela |

Os testes do CLI usam PDFs inventados e executam os mesmos módulos de extração, parser e conciliação. Cobrem sucesso, tolerância, divergência, layout desconhecido, referência ausente/ambígua, zero lançamentos, falha de leitura, PDF inválido e argumento ausente. Também verificam esquema de saída, ausência de conteúdo sintético reservado e stderr vazio.

O CLI não grava resultados, não lê XLSX, não sobe servidor e não envia o documento. Retorna somente reconhecimento, contagens, conciliação booleana e códigos de diagnóstico permitidos. Bibliotecas e exceções não encaminham seus textos à saída.

## Proteção dos materiais locais

- [x] `.gitignore` já protege `private/`, `homologacao-local/`, PDFs e XLSX; nenhuma alteração necessária.
- [x] PDF de entrada confirmado como ignorado antes da execução.
- [x] Auditoria de caminhos no índice e histórico: nenhum candidato PDF/XLSX/arquivo de diretório privado.
- [x] Nenhum snapshot ou dado financeiro real incluído nesta documentação.

O [README](../README.md#homologação-privada) descreve o comando e a resolução do argumento por variável PowerShell. Arquivos e resultados reais devem permanecer em diretórios ignorados. Não anexar conteúdo bruto aos relatos de falha; reproduzir a estrutura com fixture sintética.

## Pendências obrigatórias de homologação

- [ ] Revisar manualmente o sufixo de parcela inválido sinalizado pela aplicação; o parser preserva o texto e não inventa o dígito ausente.
- [ ] Comparação manual com XLSX: quantidade e ordem das linhas, oito colunas, parcelas, créditos, duplicatas e soma. Pendente; planilha não aberta.
- [ ] Colagem real em Excel: cabeçalho, oito colunas, sinais e valores sem fórmulas. Pendente.
- [ ] Colagem real em Google Sheets: mesma estrutura, sem reorganização manual. Pendente; nenhuma integração direta criada.
- [ ] Computador: upload, edição, exclusão, restauração, confirmação de divergência e cópia/fallback no navegador. Pendente de validação manual.
- [ ] Android: fluxo completo em tela pequena e instalação da PWA. Pendente.
- [ ] Instalação/reabertura offline após o primeiro carregamento, em Android e computador. Pendente.
- [ ] Confirmar no navegador que PDF/transações não aparecem em requisições nem armazenamento persistente. Pendente de inspeção manual; testes estáticos não substituem essa evidência.
- [ ] Processar mais duas ou três faturas reais adicionais e registrar apenas status/métricas não identificáveis. Pendente.

Somente após demonstrar essas pendências será possível avaliar a conclusão da Task 9 e a estabilidade da V1. Publicação permanece fora desta etapa.
