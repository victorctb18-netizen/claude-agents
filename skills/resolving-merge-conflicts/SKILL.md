---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---

Fork do `mattpocock-skills`: acrescenta a triagem mecânica (passo 2) antes da leitura de intenção.

1. **Estado atual** do merge/rebase: `git status`, histórico recente, lista de arquivos em conflito.

2. **Triagem mecânica.** Conflito mecânico se resolve sem ler intenção de ninguém:
   - `?v=` de cache-bust em `<script>`/`<link>`: por linha, fica o lado que mudou; os dois mudaram, a versão maior.
   - Lista append-only (changelog `.json`, lista de migrations) com inserção dos dois lados no mesmo ponto: ficam as duas, e o arquivo continua válido (`node -e 'require("./x.json")'`).

   O driver `~/bin/merge-mecanico.js` faz exatamente isso quando o repo liga `merge=mecanico` no `.gitattributes`; conflito desse tipo que chegou até você indica repo sem a linha: resolva à mão e proponha acrescentá-la. Resolveu mecânico → `git add` e siga; sobra só conflito de verdade.

3. **Fontes primárias** de cada conflito que sobrou: por que cada lado mudou. Leia mensagens de commit, PRs, issues.

4. **Resolva cada trecho.** Preserve as duas intenções quando der. Incompatíveis: fique com a que bate com o objetivo do merge e registre a troca. Sem comportamento novo inventado. Sempre resolva; `--abort` fica de fora.

5. **Checks automáticos** do projeto: typecheck, testes, formatação, e o passo pós-edição do CLAUDE.md (bump de `?v=` do que o merge trouxe junto). Conserte o que o merge quebrou.

6. **Termine** o merge/rebase: stage, commit; em rebase, continue até o último commit.
