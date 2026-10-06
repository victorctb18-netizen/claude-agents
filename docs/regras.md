# Regras e como cada uma é garantida

Lição medida: regra em texto falha quando esquecida; checagem vale sempre.
Regra nova com alternativa mecânica vira hook/script; o resto fica em texto com
o motivo. `claude-stats` mede se pegou, `evals/` mede mudança de prompt.

| Regra (origem) | Garantida por |
|---|---|
| Nova sessão = nova branch, sem editar árvore de outra sessão (snippet) | `hooks/hook-arvore.js`: barra Edit/Write na árvore principal em `main` ou suja de outra sessão |
| PR mergeado: apague branch + worktree (snippet) | `bin/git-faxina.sh` faz certo; rodar é texto: o merge acontece fora da sessão |
| Bloco em arquivo de milhares de linhas vai ao worker (snippet) | `hooks/hook-worker-nudge.js`: avisa a cada 8 leituras/Edits do root, nega leitura a partir de 24 |
| Print vai ao ui-reviewer, log ao ci-triage (snippet) | texto: abrir o print às vezes é o pedido do usuário |
| Tarefa de 3+ arquivos: skill orchestrator (snippet) | texto: julgamento do que é parte independente |
| Pedido ambíguo: pergunte antes do spawn (snippet) | texto: ambiguidade é julgamento |
| Iteração visual da mesma tela = um PR (snippet) | texto: "mesma tela" é julgamento |
| Commit/PR/merge só quando o usuário pedir (snippet) | texto: hook não distingue pedido do usuário de iniciativa |
| Commit com branch certa, `Co-Authored-By`, `check-*.sh` (snippet) | `bin/entrega.sh` (`git entrega`) |
| `?v=` bumped antes do commit | `hooks/hook-cache-bust.js` + `check-cache-bust.sh`; CI do projeto bloqueia |
| `merge` em background (snippet) | texto: custo de tempo, não de correção |
| Pedir antes de migration, dependência, API pública, apagar dado (snippet) | texto: julgamento; `docker compose up` cai em `permissions.ask` (hooks.json) |
| Pronto = teste verde + passo pós-edição (snippet) | sintaxe: `hooks/hook-node-check.js`; o resto é texto, teste relevante é julgamento |
| Decisões do usuário sobrevivem à compactação | `hooks/hook-decisoes.js`: reinjeta do transcript após compactar |
| Spawn roda no `model` do agente | `hooks/hook-agent-model.js` preenche o que a chamada omitiu |
| Frontmatter válido, sem travessão no repo | `test/frontmatter.js` |
| reviewer, tester, ci-triage, ui-reviewer só leem (agents) | `tools:` do frontmatter sem Edit/Write; Bash ainda escreve, o resto é texto |
| explorer só grava o mapa (agents) | `tools:` limita a Write; o caminho é texto |
| ui-reviewer carrega impeccable sem a lista de skills (agents) | `skills:` do frontmatter |
| ui-reviewer reusa critique pelo fingerprint (agents) | texto: o fingerprint depende do alvo que ele escolhe |
| worker toca só os arquivos da tarefa, não commita (agents) | texto: escopo vem do prompt; `git diff` do root confere |
| worker lê só a faixa do mapa (agents) | texto: o nudge isenta subagente de propósito |
| Achado com `arquivo:linha`, relatório curto (agents) | texto: formato de resposta; `evals/` mede |
| Teste de browser por polling, não timeout fixo (tester) | texto: julgamento sobre o teste |
| Regra pegou? | `bin/claude-stats.js --salva`: compactações, spawns, causas de contexto, avisos e travas do nudge |
