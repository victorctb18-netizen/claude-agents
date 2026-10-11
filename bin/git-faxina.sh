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
# So mexe em branch cujo PR esta MERGED. Nunca toca na base (main/master), na branch atual,
# nem em worktree com alteracao nao commitada.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

APAGA=0
[ "${1:-}" = "--apaga" ] && APAGA=1

git fetch --prune --quiet
atual=$(git branch --show-current)
# Base do remoto (main ou master): com "main" fixo, repo em master errava o
# rev-parse e nunca pulava a propria master.
base=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)
base=${base#origin/}; base=${base:-main}

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
  [ "$b" = "$base" ] && continue
  [ "$b" = "$atual" ] && continue

  # Dois sinais de "acabou", porque nenhum sozinho cobre tudo:
  #  - PR MERGED: pega squash/rebase-merge, que nao deixa rastro no grafo.
  #  - grafo mergeado E 0 commits a frente: pega branch antiga que virou main
  #    por merge normal e nunca teve PR (o gh devolve NENHUM nesse caso).
  estado=$(gh pr list --head "$b" --state all --json state --jq '.[0].state // "NENHUM"' 2>/dev/null || echo NENHUM)
  #    Só sem worktree: branch recém-criada pela sessão (worktree add -b ...
  #    origin/main) também tem 0 commits a frente, e apagar levava junto o
  #    trabalho que ela ainda nem tinha salvo.
  wt=${wt_branch["$b"]:-}
  if [ "$estado" != "MERGED" ]; then
    [ -z "$wt" ] || continue
    [ -n "$(git branch --merged "origin/$base" --list "$b")" ] || continue
    [ "$(git rev-list --count "origin/$base..$b")" = "0" ] || continue
  fi

  if [ -n "$wt" ] && [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "PULA  $b  -> worktree com alteracao nao commitada: $wt"
    continue
  fi

  if [ "$APAGA" = 1 ]; then
    # Falha no meio (arquivo preso no Windows) não pode sair como "APAGA".
    if [ -n "$wt" ] && ! git worktree remove --force "$wt"; then
      echo "FALHOU $b  -> worktree não removida: $wt"; continue
    fi
    git branch -D "$b" || { echo "FALHOU $b  -> branch não apagada"; continue; }
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
