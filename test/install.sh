#!/usr/bin/env bash
# Instala 2x num HOME falso com config pre-existente e confere: nada duplica,
# nada do usuario some. Roda no CI e local (bash test/install.sh).
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="$(mktemp -d)"
export USERPROFILE="$HOME"  # os.homedir() no Windows le USERPROFILE
mkdir -p "$HOME/.claude"
# CLAUDE.md de instalação anterior aos marcadores: seções soltas (uma com
# outro nível de título) somem, a regra do usuário fica.
printf '# Minhas regras\nregra minha\n\n# Higiene de git (todos os repos)\nja tenho\n\n## Subagentes, quando e como delegar\nvelho\n' > "$HOME/.claude/CLAUDE.md"
echo '{"model":"opus","enabledPlugins":{"caveman@caveman":false,"superpowers@claude-plugins-official":true,"code-simplifier@claude-plugins-official":true},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}],"SessionStart":[{"hooks":[{"type":"command","command":"printf Subagentes: explorer (mapa) | worker"}]},{"hooks":[{"type":"command","command":"meu-hook"}]}]}}' > "$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude/agents"; echo x > "$HOME/.claude/agents/entregador.md"; echo x > "$HOME/.claude/agents/meu.md"

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
a.equal(s.hooks.PreToolUse.length, 5);
a.deepEqual(s.hooks.SessionStart.map(g => g.hooks[0].command.split("/").pop()), ["meu-hook", "hook-decisoes.js\"", "hook-arvore.js\""], "SessionStart antigo sai, o do usuario fica");
a.equal(s.hooks.PostToolUse.length, 2);
const m = new RegExp(s.env.PONYTAIL_SUBAGENT_MATCHER, "i");
a.ok(m.test("worker") && !m.test("entregador") && !m.test("explorer"), "ponytail so em quem escreve codigo");
a.equal(s.disableClaudeAiConnectors, true);
'
md="$HOME/.claude/CLAUDE.md"
[ "$(grep -c '^#\+ Higiene de git' "$md")" = 1 ]
[ "$(grep -c '^## Subagentes' "$md")" = 1 ]
[ "$(grep -c '^## Autonomia' "$md")" = 1 ]
[ "$(grep -c '^<!-- claude-agents:' "$md")" = 1 ] && grep -q 'regra minha' "$md" && ! grep -q 'ja tenho\|velho' "$md"
# Seção editada no repo chega em máquina já instalada: o bloco é trocado inteiro.
sed -i 's/^## Autonomia.*/## Autonomia antiga/' "$md"
node "$repo/install.js" --global >/dev/null
diff /tmp/c1.md "$md"
# Matcher alargado no repo chega em hook já instalado, sem duplicar o grupo.
node -e 'const f=process.argv[1],s=require(f);s.hooks.PostToolUse.find(g=>/worker-nudge/.test(g.hooks[0].command)).matcher="Read|Edit";require("fs").writeFileSync(f,JSON.stringify(s))' "$HOME/.claude/settings.json"
node "$repo/install.js" --global >/dev/null
node -e 'const g=require(process.argv[1]).hooks.PostToolUse.filter(g=>/worker-nudge/.test(g.hooks[0].command));if(g.length!==1||g[0].matcher!=="Read|Edit|Bash")process.exit(1)' "$HOME/.claude/settings.json"
[ ! -e "$HOME/.claude/agents/entregador.md" ] && [ -f "$HOME/.claude/agents/meu.md" ]
[ -f "$HOME/bin/entrega.sh" ] && [ "$(git config --global alias.entrega)" = '!bash ~/bin/entrega.sh' ]
# Agente que sai do repo sai da instalação (manifesto); o do usuário fica.
node -e 'const f=process.argv[1],m=require(f);m.agents.push("velho.md");require("fs").writeFileSync(f,JSON.stringify(m))' "$HOME/.claude/.claude-agents.json"
echo x > "$HOME/.claude/agents/velho.md"
node "$repo/install.js" --global >/dev/null
[ ! -e "$HOME/.claude/agents/velho.md" ] && [ -f "$HOME/.claude/agents/meu.md" ] && [ -f "$HOME/.claude/agents/worker.md" ]
[ -f "$HOME/bin/git-faxina.sh" ] && [ -f "$HOME/.claude/.ponytail-active" ]
[ "$(git config --global alias.faxina)" = '!bash ~/bin/git-faxina.sh' ]
[ "$(git config --global merge.mecanico.driver)" = 'node ~/bin/merge-mecanico.js %O %A %B %P' ]
[ -f "$HOME/bin/merge-mecanico.js" ] && [ -f "$HOME/bin/claude-stats.js" ] && [ -f "$HOME/.claude/skills/prova-tela/cdp-lib.js" ]
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
