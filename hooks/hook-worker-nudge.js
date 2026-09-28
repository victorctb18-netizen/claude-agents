// PostToolUse(Read|Edit): conta Read/Edit do root por arquivo grande e, a
// cada N, lembra de delegar ao worker. Regra só em texto não pegou: numa
// sessão o root fez 329 leituras e 174 Edits num arquivo de 23k linhas, 10
// compactações. Aviso, não bloqueio: retoque de 1-2 linhas continua no root.
// Dentro de subagente (agent_id no input) fica calado: o worker é quem deve ler.
const fs = require('fs'), os = require('os'), path = require('path');
const LINHAS = 3000, A_CADA = 8;
let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const e = JSON.parse(s);
  if (e.agent_id || e.agent_type) return;
  const f = (e.tool_input || {}).file_path;
  if (!f || !fs.existsSync(f)) return;
  // ponytail: conta \n do arquivo a cada chamada; cache por mtime se ficar lento
  const txt = fs.readFileSync(f, 'utf8');
  if (txt.split('\n').length < LINHAS) return;
  const est = path.join(os.tmpdir(), 'claude-worker-nudge-' + (e.session_id || 'x') + '.json');
  let c = {};
  try { c = JSON.parse(fs.readFileSync(est, 'utf8')); } catch {}
  const k = f.replace(/\\/g, '/').toLowerCase();
  c[k] = (c[k] || 0) + 1;
  fs.writeFileSync(est, JSON.stringify(c));
  if (c[k] % A_CADA) return;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
    `${c[k]} Read/Edit do root em ${path.basename(f)} (arquivo grande). Se o bloco não acabou em 1-2 linhas, ` +
    'delegue ao worker: pergunte ao usuário o que for ambíguo, passe a faixa de linhas e a frase dele, leia só o git diff. ' +
    'Retoque no mesmo bloco = SendMessage ao mesmo worker.' } }));
});
