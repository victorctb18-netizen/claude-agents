// SessionStart(startup|clear): entrega à sessão nova o handoff que a anterior
// gravou em ~/.claude/handoffs/*.md. Antes o handoff era texto para copiar e
// colar, caro o bastante para ser adiado até o limite do contexto; como arquivo,
// custa um clique e dá para fazer cedo. Casa pela primeira linha `cwd: <pasta>`
// (sessões paralelas em pastas diferentes não se misturam) e renomeia para
// .usado.md, para uma sessão seguinte não receber o mesmo handoff de novo.
// Com `sessao_anterior: <id>` no cabeçalho (o botão da contexto-bar grava),
// junta o livro de decisões do transcript anterior, que o resumo de 8 linhas
// perde, e anota a troca em cadeia.jsonl: dá para seguir de sessão em sessão.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { livro } = require('./hook-decisoes.js');
const DIR = process.env.HANDOFF_DIR || path.join(os.homedir(), '.claude', 'handoffs');
const IDADE_MAX = 48 * 3600e3;
const norm = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  let ev;
  try { ev = JSON.parse(s); } catch { return; }
  if (!/^(startup|clear)$/.test(ev.source) || !ev.cwd) return;
  let achados;
  try {
    achados = fs.readdirSync(DIR).filter(f => /\.md$/.test(f) && !/\.usado\.md$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
      .filter(x => Date.now() - x.t < IDADE_MAX)
      .sort((a, b) => b.t - a.t);
  } catch { return; }
  for (const { f } of achados) {
    const arq = path.join(DIR, f);
    let txt;
    try { txt = fs.readFileSync(arq, 'utf8'); } catch { continue; }
    const m = /^cwd:\s*(.+)$/m.exec(txt.split('\n')[0] || '');
    if (!m || norm(m[1]) !== norm(ev.cwd)) continue;
    try { fs.renameSync(arq, arq.replace(/\.md$/, '.usado.md')); } catch {}
    const corpo = txt.split('\n').slice(1).join('\n').trim().slice(0, 6000);
    const de = (/^sessao_anterior:\s*(\S+)/m.exec(txt) || [])[1];
    // O transcript anterior mora na mesma pasta de projeto que o desta sessão.
    const trans = de && ev.transcript_path ? path.join(path.dirname(ev.transcript_path), de + '.jsonl') : '';
    const decisoes = trans ? livro(trans, '# Livro de decisões da sessão anterior (extraído do transcript dela)') : '';
    if (de) try {
      fs.appendFileSync(path.join(DIR, 'cadeia.jsonl'), JSON.stringify({ ts: new Date().toISOString(),
        de, para: ev.session_id, cwd: ev.cwd, handoff: arq.replace(/\.md$/, '.usado.md'), transcript_de: trans }) + '\n');
    } catch {}
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart',
      additionalContext: '# Handoff da sessão anterior (continue daqui; confira o git status antes de agir)\n\n' + corpo +
        (decisoes ? '\n\n' + decisoes : '') } }));
    return;
  }
});
