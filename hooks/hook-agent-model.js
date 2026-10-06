// PreToolUse(Agent): spawn sem `model` ganha o `model:` do arquivo do agente.
// Medido: spawn de agente com `model: sonnet` no frontmatter saiu Opus quando
// a chamada não passava o parâmetro. A regra "passe model explícito" vivia no
// CLAUDE.md e falhava quando esquecida; aqui vale sempre. `model` passado na
// chamada vence (worker de raciocínio denso em Opus é escolha do root).
const fs = require('fs'), path = require('path'), os = require('os');
let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const ev = JSON.parse(s), inp = ev.tool_input || {};
  const tipo = inp.subagent_type;
  // Plugin (`codex:codex-rescue`) e agente embutido não têm arquivo aqui.
  if (inp.model || !tipo || tipo.includes(':')) return;
  const dirs = [process.env.CLAUDE_PROJECT_DIR, ev.cwd].filter(Boolean).map(d => path.join(d, '.claude'));
  dirs.push(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
  const arq = dirs.map(d => path.join(d, 'agents', tipo + '.md')).find(f => fs.existsSync(f));
  if (!arq) return;
  const fm = fs.readFileSync(arq, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm && fm[1].match(/^model:\s*["']?([\w.-]+)/m);
  // O parâmetro só aceita alias; `claude-opus-5-5` no arquivo vira `opus`.
  const alias = m && ['opus', 'sonnet', 'haiku', 'fable'].find(a => m[1].includes(a));
  if (!alias) return;
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...inp, model: alias } }
  }));
});
