# Checklist de publicação beta

URL prevista: <https://marcelokmatos.github.io/aplicativo_fatura/>

Esta URL é uma **beta de homologação, ainda não homologada**. Ela existe exclusivamente para validar o navegador, a instalação e a reabertura offline em dispositivos reais. Não declarar a V1 estável antes de concluir a Task 9.

## Antes de publicar

- [ ] Confirmar que `main` contém somente mudanças revisadas.
- [ ] Executar `npm ci`, a suíte completa, typecheck e build com `VITE_BASE_PATH=/aplicativo_fatura/`.
- [ ] Confirmar que PDF, XLSX, texto bruto e resultados financeiros reais não estão no Git nem em `dist/`.
- [ ] Configurar o GitHub Pages para usar **GitHub Actions** como fonte.
- [ ] Obter autorização explícita antes do primeiro push/deploy.

## Homologação da beta

- [ ] Computador: abrir a URL, importar PDF, revisar, editar, excluir, restaurar e copiar.
- [ ] Android: repetir o fluxo e instalar pelo menu do navegador.
- [ ] Excel e Google Sheets: confirmar oito colunas e parcela mantida como texto.
- [ ] Offline: carregar uma vez, fechar, desconectar a rede e reabrir a PWA.
- [ ] Privacidade: confirmar no DevTools que PDF e transações não aparecem na rede nem em armazenamento persistente.
- [ ] Registrar somente aprovação/reprovação e métricas não identificáveis em `docs/homologacao-v1.md`.

## Limites

- Suporte restrito ao layout Bradesco com texto extraível usado no desenvolvimento.
- Sem OCR, backend, banco, login ou integração direta com Google Sheets.
- O site hospeda apenas o shell estático; a fatura é processada em memória no aparelho.
- A publicação estável depende da conclusão integral dos critérios da Task 9.
