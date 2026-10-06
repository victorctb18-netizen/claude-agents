#!/usr/bin/env bash
# hook-agent-model.js: spawn sem model ganha o do frontmatter (alias), model
# passado vence, agente do projeto vence o global, plugin passa direto.
set -euo pipefail
h="$(cd "$(dirname "$0")/.." && pwd)/hooks/hook-agent-model.js"
d="$(mktemp -d)"; export CLAUDE_CONFIG_DIR="$d/global"; unset CLAUDE_PROJECT_DIR
mkdir -p "$d/global/agents" "$d/proj/.claude/agents"
printf -- '---\nname: rev\nmodel: claude-opus-5-5\n---\n' > "$d/global/agents/rev.md"
printf -- '---\nname: w\nmodel: sonnet\n---\n' > "$d/global/agents/w.md"
printf -- '---\nname: w\nmodel: haiku\n---\n' > "$d/proj/.claude/agents/w.md"
# cwd chega do Claude Code como caminho nativo; no Git Bash /tmp não é.
roda() { printf '{"cwd":"%s","tool_input":%s}' "$(cygpath -m "$2" 2>/dev/null || echo "$2")" "$1" | node "$h"; }
modelo() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(s?JSON.parse(s).hookSpecificOutput.updatedInput.model:"-"))'; }

[ "$(roda '{"subagent_type":"rev","prompt":"p"}' "$d" | modelo)" = opus ]
[ "$(roda '{"subagent_type":"w","prompt":"p"}' "$d" | modelo)" = sonnet ]
[ "$(roda '{"subagent_type":"w","prompt":"p"}' "$d/proj" | modelo)" = haiku ]
[ "$(roda '{"subagent_type":"w","model":"opus"}' "$d" | modelo)" = - ]
[ "$(roda '{"subagent_type":"codex:codex-rescue"}' "$d" | modelo)" = - ]
[ "$(roda '{"subagent_type":"nao-existe"}' "$d" | modelo)" = - ]
# updatedInput substitui o input inteiro: o resto da chamada tem que ir junto.
[ "$(roda '{"subagent_type":"rev","prompt":"p","description":"x"}' "$d" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hookSpecificOutput.updatedInput.description))')" = x ]
echo ok
