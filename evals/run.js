#!/usr/bin/env node
// Eval dos agentes: roda tarefas fixas com `claude -p` numa cópia descartável
// da fixture e grava métricas + checks em evals/resultados.jsonl, para que
// mudança de prompt/hook seja comparada por número (--compara a b).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const DIR = __dirname;
const SAIDA = path.join(DIR, 'resultados.jsonl');
const TIMEOUT_MS = 10 * 60 * 1000;

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? padrao : process.argv[i + 1];
}

// O arquivo grande é gerado na cópia para não versionar 4000 linhas. Gerador
// determinístico: as funções nomeadas caem sempre na mesma linha, e os checks
// por arquivo:linha da tarefa "onde-chama" só valem para os arquivos pequenos.
function gerarGrande() {
  const nomeadas = {
    40: 'function somarItens(itens) {\n  let total = 0;\n  for (const i of itens) total += i.preco * (i.qtd || 1);\n  return total;\n}\n',
    90: 'function taxaJuros(valor) {\n  if (!valor) return 0.01;\n  return valor * 0.02;\n}\n',
    160: "function formatarMoeda(v) {\n  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');\n}\n",
    250: 'function limiteCredito(renda) {\n  if (!renda) return 1000;\n  return renda * 3;\n}\n',
    340: "function validarCnpj(cnpj) {\n  const d = String(cnpj || '').replace(/\\D/g, '');\n  return d.length === 14;\n}\n",
    440: 'function prazoMaximo(score) {\n  if (!score) return 30;\n  return Math.min(120, score / 10);\n}\n',
  };
  const partes = [];
  for (let n = 1; n <= 500; n++) {
    if (nomeadas[n]) { partes.push(nomeadas[n]); continue; }
    const id = String(n).padStart(4, '0');
    partes.push(`function calc${id}(x) {\n  const a = x * ${n % 7 + 1};\n  const b = a + ${n};\n  const c = b % ${n % 13 + 2};\n  if (c === 0) return a;\n  return b - c;\n}\n`);
  }
  partes.push('module.exports = { somarItens, taxaJuros, formatarMoeda, limiteCredito, validarCnpj, prazoMaximo };\n');
  return partes.join('\n');
}

function prepararCopia() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-agentes-'));
  fs.cpSync(path.join(DIR, 'fixture'), tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'app', 'grande.js'), gerarGrande());
  const git = (...a) => execFileSync('git', a, { cwd: tmp, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=eval', '-c', 'user.email=eval@local', 'commit', '-q', '-m', 'fixture');
  return tmp;
}

function rodarClaude(cwd, prompt) {
  return new Promise((resolve) => {
    // Prompt vai por stdin: no Windows o shim do npm exige shell, e passar o
    // texto como argumento por cmd.exe quebra aspas e acentos.
    const args = ['-p', '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits', '--no-session-persistence'];
    const win = process.platform === 'win32';
    const filho = win ? spawn('claude ' + args.join(' '), { cwd, shell: true }) : spawn('claude', args, { cwd });
    let out = '', err = '', estourou = false;
    const timer = setTimeout(() => {
      estourou = true;
      // kill() no Windows mata só o cmd.exe do shell; o claude ficaria órfão.
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/T', '/F', '/PID', String(filho.pid)], { stdio: 'ignore' }); } catch {}
      } else filho.kill('SIGKILL');
    }, TIMEOUT_MS);
    filho.stdout.on('data', (d) => { out += d; });
    filho.stderr.on('data', (d) => { err += d; });
    filho.on('close', (codigo) => { clearTimeout(timer); resolve({ out, err, codigo, estourou }); });
    filho.stdin.end(prompt);
  });
}

function parsear(out) {
  const m = {
    tokens: { input: 0, cache_read: 0, cache_creation: 0, output: 0 },
    custo_usd: null, num_turns: null, duracao_ms: null,
    tools: {}, spawns: {}, perguntou: false, resposta: '', erro: null,
  };
  for (const linha of out.split('\n')) {
    let ev;
    try { ev = JSON.parse(linha); } catch { continue; }
    if (ev.type === 'assistant') {
      for (const b of (ev.message && ev.message.content) || []) {
        if (b.type !== 'tool_use') continue;
        m.tools[b.name] = (m.tools[b.name] || 0) + 1;
        if (b.name === 'Agent' || b.name === 'Task') {
          const t = (b.input && b.input.subagent_type) || 'general-purpose';
          m.spawns[t] = (m.spawns[t] || 0) + 1;
        }
        if (b.name === 'AskUserQuestion') m.perguntou = true;
      }
    } else if (ev.type === 'result') {
      // Usage do result, não a soma dos eventos assistant: cada bloco de
      // conteúdo repete o usage da mesma mensagem e a soma contaria dobrado.
      const u = ev.usage || {};
      m.tokens = {
        input: u.input_tokens || 0,
        cache_read: u.cache_read_input_tokens || 0,
        cache_creation: u.cache_creation_input_tokens || 0,
        output: u.output_tokens || 0,
      };
      m.custo_usd = ev.total_cost_usd ?? null;
      m.num_turns = ev.num_turns ?? null;
      m.duracao_ms = ev.duration_ms ?? null;
      m.resposta = ev.result || '';
      if (ev.is_error) m.erro = ev.subtype || 'erro';
    }
  }
  // Em -p não há humano para responder AskUserQuestion; pergunta no texto
  // final também conta.
  if (/\?\s*\**\s*$/m.test(m.resposta)) m.perguntou = true;
  return m;
}

function diffDe(cwd) {
  execFileSync('git', ['add', '-A'], { cwd, stdio: 'pipe' });
  const numstat = execFileSync('git', ['diff', '--cached', '--numstat'], { cwd, encoding: 'utf8' });
  const arquivos = {};
  for (const l of numstat.trim().split('\n').filter(Boolean)) {
    const [mais, menos, arq] = l.split('\t');
    arquivos[arq] = (Number(mais) || 0) + (Number(menos) || 0);
  }
  return arquivos;
}

function checar(checks, m, diff) {
  const r = {};
  const tocados = Object.keys(diff);
  const nSpawns = Object.values(m.spawns).reduce((a, b) => a + b, 0);
  if ('spawn' in checks) r.spawn = checks.spawn === null ? nSpawns === 0 : !!m.spawns[checks.spawn];
  if (checks.sem_spawn) r.sem_spawn = nSpawns === 0;
  if (checks.perguntou) r.perguntou = m.perguntou;
  if (checks.sem_diff) r.sem_diff = tocados.length === 0;
  if (checks.resposta_contem) r.resposta_contem = checks.resposta_contem.every((s) => m.resposta.includes(s));
  if (checks.diff_toca) r.diff_toca = checks.diff_toca.every((f) => tocados.includes(f));
  if (checks.diff_nao_toca) r.diff_nao_toca = checks.diff_nao_toca.every((f) => !tocados.includes(f));
  if (checks.diff_max_linhas != null) {
    const total = Object.values(diff).reduce((a, b) => a + b, 0);
    r.diff_max_linhas = total > 0 && total <= checks.diff_max_linhas;
  }
  return r;
}

function totalTokens(t) { return t.input + t.cache_read + t.cache_creation + t.output; }

function tabela(linhas, cab) {
  const larg = cab.map((c, i) => Math.max(c.length, ...linhas.map((l) => String(l[i]).length)));
  const fmt = (l) => l.map((v, i) => String(v).padEnd(larg[i])).join('  ');
  console.log(fmt(cab));
  console.log(larg.map((n) => '-'.repeat(n)).join('  '));
  for (const l of linhas) console.log(fmt(l));
}

async function rodar() {
  const tarefas = JSON.parse(fs.readFileSync(path.join(DIR, 'tarefas.json'), 'utf8'));
  const so = arg('--tarefa');
  const rotulo = arg('--rotulo', 'sem-rotulo');
  const reps = Number(arg('--repeticoes', '1'));
  const escolhidas = so ? tarefas.filter((t) => t.id === so) : tarefas;
  if (!escolhidas.length) { console.error(`tarefa não encontrada: ${so}`); process.exit(1); }

  const linhas = [];
  for (const t of escolhidas) {
    for (let rep = 1; rep <= reps; rep++) {
      const tmp = prepararCopia();
      process.stderr.write(`[${t.id} #${rep}] rodando em ${tmp}\n`);
      const r = await rodarClaude(tmp, t.prompt);
      const m = parsear(r.out);
      if (r.estourou) m.erro = 'timeout';
      else if (m.custo_usd === null) m.erro = m.erro || `sem evento result (código ${r.codigo}): ${r.err.slice(0, 300)}`;
      const diff = diffDe(tmp);
      const checks = checar(t.checks, m, diff);
      const passou = !m.erro && Object.values(checks).every(Boolean);
      const reg = { rotulo, data: new Date().toISOString(), tarefa: t.id, rep, ...m, diff, checks, passou };
      fs.appendFileSync(SAIDA, JSON.stringify(reg) + '\n');
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      const falhas = Object.keys(checks).filter((k) => !checks[k]);
      linhas.push([t.id, rep, passou ? 'ok' : 'FALHOU', m.custo_usd == null ? '-' : m.custo_usd.toFixed(4),
        totalTokens(m.tokens), m.num_turns ?? '-', m.duracao_ms == null ? '-' : (m.duracao_ms / 1000).toFixed(1) + 's',
        Object.entries(m.spawns).map(([k, v]) => `${k}x${v}`).join(',') || '-',
        m.erro || falhas.join(',') || '-']);
    }
  }
  tabela(linhas, ['tarefa', 'rep', 'checks', 'custo', 'tokens', 'turnos', 'tempo', 'spawns', 'erro/falhas']);
}

function comparar(a, b) {
  const regs = fs.readFileSync(SAIDA, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const media = (rotulo, tarefa, f) => {
    const xs = regs.filter((r) => r.rotulo === rotulo && r.tarefa === tarefa).map(f).filter((v) => v != null);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  };
  const tarefas = [...new Set(regs.filter((r) => r.rotulo === a || r.rotulo === b).map((r) => r.tarefa))];
  const metricas = [
    ['custo', (r) => r.custo_usd, 4],
    ['tokens', (r) => totalTokens(r.tokens), 0],
    ['turnos', (r) => r.num_turns, 1],
    ['tempo_s', (r) => r.duracao_ms == null ? null : r.duracao_ms / 1000, 1],
    ['%passou', (r) => (r.passou ? 100 : 0), 0],
  ];
  const linhas = [];
  for (const t of tarefas) {
    for (const [nome, f, casas] of metricas) {
      const va = media(a, t, f), vb = media(b, t, f);
      const fx = (v) => (v == null ? '-' : v.toFixed(casas));
      const delta = va == null || vb == null ? '-' : (vb - va >= 0 ? '+' : '') + (vb - va).toFixed(casas);
      const pct = va ? ((vb - va) / va * 100).toFixed(0) + '%' : '-';
      linhas.push([t, nome, fx(va), fx(vb), delta, va == null || vb == null ? '-' : pct]);
    }
  }
  tabela(linhas, ['tarefa', 'métrica', a, b, 'b-a', 'Δ%']);
}

const ci = process.argv.indexOf('--compara');
if (ci !== -1) comparar(process.argv[ci + 1], process.argv[ci + 2]);
else rodar();
