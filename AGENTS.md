# Instruções do projeto — Fatura Cartão PWA

## Idioma e colaboração

- Trabalhe em português do Brasil.
- Seja direto, técnico e crítico. Aponte riscos e decisões frágeis com justificativa.
- Não altere escopo ou regra de negócio sem explicar o impacto e obter aprovação de Marcelo.
- Prefira soluções simples, testáveis e fáceis de manter.

## Fonte de verdade

Leia estes arquivos antes de implementar:

1. `PROJECT_HANDOFF.md`
2. `docs/superpowers/specs/2026-10-12-fatura-cartao-pwa-design.md`
3. `docs/superpowers/plans/2026-10-13-fatura-cartao-pwa-v1.md`

A especificação define o produto. O plano define a ordem de implementação. Se houver divergência, pare e apresente o conflito.

## Forma de execução

- Execute uma tarefa do plano por vez.
- Use TDD: teste que falha, implementação mínima, teste aprovado, revisão e commit.
- Antes de declarar algo pronto, execute os testes, o typecheck e o build aplicáveis.
- Faça commits pequenos, sem misturar tarefas.
- Não publique nem conecte serviços externos sem autorização explícita.

## Restrições invioláveis da V1

- Processamento integralmente local no navegador.
- Sem backend, banco, login, OCR, LLM ou integração direta com Google Sheets.
- A saída contém exatamente oito colunas, nesta ordem:
  `Data`, `Histórico`, `Moeda de origem`, `US$`, `Cotação US$`, `R$`, `Parcela`, `Valor`.
- O botão de cópia envia apenas valores tabulados, incluindo o cabeçalho; nenhuma fórmula.
- Não deduplicar transações por data, histórico e valor.
- Não enviar, persistir ou versionar faturas e dados financeiros reais.
- O PDF real serve somente para homologação local e deve permanecer em diretório ignorado pelo Git.
- Falha de reconhecimento ou conciliação deve ser explícita; nunca exibir falso sucesso.

## Segurança de dados

- Nunca adicionar ao Git: PDF real, XLSX real, texto bruto da fatura, nome de titular, número de cartão ou histórico de compras identificável.
- Use fixtures exclusivamente sintéticas ou sanitizadas.
- Antes de cada entrega, confira o índice e o histórico do Git para evitar vazamento.
- Não imprimir dados pessoais nos logs do verificador local.

## Estado atual

- Especificação concluída e aprovada.
- Plano de implementação concluído e aprovado.
- Ainda não existe código da aplicação.
- A próxima ação é executar a Task 1 do plano.
- O repositório remoto ainda não foi definido.

