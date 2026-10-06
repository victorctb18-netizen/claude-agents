#!/usr/bin/env bash
# Hook do worker: calado em arquivo pequeno e em subagente; avisa na 8a chamada do root.
# Bash conta sed/cat (com `cd X &&` e prefixo rtk), grep não conta.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
d="$(mktemp -d)"; d="$(cygpath -m "$d" 2>/dev/null || echo "$d")"; seq 1 4000 > "$d/grande.js"; echo x > "$d/peq.js"
h() { printf '{"session_id":"t%s","tool_input":{"file_path":"%s"}%s}' "$$" "$1" "${2:-}" | node "$repo/hooks/hook-worker-nudge.js"; }
b() { printf '{"session_id":"b%s","cwd":"%s","tool_input":{"command":"%s"}}' "$$" "$d" "$1" | node "$repo/hooks/hook-worker-nudge.js"; }
[ -z "$(h "$d/peq.js")" ]
for i in 1 2 3 4 5 6 7; do [ -z "$(h "$d/grande.js")" ]; done
h "$d/grande.js" | grep -q worker
for i in 1 2 3 4 5 6 7 8; do [ -z "$(h "$d/grande.js" ',"agent_id":"a1"')" ]; done
for i in 1 2 3 4 5 6 7 8 9; do [ -z "$(b "grep -n x grande.js")" ]; done
for i in 1 2 3; do [ -z "$(b "sed -n 1,50p grande.js")" ]; done
[ -z "$(b "cd /tmp && rtk proxy cat $d/grande.js | head")" ] && [ -z "$(b "head -5 peq.js")" ]
for i in 1 2 3; do [ -z "$(b "cd $d && sed -n 9,20p grande.js")" ]; done
b "tail -3 grande.js" | grep -q worker
# Trava: com 24 leituras, PreToolUse nega Read e sed -n; Edit, subagente e liberação passam.
p() { printf '{"hook_event_name":"PreToolUse","session_id":"p%s","cwd":"%s","tool_name":"%s","tool_input":{%s}%s}' "$$" "$d" "$1" "$2" "${3:-}" | node "$repo/hooks/hook-worker-nudge.js"; }
le() { printf '{"session_id":"p%s","tool_input":{"file_path":"%s"}}' "$$" "$d/grande.js" | node "$repo/hooks/hook-worker-nudge.js" >/dev/null; }
for i in $(seq 1 23); do le; done
[ -z "$(p Read "\"file_path\":\"$d/grande.js\"")" ]
le
p Read "\"file_path\":\"$d/grande.js\"" | grep -q '"permissionDecision":"deny"'
p Bash '"command":"sed -n 1,9p grande.js"' | grep -q 'Delegue ao worker'
[ -z "$(p Bash '"command":"grep -n x grande.js"')" ] && [ -z "$(p Read "\"file_path\":\"$d/peq.js\"")" ]
[ -z "$(p Edit "\"file_path\":\"$d/grande.js\"")" ]
[ -z "$(p Read "\"file_path\":\"$d/grande.js\"" ',"agent_id":"a1"')" ]
livre="$(node -p "require('os').tmpdir().replace(/\\\\/g,'/')")/claude-nudge-livre-p$$"
touch "$livre"; [ -z "$(p Read "\"file_path\":\"$d/grande.js\"")" ]; rm -f "$livre"
echo ok
