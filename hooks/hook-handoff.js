// SessionStart(startup|clear): entrega à sessão nova o handoff que a anterior
// gravou em ~/.claude/handoffs/*.md. Antes o handoff era texto para copiar e
// colar, caro o bastante para ser adiado até o limite do contexto; como arquivo,
// custa um clique e dá para fazer cedo. Casa pela primeira linha `cwd: <pasta>`
// (sessões paralelas em pastas diferentes não se misturam) e renomeia para
// .usado.md, para uma sessão seguinte não receber o mesmo handoff de novo.
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart',
      additionalContext: '# Handoff da sessão anterior (continue daqui; confira o git status antes de agir)\n\n' + corpo } }));
    return;
  }
});
