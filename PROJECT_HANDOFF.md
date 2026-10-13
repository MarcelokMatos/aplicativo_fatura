# Continuidade do projeto — Fatura Cartão PWA

Data da transferência: 13/10/2026  
Responsável pelo produto: Marcelo  
Destino local pretendido: `C:\Users\marcelo.matos\Documents\Projetos\nosso projeto`

## 1. Como usar este documento

Este arquivo transfere para um novo chat local o contexto relevante acumulado durante a definição do projeto. Ele não substitui a especificação nem o plano; funciona como mapa da conversa, das decisões e do ponto de continuidade.

No novo chat, o agente deve ler, nesta ordem:

1. `AGENTS.md`
2. este arquivo;
3. `docs/superpowers/specs/2026-10-12-fatura-cartao-pwa-design.md`;
4. `docs/superpowers/plans/2026-10-13-fatura-cartao-pwa-v1.md`.

Depois disso, deve resumir o entendimento em no máximo dez pontos e aguardar a autorização de Marcelo para iniciar a Task 1. Não deve reabrir decisões já aprovadas sem surgir evidência técnica nova.

## 2. Problema original

Todo mês, Marcelo:

1. baixa a fatura do cartão;
2. importa o PDF no Excel por Power Query;
3. trata os lançamentos;
4. copia o resultado;
5. acrescenta os lançamentos em uma nova aba mensal do Google Sheets.

O processo atual tem três problemas:

- depende de Excel/Power Query, indisponível em alguns computadores;
- a consulta quebra ocasionalmente quando o PDF muda;
- exige abrir e corrigir manualmente a transformação.

O objetivo é substituir esse tratamento por uma solução utilizável por Marcelo e sua esposa no Android e no computador.

## 3. Decisões tomadas na conversa

| Tema | Decisão aprovada |
|---|---|
| Forma do produto | PWA responsiva, instalável no Android e utilizável no computador |
| Entrada V1 | Upload manual da fatura em PDF |
| Processamento | Local no navegador, sem envio da fatura a servidor |
| Banco/backend | Não haverá na V1 |
| Google Sheets | Sem integração direta na V1 |
| Saída | Botão para copiar a tabela e colar manualmente |
| Conteúdo copiado | Somente valores e cabeçalho, sem fórmulas |
| Estrutura | As mesmas oito colunas do Excel atual |
| Organização mensal | O usuário cria/usa uma nova aba a cada mês |
| Previsões futuras | Fora da V1; hoje podem ser feitas por cópia e filtro das parcelas |
| Previsões existentes | Ao importar a fatura real, o usuário apaga e substitui as previsões |
| Usuários | Marcelo e sua esposa |
| Publicação | Site estático somente depois da homologação |
| Repositório | Git local primeiro; GitHub será conectado depois |

## 4. Estrutura exata de saída

A tabela deve conter, exatamente nesta ordem:

1. `Data`
2. `Histórico`
3. `Moeda de origem`
4. `US$`
5. `Cotação US$`
6. `R$`
7. `Parcela`
8. `Valor`

O botão `Copiar tabela` deve copiar cabeçalho e registros visíveis como texto separado por tabulações. A colagem no Google Sheets deve distribuir as oito colunas sem reorganização manual.

Regras principais:

- data exportada como `dd/MM/yyyy`;
- decimal com vírgula;
- valores opcionais como célula vazia;
- créditos/estornos preservam o sinal negativo;
- `Valor` usa `R$` quando preenchido e, caso contrário, `Moeda de origem`;
- `Parcela` usa `n/n` quando reconhecida e `1/1` quando não houver parcela;
- a ordem original dos lançamentos é preservada;
- compras repetidas legítimas não são removidas.

## 5. Materiais analisados na conversa anterior

### Arquivo de tratamento

Arquivo recebido: `Tratamento_Fatura_Cartao.xlsx`.

A transformação Power Query existente foi inspecionada. A lógica observada foi:

- caminho do PDF obtido por uma tabela parametrizada chamada `Tabela2`;
- leitura com `Pdf.Tables`;
- seleção e expansão das tabelas detectadas no PDF;
- expansão de seis colunas de origem;
- promoção de cabeçalhos em mais de uma etapa;
- remoção de erros;
- filtros de cabeçalhos, totais e linhas administrativas;
- filtro atualmente frágil com nome de titular codificado;
- criação de `Parcela` procurando barra no histórico;
- criação de `Valor` usando `R$` ou, na ausência, `Moeda de origem`.

Fragilidades identificadas:

- dependência do layout inferido pelo Power Query;
- filtro com conteúdo pessoal fixo;
- identificação de parcela por qualquer barra, sujeita a falso positivo;
- caminho de arquivo e etapas sensíveis a mudanças;
- pouca visibilidade quando uma linha válida é descartada.

A nova aplicação deve reproduzir a lógica útil, não copiar essas fragilidades.

### Fatura usada na análise

Arquivo recebido: `BradescoCartoes2026-10-12.135240.pdf`.

Esse arquivo não faz parte do repositório. No ambiente local, Marcelo deverá colocá-lo em uma pasta privada ignorada pelo Git, por exemplo:

```text
private/faturas/BradescoCartoes2026-10-12.135240.pdf
```

O chat local não herdará automaticamente o upload da conversa anterior. O PDF e o XLSX deverão ser novamente disponibilizados localmente caso sejam necessários para homologação.

### Google Sheets usado como referência

Planilha informada:

`https://docs.google.com/spreadsheets/d/1A7OG7Za_0_XiW7ah_ow26urmNdsleU0YjJZNl2hlWlw/edit?usp=drivesdk`

Durante a análise, a aba mensal mais recente informada/observada foi `10.10.2026`. A planilha serviu apenas para entender o formato atual. A V1 não escreverá nela diretamente.

## 6. Regra das datas

Os lançamentos do PDF normalmente têm apenas dia e mês. O ano deve ser inferido pela data de referência/vencimento da fatura:

- se o mês do lançamento for posterior ao mês da referência, usar o ano anterior;
- caso contrário, usar o mesmo ano;
- testar explicitamente fatura de janeiro com compra em dezembro;
- data inválida deve gerar diagnóstico, não correção silenciosa.

## 7. Regras de identificação e exclusão

Uma linha candidata começa com data `dd/mm` e contém histórico. A associação de valores deve usar as coordenadas horizontais extraídas pelo PDF.js, não apenas espaços no texto.

Excluir, no mínimo:

- saldo anterior;
- pagamentos da fatura;
- cabeçalhos;
- nome isolado do titular;
- número isolado do cartão;
- subtotais e linhas `Total para ...`;
- limites, mensagens, taxas informativas e textos administrativos.

Não excluir estornos ou créditos reais. Linhas parcialmente reconhecidas permanecem visíveis e marcadas como suspeitas.

## 8. Experiência esperada

Fluxo aprovado:

1. usuário abre a PWA;
2. seleciona ou arrasta um PDF;
3. o navegador extrai e interpreta localmente;
4. a tela mostra arquivo, páginas, quantidade, positivos, negativos, líquido, controle e diferença;
5. o usuário revisa a tabela de oito colunas;
6. pode editar células ou excluir linhas;
7. se conciliado, copia normalmente;
8. se não conciliado, recebe alerta e só copia após confirmar `Copiar mesmo assim`;
9. cola os valores no Google Sheets.

Inclusão manual de linha ficou fora da V1 porque mascararia falhas do parser. Linha ausente deve ser tratada como defeito a corrigir.

## 9. Arquitetura aprovada

```text
PDF local
   ↓
PDF.js: itens e coordenadas
   ↓
Agrupamento por página/linha
   ↓
Parser Bradesco determinístico
   ↓
Normalização e modelo interno
   ↓
Conciliação e diagnósticos
   ↓
Tabela editável
   ↓
Clipboard tabulado
```

Stack definida no plano:

- Node.js 22 ou superior;
- npm;
- TypeScript estrito;
- Vite;
- Vitest + jsdom;
- `pdfjs-dist`;
- `vite-plugin-pwa`;
- HTML/CSS/TypeScript sem framework de interface na V1.

## 10. Privacidade e segurança

O compromisso central do produto é que a fatura não saia do dispositivo.

- sem upload para servidor;
- sem API de IA;
- sem analytics com conteúdo da fatura;
- sem armazenamento local persistente dos lançamentos;
- service worker guarda apenas o shell estático;
- PDF, XLSX e resultados reais nunca entram no Git;
- fixtures permanentes são sintéticas ou sanitizadas;
- logs de homologação não exibem nomes, cartões ou históricos.

## 11. Homologação combinada

A V1 só poderá ser declarada estável depois de:

- reproduzir corretamente a fatura inicial;
- reconciliar com diferença máxima de R$ 0,01;
- preservar créditos, parcelas e compras repetidas;
- colar corretamente no Excel e Google Sheets;
- funcionar em pelo menos um Android e um computador;
- reabrir offline depois do primeiro carregamento;
- passar testes automatizados, typecheck e build;
- processar mais duas ou três faturas reais adicionais.

## 12. Fora do escopo da V1

- login no banco e download automático;
- escrita direta no Google Sheets;
- histórico/banco de dados;
- categorias e dashboard financeiro;
- OCR;
- LLM/IA no parser;
- aplicativo Android nativo/Play Store;
- outros bancos;
- geração automática de previsão de parcelas.

Esses itens não devem ser implementados “aproveitando a oportunidade”. Isso aumentaria o risco antes de o parser principal estar homologado.

## 13. Estado do Git na transferência

Branch: `main`.

Histórico anterior ao handoff:

```text
26bac17 docs: add implementation plan for invoice PWA
ee306b0 docs: define especificacao da v1
```

Não existe código da aplicação. O trabalho começa pela Task 1 do plano.

## 14. Pendências legítimas

Estas escolhas ainda podem ser feitas sem bloquear a Task 1:

- nome definitivo do repositório GitHub;
- conta/organização onde ficará hospedado;
- URL/base path final do GitHub Pages;
- ícone e identidade visual definitivos;
- seleção das duas ou três faturas adicionais para homologação.

Não são pendências:

- arquitetura da V1;
- oito colunas;
- processamento local;
- ausência de Google Sheets direto;
- uso de PWA;
- necessidade de conciliação e revisão manual.

## 15. Sequência para continuar localmente

1. Clonar o bundle Git fornecido para a pasta local desejada.
2. Abrir a pasta clonada no Codex Desktop/ambiente local.
3. Colocar PDF e XLSX reais somente em `private/` depois de a `.gitignore` protegê-los.
4. Iniciar um chat local usando o texto abaixo.
5. Confirmar o entendimento.
6. Executar a Task 1 do plano.
7. Conectar o repositório ao GitHub somente quando a conta e o nome forem definidos.

## 16. Mensagem pronta para o novo chat

Copiar e enviar no chat local:

```text
Este é o projeto Fatura Cartão PWA migrado de uma conversa anterior.

Antes de alterar qualquer arquivo, leia integralmente:
1. AGENTS.md
2. PROJECT_HANDOFF.md
3. docs/superpowers/specs/2026-10-12-fatura-cartao-pwa-design.md
4. docs/superpowers/plans/2026-10-13-fatura-cartao-pwa-v1.md

Depois, confira o histórico Git e me devolva:
- seu entendimento em até 10 pontos;
- qualquer conflito real entre especificação e plano;
- os comandos de verificação que pretende usar na Task 1.

Não reabra decisões aprovadas sem evidência nova. Não toque nos PDFs/XLSX reais e não conecte nem publique no GitHub ainda. Aguarde meu “pode iniciar” antes de executar a Task 1.
```

## 17. Cronologia resumida da definição

1. Marcelo apresentou o processo Excel/Power Query → Google Sheets e pediu `/think`, `/plan` e `/todo`.
2. Foi esclarecido que, depois da colagem, o único trabalho recorrente é acrescentar lançamentos.
3. Foi confirmado que cada mês usa uma nova aba.
4. Marcelo ajustou a permissão da planilha e pediu análise da aba mais recente.
5. Foi explicado que parcelas futuras podem ser previstas por cópia/filtro, mas isso é opcional.
6. Foi confirmado que previsões são apagadas e substituídas pela fatura real.
7. Marcelo aprovou retirar a integração Google da V1.
8. Foi escolhido um botão de copiar/colar.
9. Foi confirmado que apenas valores, sem fórmulas, serão copiados.
10. Foi definida a estrutura de oito colunas do Excel atual.
11. A execução foi definida como PWA local no navegador, preparada para hospedagem estática.
12. A especificação foi aprovada.
13. O plano de implementação em dez tarefas foi criado e aprovado.
14. Marcelo escolheu migrar a continuidade para um chat local no notebook.

