#!/usr/bin/env bash
# Aviso (nao bloqueia) quando um .js/.css tocado nao teve seu ?v= bumped em
# nenhuma pagina. Nao bloqueia porque o heuristico e simples (so olha se a
# linha "arquivo?v=" mudou no diff) e falso-positivo pararia PR bom.
set -euo pipefail
cd "$(dirname "$0")/.."
# Args vao direto pro git diff: dois refs (CI), `--cached` (index) ou `HEAD`
# (arvore inteira — hook local, quando o commit vem junto com `git add`).
range=("$@")

changed=$(git diff --name-only --diff-filter=d "${range[@]}" -- 'app/js/*.js' 'app/css/*.css' || true)
[ -n "$changed" ] || { echo "Nada em app/js ou app/css mudou."; exit 0; }

html_diff=$(git diff "${range[@]}" -- '*.html')
found_any=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  name=$(basename "$f")
  if ! grep -q "${name}?v=" <<<"$html_diff"; then
    echo "::warning file=$f::$name mudou mas nenhum \`?v=\` foi bumped nas paginas que o carregam (ver CLAUDE.md: cache do nginx e' no-cache, mas aba aberta fica com o script antigo em memoria)"
    found_any=1
  fi
done <<<"$changed"

[ "$found_any" = 1 ] && echo "Aviso acima e' nao-bloqueante; confira se o arquivo e' carregado com ?v= em alguma pagina."
exit 0
