#!/usr/bin/env bash
# "Posso encerrar a sessão?": a pergunta voltou em 14 de 99 sessões, e a
# resposta de cabeça esquecia worktree suja ou commit sem push. Só lê.
#
#   git pronta        # da raiz do repo (ou da worktree)
#
# Cada linha é OK ou PENDENTE; sai 1 se houver pendência. O que o script não
# vê (tarefa em background, handoff, docs/memoria) fica no CLAUDE.md.
set -uo pipefail
aqui=$(git rev-parse --show-toplevel) || exit 2; cd "$aqui"
pend=0
linha() { if [ "$1" = 0 ]; then echo "OK        $2"; else echo "PENDENTE  $2"; pend=1; fi; }

git fetch --quiet 2>/dev/null
b=$(git branch --show-current)
base=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true); base=${base#origin/}; base=${base:-main}

# Untracked conta: arquivo novo esquecido é o caso que mais se perde.
n=$(git status --porcelain | wc -l)
linha $([ "$n" = 0 ] && echo 0 || echo 1) "árvore: $n arquivo(s) alterado(s) ou novo(s) em $aqui"

if [ -n "$b" ] && [ "$b" != "$base" ]; then
  if git rev-parse -q --verify "@{u}" >/dev/null; then
    n=$(git rev-list --count "@{u}..HEAD")
    linha $([ "$n" = 0 ] && echo 0 || echo 1) "push: $n commit(s) de $b sem push"
  else
    n=$(git rev-list --count "origin/$base..HEAD" 2>/dev/null || echo 0)
    linha $([ "$n" = 0 ] && echo 0 || echo 1) "push: $b sem upstream, $n commit(s) à frente de $base"
  fi
  pr=$(gh pr list --head "$b" --state all --json number,state --jq '.[0] | "#\(.number) \(.state)"' 2>/dev/null)
  case "$pr" in
    *MERGED) linha 1 "PR $pr: falta git faxina --apaga na árvore principal" ;;
    *OPEN) linha 1 "PR $pr: aberto, falta merge ou decisão do usuário" ;;
    "") [ "$n" = 0 ] && linha 0 "PR: nenhum, nada a entregar" || linha 1 "PR: nenhum para $b" ;;
    *) linha 0 "PR $pr" ;;
  esac
fi

# Worktree suja de outra branch: trabalho que some se alguém faxinar.
while IFS= read -r w; do
  [ "$w" = "$aqui" ] && continue
  n=$(git -C "$w" status --porcelain 2>/dev/null | wc -l)
  [ "$n" = 0 ] || linha 1 "worktree $w: $n arquivo(s) sem commit"
done < <(git worktree list --porcelain | sed -n 's/^worktree //p')

[ $pend = 0 ] && echo "pode encerrar (falta só o que o script não vê: background, handoff, docs/memoria)"
exit $pend
