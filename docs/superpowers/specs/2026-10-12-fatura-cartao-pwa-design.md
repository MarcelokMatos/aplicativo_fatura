# Fatura Cartão PWA — Especificação da V1

Data: 12/10/2026

## 1. Objetivo

Substituir o tratamento mensal da fatura Bradesco feito em Excel e Power Query por uma aplicação web instalável no Android e utilizável no computador.

A aplicação deve receber uma fatura em PDF, extrair e tratar os lançamentos no próprio aparelho, permitir conferência e copiar para o clipboard uma tabela com a mesma estrutura lógica do Excel atual.

## 2. Usuários e resultado esperado

Os usuários da V1 são Marcelo e sua esposa. Ambos devem conseguir usar a aplicação por uma URL no Android ou no computador, sem depender de uma licença do Excel.

O fluxo mensal será:

1. Baixar a fatura em PDF.
2. Abrir a aplicação.
3. Selecionar o PDF.
4. Conferir os lançamentos extraídos e a conciliação.
5. Corrigir eventuais linhas suspeitas.
6. Copiar a tabela tratada.
7. Colar os dados manualmente no destino desejado.

O Google Sheets permanece fora da aplicação na V1. A integração direta será considerada somente depois da homologação do parser e do processo de cópia.

## 3. Escopo da V1

### Incluído

- Aplicação web progressiva (PWA) responsiva.
- Uso em Android e navegadores de computador.
- Seleção manual de um PDF de fatura Bradesco.
- Leitura local do PDF com PDF.js.
- Parser determinístico para o modelo de fatura fornecido.
- Extração das oito colunas usadas pelo Excel atual.
- Prévia editável dos lançamentos.
- Identificação visual de linhas suspeitas.
- Resumo financeiro e conciliação.
- Cópia da tabela completa para o clipboard.
- Funcionamento sem backend e sem banco de dados.
- Testes automatizados do parser e da conciliação.
- Publicação como site estático após a homologação.

### Não incluído

- Login no banco ou download automático da fatura.
- Integração de escrita com Google Sheets.
- Banco de dados próprio.
- Cadastro de usuários.
- Dashboard financeiro.
- Classificação de despesas por categoria.
- Uso de LLM, OCR ou IA para interpretar a fatura.
- Aplicativo Android nativo ou publicação na Play Store.
- Suporte a outros bancos ou formatos de fatura.
- Previsão automática de parcelas futuras.

## 4. Arquitetura

A V1 será uma aplicação estática executada no navegador.

### Componentes

1. **Interface**
   - Seleção do PDF.
   - Resumo da extração.
   - Tabela editável.
   - Avisos e validações.
   - Ação de copiar.

2. **Extrator de PDF**
   - Lê páginas e itens de texto com suas coordenadas.
   - Não depende apenas da ordem linear do texto.
   - Entrega uma representação intermediária por página e linha.

3. **Parser Bradesco**
   - Reconhece cabeçalhos, seções de cartão e linhas de lançamento.
   - Descarta conteúdo administrativo e financeiro que não representa lançamento.
   - Converte cada lançamento para o modelo interno.

4. **Normalizador**
   - Normaliza datas, valores, sinais e parcelas.
   - Mantém os valores das colunas de origem.
   - Calcula a coluna final `Valor`.

5. **Conciliador**
   - Soma débitos, créditos/estornos e total líquido.
   - Compara o total extraído com o resumo da fatura.
   - Aponta diferença e registros suspeitos.

6. **Exportador para clipboard**
   - Produz texto tabulado com cabeçalho.
   - Preserva a ordem das oito colunas.
   - Formata valores e datas para colagem em planilhas.

### Execução e privacidade

- O PDF é lido no aparelho do usuário.
- O arquivo não é enviado para servidor, IA ou serviço externo.
- Nenhum lançamento é persistido após fechar ou atualizar a aplicação.
- O site publicado contém apenas código e recursos estáticos.
- Faturas reais não devem ser versionadas no repositório.
- Fixtures de teste permanentes devem ser sintéticas ou sanitizadas.

## 5. Modelo de dados

Cada lançamento tratado terá:

| Campo | Tipo | Regra |
|---|---|---|
| Data | data | Data do lançamento apresentada na fatura |
| Histórico | texto | Descrição do estabelecimento ou evento |
| Moeda de origem | decimal opcional | Valor extraído da coluna correspondente |
| US$ | decimal opcional | Valor em dólar quando existir |
| Cotação US$ | decimal opcional | Cotação informada quando existir |
| R$ | decimal opcional | Valor em reais quando existir |
| Parcela | texto | Padrão `n/n`; caso não exista, `1/1` |
| Valor | decimal | `R$` quando preenchido; caso contrário, `Moeda de origem` |

Os valores devem permanecer numéricos internamente. Formatação com vírgula decimal será aplicada somente na apresentação e na exportação.

## 6. Regras do parser

### Identificação de lançamentos

Uma linha candidata deve começar com uma data no padrão `dd/mm` e conter uma descrição de lançamento. A associação das colunas deve considerar a posição horizontal do texto na página.

### Linhas excluídas

O parser deve excluir, no mínimo:

- Saldo anterior.
- Pagamento por débito em conta ou outro pagamento da fatura.
- Cabeçalhos de tabela.
- Nome isolado do titular.
- Número isolado do cartão.
- Linhas `Total para ...`.
- Totais gerais e subtotais.
- Mensagens, taxas informativas, limites e textos administrativos.
- Linhas vazias ou sem histórico.

Estornos e créditos que sejam lançamentos reais devem permanecer com sinal negativo.

### Parcelas

- Reconhecer parcela somente quando houver um token completo no padrão `n/n` associado ao final ou à parte estruturada do histórico.
- Não tratar qualquer barra presente em um nome ou texto como parcela.
- Normalizar zeros à esquerda quando necessário.
- Usar `1/1` quando não houver parcelamento reconhecido.
- Não calcular nem projetar a próxima parcela na V1.

### Datas sem ano

O PDF normalmente apresenta apenas dia e mês nos lançamentos. O ano será inferido a partir do vencimento da fatura:

- O lançamento não pode ficar depois da data de fechamento/vencimento usada como referência.
- Quando o mês do lançamento for posterior ao mês de referência, usar o ano anterior.
- A inferência deve ser testada especialmente em faturas de janeiro.

### Valores

- Converter formato brasileiro sem depender da localidade do navegador.
- Preservar negativos indicados por hífen após ou antes do valor.
- Não deduplicar lançamentos apenas por data, histórico e valor, pois compras legítimas podem se repetir.
- Rejeitar como suspeita qualquer linha com data e histórico, mas sem valor utilizável.

## 7. Saída para o clipboard

O botão `Copiar tabela` deve gerar texto separado por tabulações e linhas, incluindo o cabeçalho:

```text
Data	Histórico	Moeda de origem	US$	Cotação US$	R$	Parcela	Valor
```

Regras:

- Ordem fixa das oito colunas.
- Uma linha por lançamento.
- Datas no formato `dd/MM/yyyy`.
- Valores decimais usando vírgula na saída destinada à planilha.
- Células opcionais vazias, sem os textos `null` ou `undefined`.
- Créditos e estornos com sinal negativo.
- Nenhuma fórmula na saída.
- A ordem dos lançamentos deve seguir a ordem encontrada na fatura.

## 8. Interface

### Estado inicial

- Área para selecionar ou arrastar o PDF.
- Informação clara de que o processamento ocorre no aparelho.
- Aceitar apenas PDF.

### Após a extração

- Nome do arquivo.
- Quantidade de páginas.
- Quantidade de lançamentos.
- Totais positivos, negativos e líquido.
- Valor de controle encontrado no resumo da fatura.
- Diferença da conciliação.
- Tabela com as oito colunas.

### Edição

O usuário poderá:

- Editar qualquer célula de um lançamento.
- Excluir uma linha.
- Restaurar a extração original reiniciando o processamento do arquivo.

Inclusão manual de novas linhas não faz parte da V1. Uma linha ausente deve ser tratada como falha do parser, não mascarada como operação normal.

### Cópia

- O botão deve copiar cabeçalho e registros visíveis.
- Exibir confirmação de sucesso.
- Se a conciliação falhar, destacar o problema antes da cópia.
- Permitir `Copiar mesmo assim` somente após confirmação explícita do usuário.

## 9. Erros e comportamento seguro

| Situação | Comportamento |
|---|---|
| Arquivo não é PDF | Recusar e orientar o usuário |
| PDF sem texto extraível | Informar que o modelo não é suportado; não aplicar OCR silenciosamente |
| Layout não reconhecido | Não produzir resultado aparentemente válido; mostrar diagnóstico |
| Linha parcialmente reconhecida | Marcar como suspeita e manter visível para revisão |
| Total não conciliado | Exibir diferença e exigir confirmação antes de copiar |
| Clipboard indisponível | Selecionar a saída tabulada para cópia manual |
| Falha inesperada | Mostrar mensagem curta e preservar diagnóstico técnico copiável |

## 10. Testes

### Testes unitários

- Conversão de valores brasileiros.
- Valores negativos.
- Inferência de ano.
- Reconhecimento de parcelas.
- Falso positivo de barra no histórico.
- Coalescência entre `R$` e `Moeda de origem`.
- Serialização tabulada.

### Testes do parser

- Fatura fornecida como caso de homologação local, sem versionar o PDF real.
- Documento sanitizado com múltiplos cartões.
- Compras nacionais.
- Compras internacionais.
- Estornos e créditos.
- Compras repetidas legítimas.
- Parcelas de diferentes quantidades.
- Mudança pequena de espaçamento ou quebra de página.

### Testes de interface

- Upload no Android.
- Edição e exclusão de linhas.
- Aviso de conciliação.
- Cópia para Excel.
- Cópia para Google Sheets.
- Layout em tela pequena.
- Reabertura offline após o primeiro carregamento.

## 11. Critérios de aceite

A V1 estará homologada quando:

1. A fatura fornecida gerar todos os lançamentos esperados e nenhum registro administrativo.
2. O total líquido extraído reconciliar com a fatura dentro de R$ 0,01.
3. Estornos e créditos preservarem o sinal.
4. Parcelas forem reconhecidas corretamente sem falsos positivos conhecidos.
5. A tabela copiada puder ser colada sem reorganização das colunas.
6. O fluxo completo funcionar em pelo menos um Android e um computador.
7. O PDF não aparecer em requisições de rede nem em armazenamento persistente.
8. Os testes automatizados críticos estiverem aprovados.
9. Duas ou três faturas adicionais forem processadas na homologação antes de declarar o parser estável.

## 12. Estrutura do projeto

```text
fatura-cartao-pwa/
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── src/
│   ├── domain/
│   │   ├── reconciliation.ts
│   │   └── transaction.ts
│   ├── export/
│   │   └── clipboard.ts
│   ├── parsers/
│   │   └── bradesco-parser.ts
│   ├── pdf/
│   │   └── extract-pdf.ts
│   ├── ui/
│   │   └── transaction-table.ts
│   └── main.ts
├── tests/
│   ├── parser.test.ts
│   └── reconciliation.test.ts
├── index.html
├── package.json
└── vite.config.ts
```

## 13. Desenvolvimento e publicação

- O projeto será desenvolvido e testado no ambiente de trabalho desta conversa.
- O código será preparado como repositório Git independente.
- Como a integração direta com GitHub está bloqueada no workspace atual, a primeira entrega poderá ser disponibilizada em arquivo compactado.
- O repositório pessoal será criado ou conectado posteriormente, fora do workspace corporativo.
- A publicação prevista é estática, inicialmente por GitHub Pages ou serviço equivalente.
- A escolha final do host não altera o parser nem a interface.

## 14. Evolução posterior

Após homologar a V1, as evoluções poderão incluir:

- Escrita direta em uma aba mensal do Google Sheets.
- Substituição controlada de previsões por lançamentos reais.
- Controle de duplicidade entre importações.
- Memória local de regras de estabelecimento.
- Suporte a novos emissores de cartão.
- Histórico e comparação entre faturas.

Essas evoluções não devem ser antecipadas na arquitetura da V1 além da separação clara entre extração, normalização, conciliação e exportação.
