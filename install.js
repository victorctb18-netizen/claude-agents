#!/usr/bin/env node
// Instala agentes, skill, hooks e trecho de CLAUDE.md.
//
//   node install.js --global              # ~/.claude — vale pra todo repo da maquina
//   node install.js <pasta-do-projeto>    # so' naquele projeto (.claude/ dele)
//
// Global e' o normal. Por projeto so' quando o projeto precisa de agente
// diferente do global — Claude Code prefere o de .claude/agents/ ao de
// ~/.claude/agents/ quando o nome coincide.
//
// Nunca apaga o que ja existe: agentes e skill sobrescrevem (sao deste repo),
// hooks entram so' se o command ainda nao esta la', permissions.ask e' unido,
// o trecho de CLAUDE.md so' entra se o marcador nao existe.
const fs = require('fs');
const path = require('path');
const os = require('os');

const aqui = __dirname;
const global = process.argv.includes('--global');
const alvoDir = global ? path.join(os.homedir(), '.claude') : path.resolve(process.argv[2] || '.');
const claudeDir = global ? alvoDir : path.join(alvoDir, '.claude');
const settingsPath = path.join(claudeDir, global ? 'settings.json' : 'settings.local.json');
// Global: scripts ficam em ~/.claude/hooks e o command aponta absoluto.
// Projeto: em scripts/ do projeto, command relativo (roda com cwd no projeto).
const hooksDir = global ? path.join(claudeDir, 'hooks') : path.join(alvoDir, 'scripts');

const copiar = (de, para, sobrescrever = true) => {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  if (!sobrescrever && fs.existsSync(para)) return console.log('mantido  ' + para);
  fs.copyFileSync(de, para);
  console.log('copiado  ' + para);
};

for (const f of fs.readdirSync(path.join(aqui, 'agents')))
  copiar(path.join(aqui, 'agents', f), path.join(claudeDir, 'agents', f));

for (const s of fs.readdirSync(path.join(aqui, 'skills')))
  copiar(path.join(aqui, 'skills', s, 'SKILL.md'), path.join(claudeDir, 'skills', s, 'SKILL.md'));

for (const f of fs.readdirSync(path.join(aqui, 'hooks')).filter(f => /\.(js|sh)$/.test(f)))
  copiar(path.join(aqui, 'hooks', f), path.join(hooksDir, f), global);

const novo = JSON.parse(fs.readFileSync(path.join(aqui, 'hooks', 'hooks.json'), 'utf8'));
const atual = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
atual.hooks = atual.hooks || {};
for (const [evento, grupos] of Object.entries(novo.hooks)) {
  const lista = (atual.hooks[evento] = atual.hooks[evento] || []);
  const cmds = new Set(lista.flatMap(g => g.hooks.map(h => h.command)));
  for (const g of grupos) {
    if (global) for (const h of g.hooks)
      h.command = h.command.replace(/node scripts\/(hook-[a-z-]+\.js)/, (_, f) => 'node "' + path.join(hooksDir, f).replace(/\\/g, '/') + '"');
    if (!g.hooks.every(h => cmds.has(h.command))) lista.push(g);
  }
}
atual.permissions = atual.permissions || {};
atual.permissions.ask = [...new Set([...(atual.permissions.ask || []), ...(novo.permissions.ask || [])])];
fs.writeFileSync(settingsPath, JSON.stringify(atual, null, 2) + '\n');
console.log('hooks    ' + settingsPath);

const claudeMd = global ? path.join(claudeDir, 'CLAUDE.md') : path.join(alvoDir, 'CLAUDE.md');
const trecho = fs.readFileSync(path.join(aqui, 'CLAUDE.snippet.md'), 'utf8');
const existente = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
if (existente.includes('## Subagentes')) console.log('mantido  ' + claudeMd + ' (ja tem "## Subagentes")');
else { fs.writeFileSync(claudeMd, existente + (existente && !existente.endsWith('\n') ? '\n' : '') + '\n' + trecho); console.log('anexado  ' + claudeMd); }

console.log('\nPronto. Sessao nova (ou /hooks) carrega tudo.');
