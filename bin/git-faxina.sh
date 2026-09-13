#!/usr/bin/env bash
# Faxina de branches/worktrees ja mergeadas.
#
# Por que existe: o fluxo aqui e squash/rebase-merge. Depois do merge do PR o
# git local nao sabe que a branch "acabou" (o grafo nao tem o commit), entao
# `git branch --merged` nao pega. O sinal confiavel e o estado do PR no GitHub.
#
# Uso:
#   bash scripts/git-faxina.sh          # mostra o que faria (dry-run)
#   bash scripts/git-faxina.sh --apaga  # apaga de verdade
#
# So mexe em branch cujo PR esta MERGED. Nunca toca em main, na branch atual,
# nem em worktree com alteracao nao commitada.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

APAGA=0
[ "${1:-}" = "--apaga" ] && APAGA=1

git fetch --prune --quiet
atual=$(git branch --show-current)

# worktree sujo? path -> "sujo" | "limpo"
declare -A wt_estado wt_branch
while IFS= read -r linha; do
  case "$linha" in
    worktree\ *) p=${linha#worktree } ;;
    branch\ *)   b=${linha#branch refs/heads/}; wt_branch["$b"]=$p ;;
    "")          : ;;
  esac
done < <(git worktree list --porcelain)

removidas=0
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  [ "$b" = "main" ] && continue
  [ "$b" = "$atual" ] && continue

  # Dois sinais de "acabou", porque nenhum sozinho cobre tudo:
  #  - PR MERGED: pega squash/rebase-merge, que nao deixa rastro no grafo.
  #  - grafo mergeado E 0 commits a frente: pega branch antiga que virou main
  #    por merge normal e nunca teve PR (o gh devolve NENHUM nesse caso).
  estado=$(gh pr list --head "$b" --state all --json state --jq '.[0].state // "NENHUM"' 2>/dev/null || echo NENHUM)
  if [ "$estado" != "MERGED" ]; then
    [ -n "$(git branch --merged origin/main --list "$b")" ] || continue
    [ "$(git rev-list --count "origin/main..$b")" = "0" ] || continue
  fi

  wt=${wt_branch["$b"]:-}
  if [ -n "$wt" ] && [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "PULA  $b  -> worktree com alteracao nao commitada: $wt"
    continue
  fi

  if [ "$APAGA" = 1 ]; then
    [ -n "$wt" ] && git worktree remove --force "$wt"
    git branch -D "$b"
    git push origin --delete "$b" 2>/dev/null || true
    echo "APAGA $b${wt:+  (+ worktree $wt)}"
  else
    echo "APAGARIA $b${wt:+  (+ worktree $wt)}  [PR merged]"
  fi
  removidas=$((removidas+1))
done

git worktree prune
[ "$removidas" = 0 ] && echo "Nada a fazer."
[ "$APAGA" = 0 ] && [ "$removidas" -gt 0 ] && echo "-- rode com --apaga para efetivar"
