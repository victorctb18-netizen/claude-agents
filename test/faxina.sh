#!/usr/bin/env bash
# git-faxina.sh: branch recém-criada numa worktree (0 commits, sem PR) é de
# sessão em andamento e fica; branch velha sem worktree, já em main, sai.
set -euo pipefail
f="$(cd "$(dirname "$0")/.." && pwd)/bin/git-faxina.sh"
d="$(mktemp -d)"; trap 'rm -rf "$d"' EXIT

git init -q --bare "$d/origin.git"
git clone -q "$d/origin.git" "$d/r" 2>/dev/null
cd "$d/r"
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git branch -M main && git push -q origin main 2>/dev/null
git branch velha
git worktree add -q "$d/wt" -b nova origin/main 2>/dev/null

saida=$(GH_TOKEN=x bash "$f" --apaga 2>&1 || true)
git rev-parse -q --verify refs/heads/nova >/dev/null || { echo "FALHA: apagou branch nova com worktree"; echo "$saida"; exit 1; }
[ -d "$d/wt" ] || { echo "FALHA: apagou a worktree"; exit 1; }
git rev-parse -q --verify refs/heads/velha >/dev/null && { echo "FALHA: manteve branch velha"; echo "$saida"; exit 1; }
echo "ok faxina"
