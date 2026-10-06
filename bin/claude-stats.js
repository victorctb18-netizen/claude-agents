#!/usr/bin/env node
// Mede se as regras pegam: compactações, spawns por tipo, o que encheu o
// contexto do root antes de cada compactação e quantas vezes o worker-nudge
// avisou/travou. Regra em texto que ninguém mede vira opinião; com --salva a
// série em claude-stats.jsonl mostra se a última mudança mexeu no número.
// Uso: node bin/claude-stats.js [--dias N] [--salva]
const fs = require('fs'), path = require('path'), os = require('os');
const arg = process.argv.slice(2);
const dias = +(arg[arg.indexOf('--dias') + 1] || 0) || 7;
const conf = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const raiz = path.join(conf, 'projects'), desde = Date.now() - dias * 864e5;

// Tokens ~ chars/4, imagem 1500: mesma régua do levantamento de 2026-10-05.
const tk = c => typeof c === 'string' ? Math.ceil(c.length / 4) : !Array.isArray(c) ? 0 :
  c.reduce((t, b) => t + (b.type === 'image' ? 1500 : b.type === 'text' ? Math.ceil((b.text || '').length / 4) : 0), 0);
const cmdKey = s => {
  const t = (s || '').trim().replace(/^(cd [^&;]+(&&|;)\s*)+/, '').split(/\s+/);
  if (t[0] === 'rtk' && t[1] === 'proxy') t.splice(0, 2);
  const dois = ['git', 'gh', 'npm', 'docker', 'rtk', 'node', 'bash', 'python', 'python3', 'sh', 'pytest'].includes(t[0]);
  return 'Bash ' + (dois ? t.slice(0, 2).join(' ').replace(/[A-Za-z]:[\\/]\S*[\\/]/, '') : t[0]).slice(0, 50);
};
const causa = (u, i) => {
  if (u.name === 'Read') return /\.(png|jpe?g|gif|webp)$/i.test(i.file_path || '') ? 'Read imagem'
    : `Read ${path.basename(i.file_path || '')} (${i.offset || i.limit ? 'parcial' : 'inteiro'})`;
  if (u.name === 'Bash') return cmdKey(i.command);
  if (u.name === 'Grep') return 'Grep ' + (i.output_mode || 'files_with_matches');
  if (u.name === 'Agent' || u.name === 'Task') return 'Agent ' + (i.subagent_type || 'default');
  return /^mcp__/.test(u.name) ? 'MCP' : u.name;
};

const r = { sessoes: 0, compactadas: 0, compactacoes: 0, spawns: 0, avisos: 0, travas: 0 }, tipos = {}, causas = {};
for (const p of fs.existsSync(raiz) ? fs.readdirSync(raiz) : []) {
  const d = path.join(raiz, p);
  if (!fs.statSync(d).isDirectory()) continue;
  // Só os .jsonl direto na pasta do projeto: o root. Subagente fica em <sessão>/subagents/.
  for (const f of fs.readdirSync(d).filter(f => f.endsWith('.jsonl'))) {
    const fp = path.join(d, f);
    if (fs.statSync(fp).mtimeMs < desde) continue;
    r.sessoes++;
    const usos = {};
    let janela = [], nc = 0;
    for (const l of fs.readFileSync(fp, 'utf8').split('\n')) {
      if (!l) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      // O evento system de compactação vem junto do resumo: contar os dois dobra.
      if (e.isCompactSummary) {
        nc++;
        for (const [k, t] of janela) causas[k] = (causas[k] || 0) + t;
        janela = [];
        continue;
      }
      const a = e.attachment;
      if (a && a.type === 'hook_additional_context' && /\d+ leituras\/Edits do root em /.test(JSON.stringify(a.content))) r.avisos++;
      const m = e.message;
      if (!m) continue;
      if (typeof m.content === 'string') { if (e.type === 'user' && m.content.length > 3200) janela.push(['Texto colado', tk(m.content)]); continue; }
      if (!Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (b.type === 'tool_use') {
          usos[b.id] = b;
          if (b.name === 'Agent' || b.name === 'Task') { r.spawns++; const t = (b.input || {}).subagent_type || '(default)'; tipos[t] = (tipos[t] || 0) + 1; }
        } else if (b.type === 'tool_result') {
          const u = usos[b.tool_use_id] || { name: '?' };
          janela.push([causa(u, u.input || {}), tk(b.content)]);
          if (/\d+ leituras do root em .*Delegue ao worker/.test(JSON.stringify(b.content))) r.travas++;
        }
      }
    }
    if (nc) { r.compactadas++; r.compactacoes += nc; }
  }
}

const ord = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
const k = n => Math.round(n / 1000) + 'k';
const por = n => (n / (r.sessoes || 1)).toFixed(2);
const top = ord(causas).slice(0, 8);
console.log(`claude-stats: ${dias} dias, ${r.sessoes} sessões do root`);
console.log(`compactações ${r.compactacoes} em ${r.compactadas} sessões (${por(r.compactacoes)}/sessão)`);
console.log(`spawns ${r.spawns} (${por(r.spawns)}/sessão): ` + ord(tipos).map(([t, n]) => `${t} ${n}`).join(', '));
console.log(`worker-nudge: ${r.avisos} avisos, ${r.travas} travas`);
console.log('top causas de contexto antes de compactar (tokens ~ chars/4):');
for (const [c, t] of top) console.log(`  ${k(t).padStart(6)}  ${c}`);

if (arg.includes('--salva')) {
  const arq = path.join(conf, 'claude-stats.jsonl');
  const ant = fs.existsSync(arq) && fs.readFileSync(arq, 'utf8').trim().split('\n').filter(Boolean).pop();
  const linha = { data: new Date().toISOString().slice(0, 10), dias, ...r, tipos, causas: top };
  fs.appendFileSync(arq, JSON.stringify(linha) + '\n');
  console.log('salvo em ' + arq);
  if (ant) {
    const a = JSON.parse(ant), pa = n => n / (a.sessoes || 1), antC = Object.fromEntries(a.causas || []);
    const dif = (x, y, f) => `${f(y)} -> ${f(x)} (${x - y >= 0 ? '+' : ''}${f(x - y)})`;
    const f2 = n => n.toFixed(2);
    console.log(`vs ${a.data}: compactações/sessão ${dif(r.compactacoes / (r.sessoes || 1), pa(a.compactacoes), f2)}, ` +
      `spawns/sessão ${dif(r.spawns / (r.sessoes || 1), pa(a.spawns), f2)}`);
    for (const [c, t] of top.slice(0, 3)) console.log(`  ${c}: ${dif(t, antC[c] || 0, k)}`);
  }
}
