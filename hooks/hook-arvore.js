// SessionStart + PreToolUse(Edit|Write|NotebookEdit): nova sessão não edita a
// árvore principal quando ela não é lugar seguro. Várias sessões dividem a
// mesma árvore e uma acabava levando no commit/deploy o trabalho não commitado
// da outra. A regra "nova sessão = nova branch" vivia no CLAUDE.md e falhava;
// aqui o primeiro Edit barra e aponta `git worktree add`. Não o EnterWorktree:
// ele move o transcript para a pasta de projeto da worktree e a sessão some
// da lista do VSCode depois de reiniciar. Bug do hook nunca
// trava o trabalho: qualquer erro cai no catch e permite.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const cru = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
const git = (cwd, ...a) => cru(cwd, ...a).trim();
const norm = p => { const r = path.resolve(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
const foto = id => path.join(os.tmpdir(), `claude-arvore-${id}.json`);
const livre = id => path.join(os.tmpdir(), `claude-arvore-livre-${id}`);

function repo(dir) {
  try {
    const top = git(dir, 'rev-parse', '--show-toplevel');
    const [gd, cd] = git(dir, 'rev-parse', '--absolute-git-dir', '--git-common-dir').split(/\r?\n/);
    return { top, principal: norm(gd) === norm(path.resolve(dir, cd)) };
  } catch { return null; }
}

// -z e -uall: nome cru, sem aspas, e arquivo novo listado um a um (não a pasta),
// para dar para comparar com o arquivo editado.
function sujos(top) {
  // Sem trim: o espaço inicial de " M arq" faz parte do XY.
  const r = cru(top, 'status', '--porcelain', '-z', '--untracked-files=all').split('\0').filter(Boolean), l = [];
  for (let i = 0; i < r.length; i++) {
    l.push(r[i].slice(3));
    if (/^[RC]/.test(r[i])) l.push(r[++i]); // renomeado: o próximo é o nome antigo
  }
  return l;
}

function base(top) {
  try { return git(top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, ''); }
  catch { return 'main'; }
}

function decide(ev) {
  const id = ev.session_id;
  if (ev.hook_event_name === 'SessionStart') {
    if (!['startup', 'resume'].includes(ev.source) || !id) return;
    // resume não regrava: o sujo deixado pela própria sessão viraria "de outra sessão".
    if (fs.existsSync(foto(id))) return;
    const r = repo(ev.cwd || process.cwd());
    if (r) fs.writeFileSync(foto(id), JSON.stringify({ toplevel: r.top, principal: r.principal, sujos: sujos(r.top) }));
    return;
  }
  if (ev.hook_event_name !== 'PreToolUse') return;
  // Subagente edita onde o root mandou; quem decide a árvore é o root.
  if (ev.agent_id || ev.agent_type) return;
  if (id && fs.existsSync(livre(id))) return;
  const inp = ev.tool_input || {}, arq = inp.file_path || inp.notebook_path;
  if (!arq) return;
  const abs = path.resolve(ev.cwd || process.cwd(), arq);
  let dir = path.dirname(abs);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  const r = repo(dir);
  if (!r || !r.principal) return;

  let motivo;
  const br = git(r.top, 'rev-parse', '--abbrev-ref', 'HEAD');
  if ([base(r.top), 'main', 'master'].includes(br)) motivo = `a árvore principal está na branch base (${br})`;
  else {
    let f = null;
    try { f = JSON.parse(fs.readFileSync(foto(id), 'utf8')); } catch {}
    if (f && norm(f.toplevel) === norm(r.top)) {
      const rel = path.relative(r.top, abs).split(path.sep).join('/');
      const outros = f.sujos.filter(s => norm(s) !== norm(rel));
      if (outros.length) motivo = `a árvore principal já tinha alteração não commitada quando a sessão abriu (${outros.slice(0, 3).join(', ')}${outros.length > 3 ? ', …' : ''}), provavelmente de outra sessão`;
    }
  }
  if (!motivo) return;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: `Edição barrada: ${motivo}. Crie uma worktree pelo shell (\`git worktree add <pasta> -b <branch> origin/${base(r.top)}\`) e edite lá por caminho absoluto; não use a ferramenta EnterWorktree, que tira a sessão da lista do VSCode. Ou, se o usuário mandou editar aqui mesmo, rode \`touch ${livre(id).split(path.sep).join('/')}\`.`
    }
  };
}

let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  try { const o = decide(JSON.parse(s)); if (o) console.log(JSON.stringify(o)); } catch {}
});
