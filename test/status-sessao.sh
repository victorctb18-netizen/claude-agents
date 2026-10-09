#!/usr/bin/env bash
# hook-status-sessao.js: palavra de estado + PR no nome da sessão, "#N título" em
# sessão de issue, "OK -" intocado e nada gravado quando o nome não muda.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-status-sessao.js"
d="$(mktemp -d)"
m() { cygpath -m "$1" 2>/dev/null || echo "$1"; }
trap 'rm -rf "$d"' EXIT

git init -q "$d/r"
git -C "$d/r" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$d/r" branch -M main
git -C "$d/r" worktree add -q "$d/wt" -b feat 2>/dev/null
git -C "$d/r" worktree add -q "$d/wt-issue" -b issue-507 2>/dev/null

# gh falso: responde com o PR de $FAKE_PR (JSON ou vazio) e o título de issue fixo.
cat > "$d/gh.js" <<'EOF'
const a = process.argv.slice(2), pr = process.env.FAKE_PR ? JSON.parse(process.env.FAKE_PR) : null;
if (a[0] === 'issue') console.log(JSON.stringify({ title: 'Conta 1000 duplicatas a receber negativa' }));
else if (a[1] === 'list') console.log(JSON.stringify(pr ? [pr] : []));
else if (pr) console.log(JSON.stringify(pr)); else process.exit(1);
EOF
export STATUS_SESSAO_SYNC=1 STATUS_SESSAO_GH="$(m "$d/gh.js")"

# transcript <titulo-ai> <cwd> [custom] [primeira msg] [saída de ferramenta]
transcript() {
  t="$d/s.jsonl"
  node -e '
    const [ai, cwd, custom, msg, saida] = process.argv.slice(1), L = [];
    L.push({ type: "ai-title", aiTitle: ai });
    L.push({ type: "user", cwd, message: { content: msg || "oi" } });
    if (custom) L.push({ type: "custom-title", customTitle: custom });
    if (saida) L.push({ type: "user", cwd, message: { content: [{ type: "tool_result", content: saida }] } });
    require("fs").writeFileSync(process.argv[6], L.map(JSON.stringify).join("\n") + "\n");
  ' "$1" "$(m "$2")" "${3:-}" "${4:-}" "${5:-}" "$(m "$t")"
}
para() { printf '{"hook_event_name":"%s","session_id":"s","cwd":"%s","transcript_path":"%s"}' "${EV:-Stop}" "$(m "$d/r")" "$(m "$d/s.jsonl")" | node "$h"; }
nome() { node -e 'let n=null;for(const l of require("fs").readFileSync(process.argv[1],"utf8").split("\n")){try{const o=JSON.parse(l);if(o.type==="custom-title")n=o.customTitle}catch{}}console.log(n)' "$(m "$d/s.jsonl")"; }
linhas() { wc -l < "$d/s.jsonl" | tr -d ' '; }
igual() { [ "$(nome)" = "$1" ] || { echo "FALHOU: esperado '$1', veio '$(nome)'"; exit 1; }; }

unset FAKE_PR
transcript "Pergunta solta" "$d/r"; para; igual null                     # sem branch de trabalho: não toca
transcript "Tela nova" "$d/wt"; para; igual "SUA VEZ · Tela nova"                 # worktree sem PR
n=$(linhas); para; [ "$(linhas)" = "$n" ]                                  # nome igual: não grava de novo
EV=UserPromptSubmit para; igual "FAZENDO · Tela nova"                        # você respondeu: vez da sessão
n=$(linhas); EV=UserPromptSubmit para; [ "$(linhas)" = "$n" ]               # já FAZENDO: não grava
para; igual "SUA VEZ · Tela nova"                                            # parou de novo
export FAKE_PR='{"number":12,"state":"OPEN","statusCheckRollup":[{"conclusion":"SUCCESS"}]}'
para; igual "MERGE PR#12 · Tela nova"                                                 # troca o prefixo, não acumula
export FAKE_PR='{"number":12,"state":"OPEN","statusCheckRollup":[{"conclusion":"FAILURE"}]}'
para; igual "CI✗ PR#12 · Tela nova"
export FAKE_PR='{"number":12,"state":"MERGED","statusCheckRollup":[]}'
para; igual "FEITO PR#12 · Tela nova"
# PR achado pela saída de ferramenta, mesmo com o cwd fora da worktree.
transcript "Fix" "$d/r" "" "" "pr https://github.com/o/r/pull/14"; para; igual "FEITO PR#12 · Fix"
unset FAKE_PR
transcript "Outra" "$d/wt" "" "" "pr https://github.com/o/r/pull/14"; para; igual "SUA VEZ · Outra"   # branch viva sem PR vence PR antigo
export FAKE_PR='{"number":12,"state":"MERGED","statusCheckRollup":[]}'
transcript "Tela nova" "$d/wt" "OK - Tela nova"; para; igual "OK - Tela nova"   # marcado à mão
unset FAKE_PR
transcript "Issue #507" "$d/r" "" "implementa a #507 (leia o corpo)"; para
igual "#507 · Conta 1000 duplicatas a receber negativa"                      # issue pela mensagem, sem branch
transcript "Algo" "$d/wt-issue"; para
igual "SUA VEZ #507 · Conta 1000 duplicatas a receber negativa"                   # issue pela branch
export FAKE_PR='{"number":12,"state":"OPEN","statusCheckRollup":[]}'
transcript "Algo" "$d/wt-issue"; para
igual "MERGE PR#12 #507 · Conta 1000 duplicatas a receber negativa"         # issue com PR
transcript "x" "$d/wt" "🟡 Velho"; para; igual "MERGE PR#12 · Velho"          # migra o emoji antigo
unset FAKE_PR
transcript "Cor" "$d/r" "" "troca o PR #12 de cor"; para; igual null       # "PR #12" não é issue
echo ok
