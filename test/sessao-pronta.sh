#!/usr/bin/env bash
# sessao-pronta.sh: árvore limpa e sem commit à frente passa; arquivo novo
# sem commit e worktree suja de outra branch aparecem como PENDENTE.
set -euo pipefail
f="$(cd "$(dirname "$0")/.." && pwd)/bin/sessao-pronta.sh"
d="$(mktemp -d)"; trap 'rm -rf "$d"' EXIT
git init -q --bare "$d/origin.git"
git clone -q "$d/origin.git" "$d/r" 2>/dev/null
cd "$d/r"
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git branch -M main && git push -q origin main 2>/dev/null && git remote set-head origin main
GH_TOKEN=x bash "$f" >/dev/null || { echo "FALHA: árvore limpa deu pendência"; bash "$f"; exit 1; }
echo x > novo.txt
saida=$(GH_TOKEN=x bash "$f" || true)
grep -q 'PENDENTE  árvore: 1' <<<"$saida" || { echo "FALHA: não viu arquivo novo"; echo "$saida"; exit 1; }
rm novo.txt
git worktree add -q "$d/wt" -b outra origin/main 2>/dev/null; echo y > "$d/wt/y.txt"
saida=$(GH_TOKEN=x bash "$f" || true)
grep -q "PENDENTE  worktree .*wt: 1" <<<"$saida" || { echo "FALHA: não viu worktree suja"; echo "$saida"; exit 1; }
echo "ok sessao-pronta"
