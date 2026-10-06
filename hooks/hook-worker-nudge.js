// PostToolUse(Read|Edit|Bash): conta leitura/Edit do root por arquivo grande
// e, a cada N, lembra de delegar ao worker. Regra só em texto não pegou: numa
// sessão o root fez 329 leituras e 174 Edits num arquivo de 23k linhas, 10
// compactações. Aviso, não bloqueio: retoque de 1-2 linhas continua no root.
// Bash entra porque o root fura a contagem lendo com `sed -n`/`cat`: medido em
// 199 compactações, `sed -n` somou 1,25M tokens, mais que o Read. grep fica de
// fora: localizar a região com `grep -n` é trabalho do root.
// Dentro de subagente (agent_id no input) fica calado: o worker é quem deve ler.
const fs = require('fs'), os = require('os'), path = require('path');
const LINHAS = 3000, A_CADA = 8, LER = /^(sed|cat|head|tail|awk|read)$/;

// Caminhos que um comando de leitura recebe, seguindo `cd X &&` e o prefixo do rtk.
function lidosNoBash(cmd, base) {
  const out = [];
  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    const t = seg.trim().split(/\s+/).map(x => x.replace(/^["']|["']$/g, '').replace(/^\/([a-z])\//i, '$1:/'));
    while (t[0] === 'rtk' || t[0] === 'proxy') t.shift();
    if (t[0] === 'cd' && t[1]) base = path.resolve(base, t[1]);
    else if (LER.test(t[0] || '')) out.push(...t.slice(1).filter(x => !x.startsWith('-')).map(x => path.resolve(base, x)));
  }
  return out;
}

let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const e = JSON.parse(s);
  if (e.agent_id || e.agent_type) return;
  const i = e.tool_input || {};
  const alvos = i.file_path ? [i.file_path] : i.command ? lidosNoBash(i.command, e.cwd || process.cwd()) : [];
  const est = path.join(os.tmpdir(), 'claude-worker-nudge-' + (e.session_id || 'x') + '.json');
  let c = null, aviso = '';
  for (const f of alvos) {
    try { if (!fs.statSync(f).isFile()) continue; } catch { continue; }
    // ponytail: conta \n do arquivo a cada chamada; cache por mtime se ficar lento
    if (fs.readFileSync(f, 'utf8').split('\n').length < LINHAS) continue;
    if (!c) { try { c = JSON.parse(fs.readFileSync(est, 'utf8')); } catch { c = {}; } }
    const k = f.replace(/\\/g, '/').toLowerCase();
    c[k] = (c[k] || 0) + 1;
    if (!(c[k] % A_CADA)) aviso = `${c[k]} leituras/Edits do root em ${path.basename(f)} (arquivo grande). `;
  }
  if (c) fs.writeFileSync(est, JSON.stringify(c));
  if (!aviso) return;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: aviso +
    'Se o bloco não acabou em 1-2 linhas, delegue ao worker: pergunte ao usuário o que for ambíguo, passe a faixa de linhas ' +
    'e a frase dele, leia só o git diff. Retoque no mesmo bloco = SendMessage ao mesmo worker.' } }));
});
