// Stop: põe o estado do trabalho na frente do nome da sessão, com o PR e a
// issue: "FAZENDO", "MERGE PR#12", "CI✗ PR#12", "FEITO PR#12", "FECHADO PR#12",
// "SUA VEZ" quando parou numa branch sem PR (vira "FAZENDO" assim que você
// responde, no UserPromptSubmit), "+ #507" em sessão de issue, cujo nome vira o título da issue. Palavra e não
// emoji: diz a ação que falta. A lista de sessões do VSCode não tem cor nem
// campo próprio; o nome é o único lugar que aparece nela, e corta em ~25
// caracteres, daí palavras de no máximo 7 letras.
// Grava a mesma linha `custom-title` que o /rename grava no transcript: o
// formato não é documentado, então qualquer erro cai no catch e não faz nada.
// Nome começando com "OK -" foi marcado à mão e não é tocado.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

// windowsHide: o processo solto não tem console, e sem isso o Windows abre uma
// janela visível para cada git/gh que ele chama.
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
// Teste troca o gh por um script node, sem rede.
const gh = (args, cwd) => process.env.STATUS_SESSAO_GH ? run('node', [process.env.STATUS_SESSAO_GH, ...args], cwd) : run('gh', args, cwd);
// Também tira o emoji da primeira versão do hook.
const PREFIXO = /^(?:(?:🔵|🟡|🔴|✅|⚪)\s*|(?:(?:FAZENDO|SUA VEZ|MERGE|CI✗|FEITO|FECHADO)(?: PR#\d+)?(?: #\d+)?|#\d+) · )/u;
const BASES = ['main', 'master', 'HEAD', ''];

function texto(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => typeof x === 'string' ? x : x.text || texto(x.content) || '').join(' ');
  return '';
}

function ler(arq) {
  const r = { custom: null, ai: null, primeira: null, pr: null, dirs: [] };
  for (const l of fs.readFileSync(arq, 'utf8').split('\n')) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type === 'custom-title') r.custom = o.customTitle;
    if (o.type === 'ai-title') r.ai = o.aiTitle;
    if (o.cwd) r.dirs.push(o.cwd);
    if (o.type === 'user') {
      const c = o.message && o.message.content;
      if (!r.primeira && !o.isMeta && typeof c === 'string' && !c.startsWith('<')) r.primeira = c;
      if (!r.primeira && !o.isMeta && Array.isArray(c) && c.some(x => x.type === 'text')) {
        const t = texto(c.filter(x => x.type === 'text'));
        if (!t.trimStart().startsWith('<')) r.primeira = t;
      }
      // PR só conta se apareceu em saída de ferramenta (gh pr create, git entrega):
      // link colado pelo usuário pode ser de outro assunto.
      if (Array.isArray(c)) for (const x of c) if (x.type === 'tool_result')
        for (const m of texto(x.content).matchAll(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g)) r.pr = { repo: m[1], n: m[2] };
    }
    if (o.type === 'assistant' && Array.isArray(o.message && o.message.content))
      for (const x of o.message.content) if (x.type === 'tool_use' && x.input) {
        const p = x.input.file_path || x.input.notebook_path;
        if (p) r.dirs.push(path.dirname(p));
      }
  }
  return r;
}

// Branch de trabalho: a última worktree linkada tocada (cwd ou arquivo editado);
// sessão que edita por caminho absoluto fica com cwd na raiz em main.
// Lê o HEAD do arquivo em vez de rodar `git branch --show-current`: o transcript
// cita centenas de pastas (1069 numa sessão), e era um processo git por pasta a
// cada Stop, cada um abrindo janela no Windows. Worktree linkada tem `.git`
// arquivo apontando para o gitdir; HEAD destacado não é ref e volta ''.
function headDe(d) {
  for (let p = d; ; p = path.dirname(p)) {
    const g = path.join(p, '.git');
    let gitdir = null;
    try {
      gitdir = fs.statSync(g).isDirectory() ? g
        : path.resolve(p, fs.readFileSync(g, 'utf8').match(/^gitdir:\s*(.+)$/m)[1].trim());
    } catch {}
    if (gitdir) {
      const m = fs.readFileSync(path.join(gitdir, 'HEAD'), 'utf8').match(/^ref: refs\/heads\/(.+)$/m);
      return m ? m[1].trim() : '';
    }
    if (path.dirname(p) === p) return '';
  }
}

function branch(dirs, cwd) {
  // Set: o transcript repete a mesma pasta a cada linha; a ordem de inserção
  // invertida mantém a mais recente na frente.
  for (const d of new Set([...dirs].reverse().concat(cwd || []))) {
    try {
      if (!fs.existsSync(d)) continue;
      const b = headDe(d);
      if (!BASES.includes(b)) return { b, dir: d };
    } catch {}
  }
  return null;
}

function estadoPr(pr, br) {
  // A branch viva manda: sessão que mergeou um PR e seguiu em outra branch está
  // em andamento. O PR da saída de ferramenta só vale quando a worktree já foi
  // apagada (git faxina depois do merge).
  const campos = 'number,state,statusCheckRollup';
  let v = null;
  if (br) v = JSON.parse(gh(['pr', 'list', '--head', br.b, '--state', 'all', '--limit', '1', '--json', campos], br.dir))[0] || null;
  else if (pr) v = JSON.parse(gh(['pr', 'view', pr.n, '--repo', pr.repo, '--json', campos]));
  if (!v) return br ? 'SUA VEZ' : null;
  const n = ` PR#${v.number}`;
  if (v.state === 'MERGED') return 'FEITO' + n;
  if (v.state === 'CLOSED') return 'FECHADO' + n;
  const falhou = (v.statusCheckRollup || []).some(c => ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ERROR'].includes(c.conclusion || c.state));
  return (falhou ? 'CI✗' : 'MERGE') + n;
}

function issue(r, br) {
  const m = (br && br.b.match(/issue-?(\d+)/i)) || (r.primeira || '').match(/(?:issues\/|issue\s*#?|(?<!PR\s?)#)(\d+)\b/i);
  return m ? m[1] : null;
}

function tituloIssue(n, cwd) {
  const cache = path.join(os.tmpdir(), `claude-status-issue-${n}-${Buffer.from(cwd || '').toString('hex').slice(-16)}.txt`);
  try { return fs.readFileSync(cache, 'utf8'); } catch {}
  const t = JSON.parse(gh(['issue', 'view', n, '--json', 'title'], cwd)).title;
  try { fs.writeFileSync(cache, t); } catch {}
  return t;
}

function decide(ev) {
  if (!ev.transcript_path) return null;
  const r = ler(ev.transcript_path);
  const atual = r.custom || r.ai || '';
  // Mensagem nova: a vez volta para a sessão. Só troca a palavra, sem gh, porque
  // o PR não muda entre o Stop e a resposta.
  if (ev.hook_event_name === 'UserPromptSubmit')
    return atual.startsWith('SUA VEZ') ? 'FAZENDO' + atual.slice('SUA VEZ'.length) : null;
  if (ev.hook_event_name !== 'Stop') return null;
  if (/^OK\s*-/i.test(atual)) return null;
  const br = branch(r.dirs, ev.cwd);
  const velho = (atual.match(PREFIXO) || [''])[0];
  let base = atual.slice(velho.length);
  let estado;
  try { estado = estadoPr(r.pr, br); } catch {
    // gh lento ou fora do ar: mantém o prefixo que já estava, em vez de apagá-lo.
    return null;
  }
  const n = issue(r, br);
  if (n) try {
    const t = tituloIssue(n, (br && br.dir) || ev.cwd);
    base = t.length > 50 ? t.slice(0, 49) + '…' : t;
  } catch {}
  if (!base) return null;
  const prefixo = [estado, n && `#${n}`].filter(Boolean).join(' ');
  const novo = prefixo ? `${prefixo} · ${base}` : base;
  return novo === atual ? null : novo;
}

function grava(ev) {
  const novo = decide(ev);
  if (!novo) return;
  const linha = JSON.stringify({ type: 'custom-title', customTitle: novo, sessionId: ev.session_id });
  const fim = fs.readFileSync(ev.transcript_path, 'utf8').endsWith('\n') ? '' : '\n';
  fs.appendFileSync(ev.transcript_path, fim + linha + '\n');
}

// O gh leva segundos (mais com a máquina carregada) e o Stop seguraria a
// sessão esperando: o trabalho vai para um processo solto e o hook sai na hora.
// O teste roda em linha (STATUS_SESSAO_SYNC) para conferir o resultado.
if (process.argv[2] === '--solto') {
  try { grava(JSON.parse(process.env.STATUS_SESSAO_EV)); } catch {}
} else {
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    try {
      if (process.env.STATUS_SESSAO_SYNC) return grava(JSON.parse(s));
      require('child_process').spawn(process.execPath, [__filename, '--solto'], {
        detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, STATUS_SESSAO_EV: s }
      }).unref();
    } catch {}
  });
}
