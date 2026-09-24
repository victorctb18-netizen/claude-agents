#!/usr/bin/env bash
# Prova o bin/merge-mecanico.js num repo descartavel: ?v= vizinho resolve
# sozinho, changelog .json com insercao dos dois lados vira os dois, e
# conflito de verdade continua conflito.
set -euo pipefail
driver="$(cd "$(dirname "$0")/.." && pwd)/bin/merge-mecanico.js"
cd "$(mktemp -d)"
git init -q -b main && git config user.email t@t && git config user.name t
git config merge.mecanico.driver "node '$driver' %O %A %B %P"
printf '*.html merge=mecanico\n*.json merge=mecanico\n' > .gitattributes
printf '<script src="a.js?v=20260901-1000"></script>\n<script src="b.js?v=20260901-1000"></script>\n<p>texto</p>\n' > p.html
printf '[\n  {"mudou": "base"}\n]\n' > n.json
git add -A && git commit -qm base

git checkout -qb x
sed -i 's/a.js?v=[0-9-]*/a.js?v=20260910-1200/' p.html
sed -i 's/^\[$/[\n  {"mudou": "x"},/' n.json
git commit -qam x
git checkout -q main
sed -i 's/b.js?v=[0-9-]*/b.js?v=20260911-0800/' p.html
sed -i 's/^\[$/[\n  {"mudou": "main"},/' n.json
git commit -qam main

git merge -q --no-edit x
grep -q 'a.js?v=20260910-1200' p.html
grep -q 'b.js?v=20260911-0800' p.html
node -e 'const n=require("./n.json"); require("assert").deepEqual(n.map(e=>e.mudou).sort(), ["base","main","x"])'

# Conflito de verdade: o driver devolve com marcador e o merge para.
git checkout -qb y HEAD~1
sed -i 's/texto/texto do y/' p.html && git commit -qam y
git checkout -q main
sed -i 's/texto/texto do main/' p.html && git commit -qam main2
if git merge -q --no-edit y 2>/dev/null; then echo 'devia ter conflitado'; exit 1; fi
grep -q '^<<<<<<< ' p.html
echo ok
