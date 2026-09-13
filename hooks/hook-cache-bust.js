// PreToolUse(Bash): antes de `git commit`, roda check-cache-bust.sh no index.
// Achou .js/.css sem ?v= bumped → pede confirmação (nao bloqueia: heuristico
// e' o mesmo do CI, tem falso-positivo em arquivo que nenhuma pagina carrega).
let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const cmd = ((JSON.parse(s).tool_input || {}).command) || '';
  if (!/\bgit\s+commit\b/.test(cmd)) return;
  // Projeto sem o script (instalacao global) nao tem ?v= pra conferir.
  if (!require('fs').existsSync('scripts/check-cache-bust.sh')) return;
  // Hook roda antes do comando: em `git add X && git commit` o index ainda
  // esta vazio. Com add/-a no comando, olha a arvore inteira contra HEAD.
  // ponytail: falso-positivo em .js sujo que nao vai no commit; so pede confirmacao.
  const modo = /\bgit\s+add\b|\bcommit\s+(-[a-z]*a|--all)\b/.test(cmd) ? 'HEAD' : '--cached';
  const r = require('child_process').spawnSync('bash', ['scripts/check-cache-bust.sh', modo], { encoding: 'utf8' });
  const avisos = (r.stdout || '').split('\n').filter(l => l.startsWith('::warning'));
  if (!avisos.length) return;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: '?v= nao bumped:\n' + avisos.map(l => l.replace(/^::warning file=([^:]+)::/, '$1: ')).join('\n')
    }
  }));
});
