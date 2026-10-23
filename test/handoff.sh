#!/usr/bin/env bash
# hook-handoff.js: injeta só o handoff da mesma pasta, uma vez, e ignora velho.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-handoff.js"
d="$(mktemp -d)"; export HANDOFF_DIR="$(cygpath -m "$d" 2>/dev/null || echo "$d")"
printf 'cwd: C:/proj/a\nbranch x, falta teste\n' > "$d/1.md"
printf 'cwd: C:/proj/b\nOUTRA pasta\n' > "$d/2.md"
roda() { printf '{"source":"%s","cwd":"%s"}' "$1" "$2" | node "$h"; }

[ -z "$(roda resume 'C:/proj/a')" ]
o="$(roda startup 'C:/Proj/a/')"
grep -q 'falta teste' <<<"$o"
grep -q 'OUTRA pasta' <<<"$o" && exit 1
[ -z "$(roda startup 'C:/proj/a')" ]   # já consumido
[ -f "$d/1.usado.md" ]
touch -d '3 days ago' "$d/2.md"
[ -z "$(roda clear 'C:/proj/b')" ]     # velho demais
echo ok
