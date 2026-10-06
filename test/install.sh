#!/usr/bin/env bash
# Instala 2x num HOME falso com config pre-existente e confere: nada duplica,
# nada do usuario some. Roda no CI e local (bash test/install.sh).
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="$(mktemp -d)"
export USERPROFILE="$HOME"  # os.homedir() no Windows le USERPROFILE
mkdir -p "$HOME/.claude"
printf '# Higiene de git (todos os repos)\nja tenho, com outro nivel de titulo\n' > "$HOME/.claude/CLAUDE.md"
echo '{"model":"opus","enabledPlugins":{"caveman@caveman":false,"superpowers@claude-plugins-official":true,"code-simplifier@claude-plugins-official":true},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}]}}' > "$HOME/.claude/settings.json"

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
a.equal(s.enabledPlugins["code-simplifier@claude-plugins-official"], false, "tirado do pacote desliga em maquina ja instalada");
a.equal(s.enabledPlugins["superpowers@claude-plugins-official"], true, "fora do pacote fica como o usuario deixou");
a.ok(s.hooks.PreToolUse.some(g => g.hooks[0].command === "rtk hook claude"));
a.equal(s.hooks.PreToolUse.length, 2);
a.equal(s.hooks.PostToolUse.length, 2);
const m = new RegExp(s.env.PONYTAIL_SUBAGENT_MATCHER, "i");
a.ok(m.test("worker") && !m.test("entregador") && !m.test("explorer"), "ponytail so em quem escreve codigo");
a.equal(s.disableClaudeAiConnectors, true);
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

# --upstream: clone falso do Matt com origem local. Fork daqui vence e nao
# herda arquivo do original; skill que sai do upstream sai da instalacao;
# skill do usuario (fora do manifesto) fica.
up="$HOME/up"; git init -q "$up"; git -C "$up" config user.email t@t; git -C "$up" config user.name t
mkdir -p "$up/skills/eng/tdd" "$up/skills/eng/to-spec/agents" "$up/skills/eng/velha" "$up/skills/deprecated/morta"
for s in eng/tdd eng/to-spec eng/velha deprecated/morta; do echo x > "$up/skills/$s/SKILL.md"; done
echo x > "$up/skills/eng/to-spec/agents/openai.yaml"
git -C "$up" add -A; git -C "$up" commit -qm um
git clone -q "$up" "$HOME/clone"
mkdir -p "$HOME/.claude/skills/minha"; echo x > "$HOME/.claude/skills/minha/SKILL.md"
MATT_SKILLS_DIR="$HOME/clone" node "$repo/install.js" --global --upstream >/dev/null
s="$HOME/.claude/skills"
[ -f "$s/tdd/SKILL.md" ] && [ -f "$s/velha/SKILL.md" ] && [ ! -e "$s/morta" ]
[ ! -e "$s/to-spec/agents" ] && diff -q "$repo/skills/to-spec/SKILL.md" "$s/to-spec/SKILL.md"
git -C "$up" rm -rq skills/eng/velha; git -C "$up" commit -qm dois
MATT_SKILLS_DIR="$HOME/clone" node "$repo/install.js" --global --upstream >/dev/null
[ ! -e "$s/velha" ] && [ -f "$s/tdd/SKILL.md" ] && [ -f "$s/minha/SKILL.md" ]
echo ok
