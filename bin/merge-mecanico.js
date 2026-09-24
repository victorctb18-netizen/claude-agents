#!/usr/bin/env node
// Driver de merge do git para conflito mecanico: o que um humano resolveria
// sem ler a intencao de ninguem:
//
//   ?v= de cache-bust: dois PRs bumpam linhas vizinhas de <script>/<link> e o
//   git acusa conflito. Por linha: fica o lado que mudou; os dois mudaram,
//   fica a versao maior.
//   .json append-only (changelog): os dois lados inseriram no mesmo ponto.
//   Fica ours + theirs, e so' se o arquivo inteiro continuar JSON valido.
//
// Qualquer outro trecho em conflito volta com os marcadores de sempre (exit 1)
// e segue para a resolucao manual. O projeto liga por .gitattributes:
//   *.html merge=mecanico
//   changelog.json merge=mecanico
// O instalador registra o driver no git global:
//   git config --global merge.mecanico.driver "node ~/bin/merge-mecanico.js %O %A %B %P"
const fs = require('fs');
const { spawnSync } = require('child_process');

const [base, ours, theirs, nome = ours] = process.argv.slice(2);
const r = spawnSync('git', ['merge-file', '--diff3', '-p', '-L', 'ours', '-L', 'base', '-L', 'theirs', ours, base, theirs], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status < 0 || r.error) process.exit(2);
const mesclado = r.stdout;
if (r.status === 0) { fs.writeFileSync(ours, mesclado); process.exit(0); }

const V = /\?v=[^"'&\s>]*/g;
const semV = l => l.replace(V, '?v=');
const maior = (a, b) => (a.match(V) || []).join().localeCompare((b.match(V) || []).join(), undefined, { numeric: true }) >= 0 ? a : b;

function cacheBust(o, b, t) {
  if (o.length !== t.length || !o.every((l, i) => semV(l) === semV(t[i]))) return null;
  const alinhado = b.length === o.length && b.every((l, i) => semV(l) === semV(o[i]));
  return o.map((l, i) => !alinhado ? maior(l, t[i]) : l === b[i] ? t[i] : t[i] === b[i] ? l : maior(l, t[i]));
}

const json = /\.json$/i.test(nome);
const HUNK = /^<{7} ours\r?\n([\s\S]*?)^\|{7} base\r?\n([\s\S]*?)^={7}\r?\n([\s\S]*?)^>{7} theirs\r?\n/gm;
const linhas = s => (s ? s.replace(/\r?\n$/, '').split(/\r?\n/) : []);
const eol = mesclado.includes('\r\n') ? '\r\n' : '\n';
let sobrou = 0;
const resolvido = mesclado.replace(HUNK, (bloco, o, b, t) => {
  const cb = cacheBust(linhas(o), linhas(b), linhas(t));
  if (cb) return cb.join(eol) + eol;
  if (json && !b.trim()) return o + t;
  sobrou++;
  return bloco;
});

if (json && !sobrou) try { JSON.parse(resolvido); } catch (_) { fs.writeFileSync(ours, mesclado); process.exit(1); }
fs.writeFileSync(ours, resolvido);
process.exit(sobrou ? 1 : 0);
