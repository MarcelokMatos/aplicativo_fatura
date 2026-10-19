# Fatura Cartão PWA

PWA para extrair uma fatura Bradesco, revisar lançamentos e copiar valores tabulados. O processamento é local no navegador, sem backend, banco, login, OCR, LLM ou integração direta com Google Sheets. O service worker guarda somente o shell estático; a aplicação não persiste o PDF nem os lançamentos.

> **Status:** <https://marcelokmatos.github.io/aplicativo_fatura/> é uma beta de homologação, ainda não homologada. A publicação serve para testar navegador, instalação e uso offline em dispositivos reais; não representa uma V1 estável.

A saída tem exatamente oito colunas, nesta ordem:

```text
Data	Histórico	Moeda de origem	US$	Cotação US$	R$	Parcela	Valor
```

A cópia inclui cabeçalho e valores, sem fórmulas. Compras repetidas não são deduplicadas. Resultados divergentes exigem revisão e confirmação explícita antes da cópia.

## Executar localmente

Pré-requisitos: Node.js `>=22.22.2` e npm.

```sh
npm ci
npm run dev
```

Abra o endereço local informado pelo Vite, selecione um PDF, confira a tabela e a conciliação. É possível editar, excluir e restaurar linhas; inclusão manual fica fora da V1. O botão de cópia prepara a colagem manual em planilhas, cuja homologação permanece pendente.

```sh
npm test -- --run
npm run typecheck
npm run build
```

O build gera `dist/`; esses comandos locais não publicam a aplicação. A única publicação preparada nesta etapa é a beta estática para homologação em dispositivos reais.

Para reproduzir o build hospedado no GitHub Pages:

```powershell
$env:VITE_BASE_PATH = '/aplicativo_fatura/'
npm run build
Remove-Item Env:VITE_BASE_PATH
```

O workflow de GitHub Pages executa instalação limpa, testes, typecheck e build antes de enviar `dist/`. Consulte o [checklist de publicação beta](docs/release-checklist.md). Push e deploy exigem autorização explícita.

## Usar no computador ou Android

No computador, abra a URL beta em um navegador atual, selecione o PDF e revise a conciliação antes de copiar. No Android, abra a mesma URL no Chrome, use **Instalar app** ou **Adicionar à tela inicial** no menu e carregue a aplicação uma vez com internet antes de testar a reabertura offline.

Para colar no Excel ou Google Sheets, selecione **Copiar tabela** e cole na primeira célula vazia. A saída contém oito colunas e a parcela é exportada como texto para não virar data. Se houver divergência, revise os avisos e use **Copiar mesmo assim** somente após confirmação consciente.

O suporte atual se limita a faturas Bradesco com texto extraível e ao layout em homologação. PDFs digitalizados, outros bancos e layouts ainda não homologados não são suportados.

## Homologação privada

Guarde faturas e planilhas reais somente em `private/`, já ignorado pelo Git. Também estão ignorados `homologacao-local/`, PDFs e XLSX. Não versionar texto bruto, exportações reais, nomes, cartões, históricos ou dados financeiros. Resultados locais, se necessários, devem permanecer em diretório ignorado.

O verificador lê um PDF e reutiliza o mesmo extrator, parser e conciliador da aplicação. No Node, carrega o build `legacy` já instalado do PDF.js; não requer servidor nem dependência adicional.

Substitua `<PDF>` por um caminho local:

```sh
node scripts/verify-local-invoice.mjs "<PDF>"
```

Para verificar o único PDF sob `private/` sem escrever seu nome no comando PowerShell:

```powershell
$localInvoicePdfs = @(Get-ChildItem -LiteralPath 'private' -Recurse -File -Filter '*.pdf')
if ($localInvoicePdfs.Count -ne 1) { Write-Output 'PRIVATE_PDF_COUNT_INVALID'; exit 1 }
git check-ignore --quiet -- $localInvoicePdfs[0].FullName
if ($LASTEXITCODE -ne 0) { Write-Output 'PRIVATE_PDF_NOT_IGNORED'; exit 1 }
node scripts/verify-local-invoice.mjs $localInvoicePdfs[0].FullName
```

A saída é um único JSON com `recognized`, `pages`, `transactions`, `balancedWithinOneCent` e `diagnostics`. Não contém caminhos, nomes, texto do documento, valores individuais ou totais monetários. Saídas de bibliotecas e mensagens de exceção são silenciadas; diagnósticos usam somente códigos permitidos, com `PARSER_DIAGNOSTIC` para código desconhecido. O comando não grava snapshot nem lê XLSX.

Exit `0` exige layout reconhecido, quantidade positiva, conciliação dentro de R$ 0,01 e nenhum diagnóstico. Qualquer outro resultado retorna `1`. Em caso de falha, interrompa a homologação e reproduza a estrutura com fixture sintética antes de corrigir o parser; não aceite falso sucesso.

## Checklist e limites

A Task 9 permanece parcial. O resultado automatizado e suas evidências estão em [Homologação V1](docs/homologacao-v1.md). Um PDF conciliado não comprova igualdade linha a linha com o Excel nem estabilidade para outros layouts.

- [ ] Comparação manual com XLSX: quantidade, ordem, oito colunas, parcelas, créditos, duplicatas e soma.
- [ ] Colagem real em Excel e Google Sheets: oito colunas, cabeçalho e valores sem fórmulas.
- [ ] Fluxo completo em Android e computador: upload, edição, exclusão, restauração e cópia com confirmação de divergência.
- [ ] Instalação e reabertura offline após o primeiro carregamento; conferir ausência de PDF/transações em rede e armazenamento persistente.
- [ ] Processar mais duas ou três faturas reais antes de declarar o parser estável.

Não há garantia para outros bancos, PDFs sem texto extraível ou layouts ainda não homologados. As fixtures versionadas devem ser exclusivamente sintéticas ou sanitizadas.
