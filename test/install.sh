#!/usr/bin/env bash
# Instala 2x num HOME falso com config pre-existente e confere: nada duplica,
# nada do usuario some. Roda no CI e local (bash test/install.sh).
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="$(mktemp -d)"
export USERPROFILE="$HOME"  # os.homedir() no Windows le USERPROFILE
mkdir -p "$HOME/.claude"
printf '# Higiene de git (todos os repos)\nja tenho, com outro nivel de titulo\n' > "$HOME/.claude/CLAUDE.md"
echo '{"model":"opus","enabledPlugins":{"caveman@caveman":false,"superpowers@claude-plugins-official":true},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}]}}' > "$HOME/.claude/settings.json"

node "$repo/install.js" --global >/dev/null
cp "$HOME/.claude/settings.json" /tmp/s1.json; cp "$HOME/.claude/CLAUDE.md" /tmp/c1.md
node "$repo/install.js" --global >/dev/null

diff /tmp/s1.json "$HOME/.claude/settings.json"
diff /tmp/c1.md "$HOME/.claude/CLAUDE.md"
node -e '
const s = require(process.env.HOME + "/.claude/settings.json"), a = require("assert");
a.equal(s.model, "opus");
a.equal(s.enabledPlugins["caveman@caveman"], false, "desligado pelo usuario continua desligado");
a.equal(s.enabledPlugins["ponytail@ponytail"], true);
a.equal(s.enabledPlugins["superpowers@claude-plugins-official"], false, "tirado do pacote desliga em maquina ja instalada");
a.ok(s.hooks.PreToolUse.some(g => g.hooks[0].command === "rtk hook claude"));
a.equal(s.hooks.PreToolUse.length, 2);
a.equal(s.hooks.PostToolUse.length, 1);
'
md="$HOME/.claude/CLAUDE.md"
[ "$(grep -c '^#\+ Higiene de git' "$md")" = 1 ]
[ "$(grep -c '^## Subagentes' "$md")" = 1 ]
[ "$(grep -c '^## Autonomia' "$md")" = 1 ]
[ -f "$HOME/bin/git-faxina.sh" ] && [ -f "$HOME/.claude/.ponytail-active" ]
[ "$(git config --global alias.faxina)" = '!bash ~/bin/git-faxina.sh' ]
[ "$(git config --global merge.mecanico.driver)" = 'node ~/bin/merge-mecanico.js %O %A %B %P' ]
[ -f "$HOME/bin/merge-mecanico.js" ] && [ -f "$HOME/.claude/skills/prova-tela/cdp-lib.js" ]
CLAUDE_CONFIG_DIR="$HOME/.claude-2" node "$repo/install.js" --global >/dev/null
[ -f "$HOME/.claude-2/agents/reviewer.md" ] && [ -f "$HOME/.claude-2/settings.json" ]
echo ok
