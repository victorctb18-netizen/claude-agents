#!/usr/bin/env bash
# hook-decisoes.js: só em source compact; pega pedido real, resposta do
# AskUserQuestion e arquivo editado; descarta system-reminder.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-decisoes.js"
d="$(mktemp -d)"; t="$d/t.jsonl"
cat > "$t" <<'EOF'
{"type":"user","message":{"role":"user","content":"quero o botão azul"}}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>segredo do harness</system-reminder>"}]}}
linha quebrada {
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"q1","name":"AskUserQuestion","input":{}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"q1","content":"Cor? => verde escuro"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"e1","name":"Edit","input":{"file_path":"C:/x/app.js"}}]}}
{"type":"user","isMeta":true,"message":{"content":"meta ignorada"}}
EOF
# transcript_path chega do Claude Code como caminho nativo; no Git Bash /tmp não é.
roda() { printf '{"source":"%s","transcript_path":"%s"}' "$1" "$(cygpath -m "$2" 2>/dev/null || echo "$2")" | node "$h"; }

[ -z "$(roda startup "$t")" ]
o="$(roda compact "$t")"
grep -q 'quero o botão azul' <<<"$o"
grep -q 'verde escuro' <<<"$o"
grep -q 'C:/x/app.js' <<<"$o"
grep -q 'segredo do harness' <<<"$o" && exit 1
grep -q 'meta ignorada' <<<"$o" && exit 1
[ -z "$(roda compact "$d/nao-existe.jsonl")" ]
echo ok
