## Higiene de git (todos os repos)

- **PR mergeado → apagar branch local + worktree** na hora.
- Fluxo é squash/rebase-merge: `git branch --merged` não detecta branch morta.
  Sinal confiável = estado do PR (`gh pr list --head <b>`).
- Ao notar acúmulo de branches/worktrees: rodar `git faxina` (dry-run) e depois
  `git faxina --apaga`. Script em `~/bin/git-faxina.sh`. Só mexe em branch
  mergeada (PR MERGED ou grafo mergeado + 0 à frente); nunca `main`, branch
  atual, ou worktree com alteração não commitada.

## Subagentes — quando e como delegar

Tarefa grande (3+ arquivos, partes independentes): skill `orchestrator`
(`$orchestrator`). Papéis fixos: `explorer` (mapa, só leitura), `worker`
(implementa dentro de lista fechada de arquivos), `tester` (roda e cola
evidência), `reviewer` (opus, lê só o diff, sem contexto do plano),
`ui-reviewer` (opus, só leitura; tela real + regras de UI do CLAUDE.md),
`researcher` (fato externo — API, versão, layout de arquivo; olha `docs/` e
memória antes de ir pra web), `entregador` (sonnet low: commit/push/PR/merge),
`ci-triage` (sonnet low: lê log de CI vermelho, devolve job+linha+causa).

- O root é dono de arquitetura, decomposição e integração. Commit, push, PR e
  merge são do `entregador` — e **só quando o usuário pedir explicitamente**
  ("commit", "abre PR", "mergeia"). Nunca por conta própria depois de
  implementar. Worker/tester/explorer nunca commitam.
- Economia de contexto: root não lê `.png`, log de CI nem arquivo com milhares
  de linhas — `ui-reviewer` olha print, `ci-triage` lê log, `explorer` mapeia.
  Cold start de subagente (~15k, cacheado) é barato; contexto do root cresce
  a cada turno e não é reaproveitado.
- Iteração visual da mesma tela vira um PR, mergeado quando o usuário aprovou —
  não um PR por rodada.
- Não delegue trivial só para paralelizar — spawn custa mais que 1-2 arquivos.
- Dois workers nunca tocam o mesmo arquivo. Sem dono claro, não divide.
- Máximo 4 concorrentes. Precisou de mais, a decomposição está errada.
- Passe `model` explícito na chamada do `Agent` em vez de confiar no
  `model:` do arquivo do agente. Um spawn de `entregador` (arquivo diz
  `sonnet`) saiu Opus, e o transcript não registra o modelo do subagente —
  não dá para auditar depois, só o card da UI mostra. O parâmetro explícito
  tem precedência sobre o frontmatter e torna a causa irrelevante.
- Instrução do usuário vence esta política.

## Autonomia e "pronto"

Sem pedir aprovação a cada passo: rodar teste, lint, `--check`, `git
diff`/`log`/`status`, corrigir falha e rodar de novo. Pedir antes: migration
nova, dependência nova, mudança de API pública, qualquer coisa que apague
dado, deploy, push.

Tarefa de código termina quando: implementado **e** teste relevante rodou
verde (ou não existe e você disse isso) **e** o passo pós-edição do projeto
foi feito (cache-bust, build, o que o CLAUDE.md mandar). Não pare no primeiro
passe que "compila": inspecione o que mudou, rode, corrija, rode de novo. Se a
tarefa era "fazer funcionar", a resposta final tem a evidência (saída do
teste), não "deve funcionar".
