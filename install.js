#!/usr/bin/env node
// Instala agentes, skill e hooks num projeto Claude Code.
//
//   node install.js <pasta-do-projeto>
//
// Copia (nunca apaga o que ja existe la'):
//   agents/*.md            -> <proj>/.claude/agents/
//   skills/*/SKILL.md      -> <proj>/.claude/skills/<nome>/
//   hooks/hook-*.js        -> <proj>/scripts/        (so' se nao existir)
//   hooks/hooks.json       -> merge em <proj>/.claude/settings.local.json
//
// Merge de hooks: por evento, entra so' o que ainda nao esta la' (compara o
// `command`). permissions.ask e' unido sem duplicar. Resto do settings fica.
const fs = require('fs');
const path = require('path');

const proj = path.resolve(process.argv[2] || '.');
const aqui = __dirname;
const copiar = (de, para, sobrescrever = true) => {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  if (!sobrescrever && fs.existsSync(para)) return console.log('mantido  ' + para);
  fs.copyFileSync(de, para);
  console.log('copiado  ' + para);
};

for (const f of fs.readdirSync(path.join(aqui, 'agents')))
  copiar(path.join(aqui, 'agents', f), path.join(proj, '.claude', 'agents', f));

for (const s of fs.readdirSync(path.join(aqui, 'skills')))
  copiar(path.join(aqui, 'skills', s, 'SKILL.md'), path.join(proj, '.claude', 'skills', s, 'SKILL.md'));

for (const f of fs.readdirSync(path.join(aqui, 'hooks')).filter(f => f.endsWith('.js')))
  copiar(path.join(aqui, 'hooks', f), path.join(proj, 'scripts', f), false);

const alvo = path.join(proj, '.claude', 'settings.local.json');
const novo = JSON.parse(fs.readFileSync(path.join(aqui, 'hooks', 'hooks.json'), 'utf8'));
const atual = fs.existsSync(alvo) ? JSON.parse(fs.readFileSync(alvo, 'utf8')) : {};
atual.hooks = atual.hooks || {};
for (const [evento, grupos] of Object.entries(novo.hooks)) {
  const lista = (atual.hooks[evento] = atual.hooks[evento] || []);
  const cmds = new Set(lista.flatMap(g => g.hooks.map(h => h.command)));
  for (const g of grupos) if (!g.hooks.every(h => cmds.has(h.command))) lista.push(g);
}
atual.permissions = atual.permissions || {};
atual.permissions.ask = [...new Set([...(atual.permissions.ask || []), ...(novo.permissions.ask || [])])];
fs.writeFileSync(alvo, JSON.stringify(atual, null, 2) + '\n');
console.log('hooks    ' + alvo);
console.log('\nPronto. Sessao nova (ou /hooks) carrega tudo. Adapte os agentes ao CLAUDE.md do projeto.');
