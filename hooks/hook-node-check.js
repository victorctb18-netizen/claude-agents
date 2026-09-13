// PostToolUse(Write|Edit): check de sintaxe no arquivo salvo. .js via
// `node --check`, .py via py_compile. Bloqueia — erro de sintaxe nunca e'
// falso-positivo e voltar na hora e' mais barato que descobrir no teste.
let s = '';
process.stdin.on('data', d => s += d).on('end', () => {
  const f = ((JSON.parse(s).tool_input || {}).file_path) || '';
  const cmd = /\.js$/.test(f) ? [process.execPath, ['--check', f]]
            : /\.py$/.test(f) ? ['python', ['-m', 'py_compile', f]]
            : null;
  if (!cmd) return;
  const r = require('child_process').spawnSync(cmd[0], cmd[1], { encoding: 'utf8' });
  if (r.status) {
    console.log(JSON.stringify({ decision: 'block', reason: 'sintaxe falhou em ' + f + ':\n' + (r.stderr || r.stdout) }));
  }
});
