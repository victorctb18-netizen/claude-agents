## Higiene de git (todos os repos)

- **Nova sessão = nova branch** (~90% dos casos). Antes do primeiro Edit/Write
  de código: branch nova a partir de `main` atualizado (worktree se a árvore
  tem alteração não commitada de outra sessão). Reaproveite a branch atual só
  se a tarefa continua um PR ainda aberto dela (`gh pr list --head <branch>`);
  na dúvida, pergunte. Árvore principal em `main` ou suja de outra sessão: o hook barra o Edit e
  a saída é `git worktree add ../<repo>-wt/<branch> -b <branch> origin/main` pelo
  shell, **fora** da pasta do repo, editando por caminho absoluto. **Nem
  `EnterWorktree` nem `cd` para worktree dentro da pasta da sessão**
  (`.claude/worktrees/`): os dois prendem o cwd lá, o histórico da sessão muda
  de pasta e ela some da lista do VSCode. O hook barra os dois.
- **PR mergeado: apague branch local + worktree** na hora, com `git faxina`
  (lista) e `git faxina --apaga`. Squash/rebase-merge esconde branch morta de
  `git branch --merged`; o script olha o estado do PR e só mexe em branch
  mergeada, fora de `main`, da branch atual e de worktree com alteração. A
  branch remota some sozinha no merge.

## Subagentes

Tarefa de 3+ arquivos ou com partes independentes: skill `orchestrator`.

- Print, log de CI e arquivo de milhares de linhas ficam com subagente: print vai
  para o `ui-reviewer`, log para o `ci-triage`, mapa para o `explorer`. Contexto
  do root cresce a cada turno; o do subagente morre com ele.
- Bloco de edição em arquivo de milhares de linhas vai para `worker`, mesmo
  sendo 1 arquivo. Pedido ambíguo: pergunte ao usuário antes do spawn.
- Iteração visual da mesma tela vira um PR, mergeado quando o usuário aprovou.

## Entrega

Commit, push, PR e merge **só quando o usuário pedir** ("commit", "abre PR",
"mergeia"), mesmo com a implementação pronta. Escreva no
scratchpad a mensagem de commit (terminada no `Co-Authored-By`) e o corpo do
PR, e rode da raiz do repo (ou da worktree):

```bash
git entrega <commit|pr|merge> <branch> <msg> <corpo> -- <arquivo>...
git entrega merge <branch>        # PR já aberto: espera CI, mergeia, espera deploy
```

O script confere branch, `Co-Authored-By` e os `scripts/check-*.sh` do
projeto, e para em aviso. Aviso falso-positivo conhecido: `ACEITA_AVISO=1`.
`merge` espera CI e deploy (~6 min no hub), além do timeout padrão do Bash:
rode com `run_in_background` e a notificação traz as 3 linhas de resultado.

## Autonomia e "pronto"

Por conta própria, a cada passo: rodar teste, lint, `--check`, `git
diff`/`log`/`status`, corrigir falha e rodar de novo. Pedir antes: migration
nova, dependência nova, mudança de API pública, qualquer coisa que apague
dado, deploy, push.

Tarefa de código termina quando: implementado **e** teste relevante rodou
verde (ou não existe e você disse isso) **e** o passo pós-edição do projeto
foi feito (cache-bust, build, o que o CLAUDE.md mandar). Passado o primeiro
passe que "compila": inspecione o que mudou, rode, corrija, rode de novo. Se a
tarefa era "fazer funcionar", a resposta final tem a evidência (saída do
teste).
