#!/usr/bin/env bash
# Hook do explorer: avisa na 6a leitura do root sem Edit/spawn no meio; teste
# e sed -i não contam nem zeram; subagente fica calado.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-explorer-nudge.js"
sid="e$$"
r() { printf '{"session_id":"%s","tool_name":"%s","tool_input":{%s}%s}' "${3:-$sid}" "$1" "${2:-}" "${4:-}" | node "$h"; }
for i in 1 2 3 4 5; do [ -z "$(r Grep)" ]; done
r Read | grep -q explorer                                       # 6a
[ -z "$(r Edit)" ]                                              # zera
for i in 1 2 3 4 5; do [ -z "$(r Bash '"command":"cd x && rtk grep -n a b | head"')" ]; done
[ -z "$(r Bash '"command":"node --test"')" ] && [ -z "$(r Bash '"command":"sed -i s/a/b/ f"')" ]   # não contam
r Bash '"command":"git log -3"' | grep -q explorer               # 6a, atravessando o teste
[ -z "$(r Agent)" ]                                             # spawn zera
for i in 1 2 3 4 5; do [ -z "$(r Bash '"command":"git show HEAD"')" ]; done
[ -z "$(r SendMessage)" ]
for i in 1 2 3 4 5 6 7 8; do [ -z "$(r Read '' "s$$" ',"agent_id":"a1"')" ]; done   # subagente
for i in 1 2 3 4 5; do r Glob >/dev/null; done; r Glob | grep -q explorer
for i in $(seq 7 14); do [ -z "$(r Glob)" ]; done; r Glob | grep -q explorer   # 15a
rm -f "$(node -p "require('os').tmpdir()")/claude-explorer-nudge-$sid"
echo ok
