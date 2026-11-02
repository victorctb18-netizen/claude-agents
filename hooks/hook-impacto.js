#!/usr/bin/env node
// Quem depende de um arquivo ou símbolo. Dois modos no mesmo arquivo, para a
// regra de busca ser uma só:
//   git impacto <arquivo|símbolo>   lista tudo, sem resumo (CLI)
//   PostToolUse Edit|Write          avisa uma vez por sessão ao editar arquivo central
// Por que existe: o agente achava chamadores com grep, e o resumo do rtk
// escondeu um; o CI do #840 do hub quebrou por isso. Aqui a saída é nossa,
// inteira. Busca por texto (git grep), não por AST: o hub liga arquivo por
// <script src> e window.App, que grafo de import nenhum enxerga.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
// Medido no hub-contabil: chrome-rail 33, index.css 31, updates-panel 29,
// nav-back 27; empresas.js 15, parser de banco 2. Abaixo de 20 é arquivo de tela.
const CENTRAL = 20;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function git(cwd, args) {
  try { return cp.execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return e.status === 1 ? '' : null; }  // 1 = nada achado
}

// { arquivo: ['linha: texto', ...] }. .md fica de fora: doc cita, não depende.
function quem(raiz, alvo, ehArquivo) {
  let args;
  if (!ehArquivo) args = ['grep', '-n', '-w', '-F', alvo, '--', ':!*.md'];
  else {
    const ext = path.extname(alvo), stem = esc(path.basename(alvo, ext));
    // Python importa pelo nome do módulo; o resto cita o arquivo (src, href,
    // require, import). Sem extensão, só em caminho relativo (./, ../):
    // 'empresas' solto ou '/api/empresas' é rota, e dava 111 dependentes no hub.
    const re = ext === '.py'
      ? `^\\s*(from|import)\\s.*(^|[^A-Za-z0-9_])${stem}([^A-Za-z0-9_]|$)`
      : `(^|[^A-Za-z0-9_.-])${stem}${esc(ext)}([^A-Za-z0-9]|$)|\\.\\.?/([^'"]*/)?${stem}['"]`;
    args = ['grep', '-n', '-E', re, '--', ':!*.md', ':!' + alvo];
  }
  const out = git(raiz, args), r = {};
  for (const l of (out || '').split('\n').filter(Boolean)) {
    const [, f, resto] = l.match(/^([^:]+):(.*)/) || [];  // sem fim de linha no regex: arquivo CRLF deixa o CR no texto, e . não casa CR
    if (f) (r[f] = r[f] || []).push(resto.trimEnd().slice(0, 160));
  }
  return r;
}

function alvoNoRepo(p, base) {
  const abs = path.resolve(base, p.replace(/^\/([a-z])\//i, '$1:/'));
  const raiz = (git(fs.existsSync(abs) ? path.dirname(abs) : base, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!raiz) return null;
  const rel = path.relative(raiz, abs).replace(/\\/g, '/');
  return { raiz, rel, ehArquivo: !rel.startsWith('..') && fs.existsSync(abs) && fs.statSync(abs).isFile() };
}

if (process.argv[2]) {
  // Alias com ! roda da raiz; GIT_PREFIX é a pasta de onde o usuário chamou.
  const base = path.resolve(process.env.GIT_PREFIX || '.');
  const a = alvoNoRepo(process.argv[2], base);
  if (!a) { console.error('fora de um repo git'); process.exit(2); }
  const alvo = a.ehArquivo ? a.rel : process.argv[2];
  const r = quem(a.raiz, alvo, a.ehArquivo);
  for (const [f, ls] of Object.entries(r)) for (const l of ls) console.log(`${f}:${l}`);
  console.log(`\n${Object.keys(r).length} arquivos dependem de ${alvo}${a.ehArquivo ? '' : ' (símbolo)'}`);
} else {
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => { try {
    const e = JSON.parse(s), f = (e.tool_input || {}).file_path;
    if (!f) return;
    const a = alvoNoRepo(f, e.cwd || '.');
    if (!a || !a.ehArquivo) return;
    const est = path.join(os.tmpdir(), 'claude-impacto-' + (e.session_id || 'x'));
    let vistos = [];
    try { vistos = fs.readFileSync(est, 'utf8').split('\n'); } catch {}
    const chave = a.raiz + '|' + a.rel;
    if (vistos.includes(chave)) return;
    fs.appendFileSync(est, chave + '\n');  // central ou não: um git grep por arquivo por sessão
    const n = Object.keys(quem(a.raiz, a.rel, true)).length;
    if (n < CENTRAL) return;
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
      `${a.rel} é arquivo central: ${n} arquivos o referenciam. Antes de dar pronto, rode ` +
      `\`git impacto ${a.rel}\` e o teste ou harness que cobre esses chamadores.` } }));
  } catch {} });  // bug do hook nunca trava o trabalho
}
