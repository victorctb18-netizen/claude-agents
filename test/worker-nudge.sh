#!/usr/bin/env bash
# Hook do worker: calado em arquivo pequeno e em subagente; avisa na 8a chamada do root.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
d="$(mktemp -d)"; seq 1 4000 > "$d/grande.js"; echo x > "$d/peq.js"
h() { printf '{"session_id":"t%s","tool_input":{"file_path":"%s"}%s}' "$$" "$1" "${2:-}" | node "$repo/hooks/hook-worker-nudge.js"; }
[ -z "$(h "$d/peq.js")" ]
for i in 1 2 3 4 5 6 7; do [ -z "$(h "$d/grande.js")" ]; done
h "$d/grande.js" | grep -q worker
for i in 1 2 3 4 5 6 7 8; do [ -z "$(h "$d/grande.js" ',"agent_id":"a1"')" ]; done
echo ok
