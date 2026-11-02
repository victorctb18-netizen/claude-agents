#!/usr/bin/env bash
# git impacto: acha quem cita o arquivo (src, import relativo, import Python) e
# ignora rota e .md; o hook avisa uma vez por sessão só em arquivo central.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-impacto.js"
d=$(mktemp -d); d=$(cygpath -m "$d" 2>/dev/null || echo "$d"); trap 'rm -rf "$d"' EXIT   # Git Bash: node não entende /tmp
cd "$d" && git init -q && git config core.autocrlf false && mkdir -p lib py
echo 1 > lib/util.js; echo 'def f(): pass' > py/modulo.py
printf "import x from './lib/util'\nfetch('/api/util')\n" > a.js
echo '<script src="lib/util.js?v=dev"></script>' > b.html
echo 'ver lib/util.js' > c.md
printf 'from py.modulo import f\nutil = 1\n' > d.py
git add . && git -c user.email=t@t -c user.name=t commit -qm x
out=$(node "$h" lib/util.js)
echo "$out" | grep -q '^a.js:1:' && echo "$out" | grep -q '^b.html:1:'
! echo "$out" | grep -q -e api/util -e c.md -e d.py
echo "$out" | grep -q '^2 arquivos dependem de lib/util.js'
node "$h" py/modulo.py | grep -q '^1 arquivos'
GIT_PREFIX=lib/ node "$h" util.js | grep -q '^2 arquivos'      # alias roda da raiz
node "$h" f | grep -q 'd.py:1:'                                # símbolo
r() { printf '{"session_id":"i%s","cwd":"%s","tool_input":{"file_path":"%s"}}' "$$" "$d" "$d/$1" | node "$h"; }
[ -z "$(r lib/util.js)" ]                                      # 2 < 20: calado
for i in $(seq 1 20); do echo "<script src=\"lib/util.js\"></script>" > "p$i.html"; done; git add .
[ -z "$(r lib/util.js)" ]                                      # já visto na sessão
printf '{"session_id":"j%s","tool_input":{"file_path":"%s"}}' "$$" "$d/lib/util.js" | node "$h" | grep -q 'arquivo central: 22'
[ -z "$(r nao-existe.js)" ]
rm -f "$(node -p "require('os').tmpdir()")"/claude-impacto-{i,j}$$
echo ok
