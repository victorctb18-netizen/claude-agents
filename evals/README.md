# evals

Mede o efeito de mudança em agente/prompt/hook rodando tarefas fixas com
`claude -p` headless numa cópia descartável de `fixture/` (com git, e
`app/grande.js` de ~4000 linhas gerado na hora). Usa o `~/.claude` instalado:
rode `node install.js --global` antes de cada lado da comparação.

```bash
node evals/run.js --rotulo antes                 # todas as tarefas, 1x
node evals/run.js --tarefa uma-linha --rotulo x  # só uma
node evals/run.js --rotulo depois --repeticoes 3
node evals/run.js --compara antes depois         # média por tarefa, b-a
```

Tarefas e checks em `tarefas.json`. Checks: `spawn` (subagent_type esperado
ou `null`), `sem_spawn`, `perguntou`, `sem_diff`, `resposta_contem`,
`diff_toca`, `diff_nao_toca`, `diff_max_linhas` (linhas +/- somadas).

Cada execução vira uma linha em `evals/resultados.jsonl`, que não se commita
(`evals/.gitignore`). Custo real: a tarefa `uma-linha` sai por ~US$ 0,40; a
rodada completa com repetições, alguns dólares.

Resultado de 1 execução é ruído: compare com `--repeticoes 3` ou mais.
