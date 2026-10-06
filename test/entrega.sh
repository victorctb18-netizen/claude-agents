#!/usr/bin/env bash
# Etapa commit do entrega.sh num repo descartável: as travas barram, o aviso
# de check para, ACEITA_AVISO libera. pr/merge dependem do GitHub e ficam de fora.
set -euo pipefail
e="$(cd "$(dirname "$0")/.." && pwd)/bin/entrega.sh"
r="$(mktemp -d)"; cd "$r"
git init -q -b main; git config user.email t@t; git config user.name t
git commit -q --allow-empty -m base; git switch -q -c feat
echo um > a.txt
printf 'Sem trailer\n' > sem.msg
printf 'Com trailer\n\nCo-Authored-By: X <x@x>\n' > com.msg
falha() { if "$@" >/dev/null 2>&1; then echo "devia falhar: $*"; exit 1; fi; }

falha bash "$e" commit outra com.msg '' -- a.txt          # branch errada
falha bash "$e" commit feat sem.msg '' -- a.txt           # sem Co-Authored-By
git switch -q main; falha bash "$e" commit main com.msg '' -- a.txt; git switch -q feat
mkdir sub; (cd sub && falha bash "$e" commit feat ../com.msg '' -- ../a.txt)   # fora da raiz
printf 'minúscula\n\nCo-Authored-By: X <x@x>\n' > min.msg
falha bash "$e" commit feat min.msg '' -- a.txt           # subject minúsculo
printf 'Com \342\200\224 no meio\n\nCo-Authored-By: X <x@x>\n' > trav.msg
printf 'corpo \342\200\224\n' > trav.md
falha bash "$e" commit feat trav.msg '' -- a.txt          # travessão na mensagem
falha bash "$e" commit feat com.msg trav.md -- a.txt      # travessão no corpo

mkdir scripts; printf 'echo "::warning file=a.txt::sem bump"\n' > scripts/check-cache-bust.sh
falha bash "$e" commit feat com.msg '' -- a.txt
[ -z "$(git log --oneline main..feat)" ]
ACEITA_AVISO=1 bash "$e" commit feat com.msg '' -- a.txt >/dev/null
[ "$(git log -1 --format=%s)" = 'Com trailer' ] && [ -z "$(git status --short a.txt)" ]
printf 'fix(x): conventional\n\nCo-Authored-By: X <x@x>\n' > cc.msg; echo dois > a.txt
ACEITA_AVISO=1 bash "$e" commit feat cc.msg '' -- a.txt >/dev/null   # conventional minúsculo passa
echo ok
