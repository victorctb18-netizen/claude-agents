#!/usr/bin/env bash
# Commit, push, PR e merge num comando, sem subagente. Era o agente
# `entregador`: 340 de 703 spawns medidos, ~7k tokens de partida cada, para
# rodar uma cadeia de comandos que não precisa de modelo nenhum.
#
#   git entrega commit|pr|merge <branch> [<msg> <corpo> -- <arquivo>...]
#
# Instalado em ~/bin com o alias `git entrega` (roda da raiz do repo).
# Sem arquivos, pula o commit (merge de PR já aberto, push de commit feito).
# Checks do projeto são achados pela existência do script, como no hook de
# ?v=: scripts/check-cache-bust.sh antes do commit, scripts/check-novidades.sh
# antes de abrir o PR. Aviso deles para a entrega; ACEITA_AVISO=1 segue mesmo
# assim (o de ?v= tem falso-positivo em arquivo que nenhuma página carrega).
set -euo pipefail
[ $# -ge 2 ] || { sed -n 2,15p "$0"; exit 2; }
# Os checks são achados por caminho relativo: fora da raiz, sumiriam calados.
[ -z "$(git rev-parse --show-prefix)" ] || { echo "rode da raiz do repo (ou da worktree)" >&2; exit 1; }
ate=$1 branch=$2; shift 2
case $ate in commit|pr|merge) ;; *) echo "etapa inválida: $ate (commit|pr|merge)" >&2; exit 2 ;; esac
msg='' corpo='' arquivos=()
if [ $# -gt 0 ]; then
  msg=$1 corpo=${2:-}; shift 2 || shift $#
  [ "${1:-}" = -- ] && shift
  arquivos=("$@")
fi

base=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)
base=${base#origin/}; base=${base:-main}
atual=$(git branch --show-current)
[ "$atual" = "$branch" ] || { echo "branch atual é $atual, pedido diz $branch" >&2; exit 1; }
[ "$branch" != "$base" ] || { echo "entrega sai de branch de trabalho, nunca de $base" >&2; exit 1; }

# Subject com maiúscula e texto sem travessão: regras do usuário que o modelo
# esquece em sessão longa. Conventional commit (`fix(x): ...`, de outros repos) passa.
if [ -n "$msg" ]; then
  s=$(head -1 "$msg") cc='^[a-z-]+(\([^)]*\))?!?: '
  if [[ $s =~ ^[a-z] && ! $s =~ $cc ]]; then echo "subject começa com minúscula: $s" >&2; exit 1; fi
  for f in "$msg" ${corpo:+"$corpo"}; do
    if grep -n "$(printf '\342\200\224')" "$f" >&2; then echo "travessão em $f: troque por vírgula, dois-pontos ou ponto" >&2; exit 1; fi
  done
fi

# Roda um check do projeto; linha ::warning na saída barra a entrega.
check() {
  local out
  out=$("$@" 2>&1) || { echo "$out" >&2; return 1; }
  grep -q '::warning' <<<"$out" || return 0
  grep '::warning' <<<"$out" >&2
  [ "${ACEITA_AVISO:-}" = 1 ] || { echo "aviso de $2: corrija, ou ACEITA_AVISO=1 se for falso-positivo" >&2; return 1; }
}

if [ ${#arquivos[@]} -gt 0 ]; then
  grep -q '^Co-Authored-By:' "$msg" || { echo "mensagem sem Co-Authored-By: $msg" >&2; exit 1; }
  # -f: projeto versiona arquivo dentro de pasta ignorada (.claude/agents).
  git add -f -- "${arquivos[@]}"
  # BUMP_V=1: o check do projeto que conhece a variável faz o bump do ?v= em
  # vez de barrar; o que não conhece ignora.
  if [ -f scripts/check-cache-bust.sh ]; then BUMP_V=1 check bash scripts/check-cache-bust.sh --cached; fi
  git commit -q -F "$msg"
  echo "commit $(git rev-parse --short HEAD)"
fi
[ "$ate" = commit ] && exit 0

git push -q -u origin "$branch"
url=$(gh pr view "$branch" --json url,state -q 'select(.state == "OPEN") | .url' 2>/dev/null || true)
if [ -z "$url" ]; then
  [ -n "$corpo" ] || { echo "PR novo precisa do arquivo de corpo" >&2; exit 1; }
  if [ -f scripts/check-novidades.sh ]; then
    git fetch -q origin "$base"
    PR_BODY=$(cat "$corpo"); export PR_BODY
    check bash scripts/check-novidades.sh "origin/$base" HEAD
  fi
  titulo=$( [ -n "$msg" ] && head -1 "$msg" || git log -1 --format=%s )
  url=$(gh pr create --base "$base" --title "$titulo" --body-file "$corpo")
fi
echo "pr $url"
[ "$ate" = pr ] && exit 0

# Logo depois do push o PR ainda não tem check registrado e o gh responde
# "no checks reported": sem esperar, mergearia sem CI. Repo sem workflow
# nenhum nunca vai ter check; ali segue direto.
for tentativa in $(seq 12); do
  out=$(gh pr checks "$branch" --watch --fail-fast --interval 15 2>&1) && break
  if ! grep -q 'no checks reported' <<<"$out"; then
    echo "$out" | tail -5 >&2
    echo "CI vermelho; run: $(gh run list --branch "$branch" --limit 1 --json databaseId -q '.[0].databaseId')" >&2
    exit 1
  fi
  ls .github/workflows/*.y*ml >/dev/null 2>&1 || break
  [ "$tentativa" = 12 ] && { echo "nenhum check apareceu em 2 min" >&2; exit 1; }
  sleep 10
done
deploy=.github/workflows/deploy.yml
antes=$( [ -f $deploy ] && gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId' || true )
gh pr merge "$branch" --squash
echo "merge ok"
if [ -f $deploy ]; then
  # O run do deploy aparece alguns segundos depois do merge; sem esperar o id
  # novo, o watch pegaria o deploy anterior, já verde.
  id=$antes
  for _ in $(seq 30); do
    id=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
    [ "$id" != "$antes" ] && break
    sleep 2
  done
  if [ "$id" = "$antes" ]; then echo "deploy: run novo não apareceu em 60s" >&2; exit 1; fi
  gh run watch "$id" --exit-status >/dev/null && echo "deploy ok (run $id)" || { echo "deploy falhou: run $id" >&2; exit 1; }
fi
echo "falta: git faxina --apaga, na árvore principal (branch e worktree desta entrega)"
