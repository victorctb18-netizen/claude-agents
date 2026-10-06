// Frontmatter de agente e skill que o Claude Code lê sem reclamar: um erro
// aqui faz o agente sumir da lista calado. E travessão em texto do repo, que
// vira texto gerado por imitação (regra do usuário: nunca travessão).
const fs = require('fs'), path = require('path'), a = require('assert');
const raiz = path.join(__dirname, '..');
const fm = f => {
  const m = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  a.ok(m, f + ': sem frontmatter');
  const o = {};
  for (const l of m[1].split('\n')) {
    if (/^\s+- /.test(l)) continue;  // item de lista da chave anterior (skills:)
    const kv = l.match(/^([\w-]+):\s*(.*)$/);
    a.ok(kv, f + ': linha fora de chave: valor: ' + l);
    // ": " solto num valor sem aspas é YAML inválido.
    a.ok(/^["']/.test(kv[2]) || !/: /.test(kv[2]), f + ': ": " em valor sem aspas: ' + kv[1]);
    o[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  a.ok(o.description, f + ': sem description');
  return o;
};
for (const f of fs.readdirSync(path.join(raiz, 'agents'))) {
  const o = fm(path.join(raiz, 'agents', f));
  a.equal(o.name, f.replace(/\.md$/, ''), f + ': name diferente do arquivo');
  a.match(o.model, /^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9-]+)$/, f + ': model');
}
for (const s of fs.readdirSync(path.join(raiz, 'skills')))
  a.equal(fm(path.join(raiz, 'skills', s, 'SKILL.md')).name, s, s + ': name diferente da pasta');

const ls = require('child_process').execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' });
const comTravessao = ls.split('\n').filter(f => /\.(md|js|sh|json|ya?ml)$/.test(f))
  .filter(f => fs.existsSync(path.join(raiz, f)) && fs.readFileSync(path.join(raiz, f), 'utf8').includes(String.fromCharCode(0x2014)));
a.deepEqual(comTravessao, [], 'travessão em: ' + comTravessao.join(', '));
console.log('ok');
