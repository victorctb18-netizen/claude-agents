#!/usr/bin/env bash
# claude-stats: conta compactação uma vez só (resumo, não o evento system),
# atribui o sed -n anterior à compactação, ignora subagents/ e --salva compara.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
d="$(mktemp -d)"; d="$(cygpath -m "$d" 2>/dev/null || echo "$d")"; trap 'rm -rf "$d"' EXIT
p="$d/projects/proj"; mkdir -p "$p/s1/subagents"
grande="$(head -c 40000 /dev/zero | tr '\0' x)"
cat > "$p/s1.jsonl" <<EOF
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"sed -n 1,900p x.js"}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"$grande"}]}}
{"type":"system","subtype":"compact_boundary"}
{"type":"user","isCompactSummary":true,"message":{"role":"user","content":"resumo"}}
EOF
cat > "$p/s2.jsonl" <<'EOF'
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"a1","name":"Agent","input":{"subagent_type":"worker","prompt":"x"}}]}}
{"type":"attachment","attachment":{"type":"hook_additional_context","content":["8 leituras/Edits do root em w.js (arquivo grande). "]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"r1","name":"Read","input":{"file_path":"w.js"}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"r1","is_error":true,"content":"24 leituras do root em w.js (arquivo grande). Delegue ao worker com a faixa"}]}}
EOF
cp "$p/s2.jsonl" "$p/s1/subagents/agent-x.jsonl"
s() { CLAUDE_CONFIG_DIR="$d" node "$repo/bin/claude-stats.js" "$@"; }
o="$(s --dias 3)"; echo "$o"
grep -q '2 sessões' <<<"$o"
grep -q 'compactações 1 em 1 sessões' <<<"$o"
grep -q 'spawns 1 (0.50/sessão): worker 1$' <<<"$o"
grep -q '1 avisos, 1 travas' <<<"$o"
grep -qE '^ +10k  Bash sed$' <<<"$o"
s --salva >/dev/null; [ "$(wc -l < "$d/claude-stats.jsonl")" = 1 ]
o="$(s --salva)"; [ "$(wc -l < "$d/claude-stats.jsonl")" = 2 ]
grep -q 'compactações/sessão 0.50 -> 0.50 (+0.00)' <<<"$o"
grep -q 'Bash sed: 10k -> 10k (+0k)' <<<"$o"
echo ok
