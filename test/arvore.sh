#!/usr/bin/env bash
# hook-arvore.js: árvore principal em main ou suja de outra sessão barra o
# Edit; branch limpa, worktree linkada, fora de repo, subagente e arquivo de
# liberação passam.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-arvore.js"
d="$(mktemp -d)"; sid="teste-arvore-$$"
m() { cygpath -m "$1" 2>/dev/null || echo "$1"; }
tmp="$(node -p 'require("os").tmpdir()')"
trap 'rm -rf "$d" "$tmp/claude-arvore-$sid.json" "$tmp/claude-arvore-livre-$sid"' EXIT

git init -q --bare "$d/origin.git"
git clone -q "$d/origin.git" "$d/r" 2>/dev/null
cd "$d/r"
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git branch -M main && git push -q origin main 2>/dev/null
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
echo a > a.txt && git add a.txt && git -c user.name=t -c user.email=t@t commit -q -m a

inicio() { rm -f "$tmp/claude-arvore-$sid.json"; printf '{"hook_event_name":"SessionStart","source":"startup","session_id":"%s","cwd":"%s"}' "$sid" "$(m "$1")" | node "$h"; }
edita() { printf '{"hook_event_name":"PreToolUse","session_id":"%s","cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s"}%s}' "$sid" "$(m "$d/r")" "$(m "$1")" "${2:-}" | node "$h"; }
nega() { [ "$(edita "$@" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(s?JSON.parse(s).hookSpecificOutput.permissionDecision:"-"))')" = deny ]; }
passa() { [ -z "$(edita "$@")" ]; }

inicio "$d/r"
nega "$d/r/a.txt"                                   # árvore principal em main
nega "$d/r/sub/novo/x.txt"                          # pasta ainda não existe
passa "$d/r/a.txt" ',"agent_id":"x"'                # subagente
passa "$(m "$tmp")/fora-de-repo.txt"                # fora de repo
git checkout -q -b feat
inicio "$d/r"; passa "$d/r/a.txt"                   # branch feat limpa
echo b >> a.txt; inicio "$d/r"
passa "$d/r/a.txt"                                  # o único sujo é o próprio arquivo
nega "$d/r/outro.txt"                               # sujo de outra sessão
touch "$tmp/claude-arvore-livre-$sid"; passa "$d/r/outro.txt"; rm "$tmp/claude-arvore-livre-$sid"
rm "$tmp/claude-arvore-$sid.json"; passa "$d/r/outro.txt"   # sem foto: só a regra da base
# resume não regrava a foto: sujo deixado pela própria sessão não vira "de outra".
git checkout -q a.txt; inicio "$d/r"; echo z > outro.txt
printf '{"hook_event_name":"SessionStart","source":"resume","session_id":"%s","cwd":"%s"}' "$sid" "$(m "$d/r")" | node "$h"
passa "$d/r/a.txt"
git worktree add -q "$d/wt" main 2>/dev/null
echo c > "$d/wt/a.txt"
passa "$d/wt/a.txt"                                 # worktree linkada, em main e suja
printf 'nao json' | node "$h"                       # erro interno: permite, exit 0
echo ok
