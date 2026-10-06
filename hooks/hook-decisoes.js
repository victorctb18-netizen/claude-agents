// SessionStart(compact): reinjeta o que o usuário pediu e respondeu na sessão.
// Medido: 84 de 242 sessões compactaram, e o resumo da compactação perde o que
// foi combinado com o usuário. O transcript JSONL continua inteiro no disco,
// então o livro de decisões sai dele, não do resumo.
const fs = require('fs');
const MAX = 8000;
// Texto injetado pelo harness chega como mensagem 'user'; não é pedido real.
const SISTEMA = /^(<(system-reminder|task-notification|command-|local-command|agent-message)|Caveat:|\[Request interrupted)/;

let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  let ev;
  try { ev = JSON.parse(s); } catch { return; }
  if (ev.source !== 'compact' || !ev.transcript_path) return;
  let linhas;
  try { linhas = fs.readFileSync(ev.transcript_path, 'utf8').split('\n'); } catch { return; }

  const pedidos = [], respostas = [], arquivos = new Map(), perguntas = new Set();
  const texto = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && b.type === 'text').map(b => b.text).join('\n') : '';
  for (const l of linhas) {
    let e;
    try { e = JSON.parse(l); } catch { continue; }
    const c = e && e.message && e.message.content;
    if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b.type !== 'tool_use') continue;
        if (b.name === 'AskUserQuestion') perguntas.add(b.id);
        const f = b.input && (b.input.file_path || b.input.notebook_path);
        if (/^(Edit|Write|NotebookEdit)$/.test(b.name) && f) { arquivos.delete(f); arquivos.set(f, 1); }
      }
    } else if (e.type === 'user' && !e.isMeta && !e.isCompactSummary && c) {
      if (Array.isArray(c)) {
        for (const b of c) {
          if (b.type === 'tool_result' && perguntas.has(b.tool_use_id)) {
            const t = texto(b.content).trim();
            if (t) respostas.push(t.slice(0, 600));
          }
        }
      }
      const t = texto(c).trim();
      if (t && !SISTEMA.test(t)) pedidos.push(t.slice(0, 400));
    }
  }

  const p = pedidos.slice(-25), r = respostas, a = [...arquivos.keys()].slice(-30);
  const monta = () => [
    '# Livro de decisões (extraído do transcript; vale acima do resumo da compactação quando conflitar)',
    p.length ? '## Pedidos do usuário\n' + p.map((x, i) => `${i + 1}. ${x}`).join('\n') : '',
    r.length ? '## Respostas a perguntas\n' + r.map((x, i) => `${i + 1}. ${x}`).join('\n') : '',
    a.length ? '## Arquivos alterados\n' + a.map(x => '- ' + x).join('\n') : '',
  ].filter(Boolean).join('\n\n');
  if (!p.length && !r.length && !a.length) return;
  let out = monta();
  // Teto: some o mais antigo primeiro, pedidos antes de respostas e arquivos.
  while (out.length > MAX && (p.length || r.length || a.length)) {
    (p.length ? p : r.length ? r : a).shift();
    out = monta();
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out } }));
});
