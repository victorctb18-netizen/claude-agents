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

- **Feche o ciclo sem esperar "deu certo?"**: ação longa ou em background
  (merge, deploy, build, comando que o usuário rodou) termina com veredito de
  1 linha e a evidência (`merge ok #12 às 14:48`, `3 de 3 verdes`, a linha do
  erro). "Deu certo?" voltou em metade das sessões.
- **Comando que só o usuário roda** (admin, prod, processo de outra sessão):
  um bloco único de PowerShell (ou bash) que grava a saída em arquivo no
  scratchpad (`... *> "<scratchpad>\saida.txt"`), e você lê o arquivo. Nunca
  "cole o resultado aqui": colagem corta e mistura prompt com saída.
- **"Posso encerrar a sessão?"**: rode `git pronta` (só lê: árvore, push, PR,
  worktree suja) e acrescente o que ele não vê: tarefa em background viva,
  handoff a gravar, fato que devia ir para `docs/memoria/`.

## Escrita

Vale para todo texto gerado: resposta, comentário, teste, doc, commit, PR,
e-mail, post.

- **Sem travessão** (o traço longo, U+2014), em PT-BR ou inglês: vírgula, ponto, dois-pontos ou
  frase reescrita.
- **Acento de verdade** (`só`, `é`, `já`, `até`), nunca apóstrofo no lugar
  (`so'`, `ja'`), mesmo que o arquivo vizinho use a convenção ASCII antiga.
- **Texto em inglês na tela** (lib, pdf.js, mensagem de erro de terceiro) se
  traduz para PT-BR no mesmo PR, sem perguntar.

## Armadilhas já pagas

- **Link para o usuário** (arquivo, print): `file:///C:/...` absoluto. Worktree
  fica fora do workspace e o link relativo quebra.
- **Horário**: API e log devolvem UTC; ao usuário, sempre em Brasília (UTC-3).
- **Build sem saída não é build travado**: `| tail` segura tudo até o fim. Não
  mate `docker compose`/build no meio; matar um recreate já travou o WSL.
- **Fato do projeto** (decisão, regra de negócio, armadilha de infra ou teste)
  vira `docs/memoria/<fato>.md` no repo, com linha em `docs/memoria/INDICE.md`,
  no PR da tarefa: a memória automática do Claude fica presa a uma máquina.
  Nela, só o que é da máquina ou da pessoa.
- **PC lento ou memória cheia**: skill `raio-x-memoria` antes de chutar causa.
- **Mudança visual de tela**: skill `mockup-antes` (opções em mockup, aprovação,
  só então código). Implementar direto custou retrabalho em 8 sessões.
- **Outro PC**: o que não vem pelo git está em `docs/outro-pc.md` do
  claude-agents.

## Handoff entre sessões

Sessão longa degrada; o corte certo é **fronteira de tarefa**, não o limite do
contexto. Avise o usuário e grave o handoff quando: (a) o PR mergeou e o próximo
assunto é outro; (b) a barra de contexto passou de 50% (não comece tarefa nova)
ou 70% (feche o passo atual e faça o handoff agora); (c) a sessão já foi
retomada duas vezes. Ao passar do corte, termine o passo em andamento (teste
verde ou diff coerente) antes de escrever; handoff no meio de edição é o pior.

Handoff é arquivo, não texto para colar: `~/.claude/handoffs/<AAAAMMDD-HHMM>.md`,
primeira linha `cwd: <pasta atual da sessão>`, depois em até 8 linhas: branch e
PR, o que está pronto e provado, o que falta, decisões do usuário, arquivos-chave
e o primeiro passo. O hook de SessionStart entrega à sessão nova da mesma pasta.
Depois de gravar, mande no chat um bloco de código com o prompt pronto para
colar na sessão nova (o conteúdo do handoff + "continue daqui"): serve quando a
sessão nova abre em outra pasta, depois de 48h, ou em outra máquina.
