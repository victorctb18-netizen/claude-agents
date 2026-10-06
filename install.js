#!/usr/bin/env node
// Instala agentes, skill, hooks e trecho de CLAUDE.md.
//
//   node install.js --global              # ~/.claude, vale pra todo repo da maquina
//   node install.js --global --upstream   # idem + atualiza as skills do Matt Pocock
//   node install.js <pasta-do-projeto>    # so' naquele projeto (.claude/ dele)
//
// Global e' o normal. Por projeto so' quando o projeto precisa de agente
// diferente do global: Claude Code prefere o de .claude/agents/ ao de
// ~/.claude/agents/ quando o nome coincide.
//
// Agentes e skills sobrescrevem (são deste repo); o que saiu do repo sai da
// instalação, pelo manifesto .claude-agents.json. Hooks entram só se o
// command ainda não está lá, permissions.ask é unido, o trecho de CLAUDE.md
// troca o bloco entre marcadores.
const fs = require('fs');
const path = require('path');
const os = require('os');

const aqui = __dirname;
const global = process.argv.includes('--global');
// CLAUDE_CONFIG_DIR: uma pasta por conta do Claude (c2/c3/c4); instale em cada uma.
const alvoDir = global ? (process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')) : path.resolve(process.argv[2] || '.');
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

// Manifesto do que este repo instalou: agente ou skill que sai do repo sai da
// máquina, e o que o usuário criou à mão (fora do manifesto) fica. Sem
// manifesto (instalação anterior a ele), entregador.md é o único removido:
// virou bin/entrega.sh.
const manifestoRepo = path.join(claudeDir, '.claude-agents.json');
const instalado = fs.existsSync(manifestoRepo) ? JSON.parse(fs.readFileSync(manifestoRepo, 'utf8'))
  : { agents: global ? ['entregador.md'] : [], skills: [] };
const doRepo = { agents: fs.readdirSync(path.join(aqui, 'agents')), skills: fs.readdirSync(path.join(aqui, 'skills')) };
for (const f of instalado.agents.filter(f => !doRepo.agents.includes(f)))
  if (fs.existsSync(path.join(claudeDir, 'agents', f))) {
    fs.rmSync(path.join(claudeDir, 'agents', f));
    console.log('removido ' + path.join(claudeDir, 'agents', f));
  }
for (const f of doRepo.agents)
  copiar(path.join(aqui, 'agents', f), path.join(claudeDir, 'agents', f));

// --upstream: puxa o clone das skills do Matt (vizinho deste repo) e copia.
// O link-skills.sh dele cria symlink, mas o Git Bash no Windows copia em vez
// de linkar: sem isto, `git pull` nao chegava em ~/.claude e skill removida
// la' ficava instalada para sempre. O manifesto lembra o que veio de la' para
// apagar so' o que sumiu do upstream, nunca skill do usuario.
const pastaSkills = path.join(claudeDir, 'skills');
if (process.argv.includes('--upstream')) {
  const clone = process.env.MATT_SKILLS_DIR || path.join(aqui, '..', 'mattpocock-skills');
  const cp = require('child_process');
  if (cp.spawnSync('git', ['-C', clone, 'pull', '-q', '--ff-only'], { stdio: 'inherit' }).status !== 0) {
    console.error('git pull falhou em ' + clone);
    process.exit(1);
  }
  // deprecated/ e misc/ ficam de fora, como no link-skills.sh do proprio repo.
  const achadas = {};
  const varre = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || ['node_modules', 'deprecated', 'misc'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (fs.existsSync(path.join(p, 'SKILL.md'))) achadas[e.name] = p;
      else varre(p);
    }
  };
  varre(path.join(clone, 'skills'));
  const manifesto = path.join(pastaSkills, '.upstream.json');
  const antes = fs.existsSync(manifesto) ? JSON.parse(fs.readFileSync(manifesto, 'utf8')) : [];
  for (const s of antes.filter(s => !achadas[s])) {
    fs.rmSync(path.join(pastaSkills, s), { recursive: true, force: true });
    console.log('removido ' + path.join(pastaSkills, s));
  }
  for (const [s, de] of Object.entries(achadas)) {
    fs.rmSync(path.join(pastaSkills, s), { recursive: true, force: true });
    fs.cpSync(de, path.join(pastaSkills, s), { recursive: true });
  }
  fs.writeFileSync(manifesto, JSON.stringify(Object.keys(achadas).sort(), null, 2) + '\n');
  console.log('upstream ' + Object.keys(achadas).length + ' skills de ' + clone);
}

// Pasta inteira: skill leva arquivo junto (prova-tela traz o cdp-lib.js).
// rmSync antes: cpSync mescla, e fork sobre copia do upstream herdava arquivo
// que o fork nao tem (to-spec ficou com o agents/ do original).
for (const s of doRepo.skills) {
  fs.rmSync(path.join(pastaSkills, s), { recursive: true, force: true });
  fs.cpSync(path.join(aqui, 'skills', s), path.join(pastaSkills, s), { recursive: true });
  console.log('copiado  ' + path.join(pastaSkills, s));
}
// Fork que sai daqui mas existe no upstream fica: é a cópia do Matt.
const manifestoUp = path.join(pastaSkills, '.upstream.json');
const doUpstream = fs.existsSync(manifestoUp) ? JSON.parse(fs.readFileSync(manifestoUp, 'utf8')) : [];
for (const s of instalado.skills.filter(s => !doRepo.skills.includes(s) && !doUpstream.includes(s))) {
  fs.rmSync(path.join(pastaSkills, s), { recursive: true, force: true });
  console.log('removido ' + path.join(pastaSkills, s));
}
fs.writeFileSync(manifestoRepo, JSON.stringify(doRepo, null, 2) + '\n');

for (const f of fs.readdirSync(path.join(aqui, 'hooks')).filter(f => /\.(js|sh)$/.test(f)))
  copiar(path.join(aqui, 'hooks', f), path.join(hooksDir, f), global);

const novo = JSON.parse(fs.readFileSync(path.join(aqui, 'hooks', 'hooks.json'), 'utf8'));
const atual = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
atual.hooks = atual.hooks || {};
// SessionStart listava os agentes, que o Claude Code já lista sozinho em toda
// sessão: saiu do hooks.json, e a cópia instalada sai junto.
if (atual.hooks.SessionStart) {
  atual.hooks.SessionStart = atual.hooks.SessionStart.filter(g => !g.hooks.some(h => (h.command || '').includes('Subagentes: explorer (mapa)')));
  if (!atual.hooks.SessionStart.length) delete atual.hooks.SessionStart;
}
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

if (global) {
  // Plugins, marketplaces e permissoes que valem pra qualquer repo. So' une:
  // plugin que o usuario desligou (false) continua desligado. false no base
  // e' plugin tirado do pacote: desliga tambem em maquina ja instalada, senao
  // a decisao so' valeria pra maquina nova.
  const base = JSON.parse(fs.readFileSync(path.join(aqui, 'settings.base.json'), 'utf8'));
  atual.permissions.allow = [...new Set([...(atual.permissions.allow || []), ...base.permissions.allow])];
  atual.enabledPlugins = { ...base.enabledPlugins, ...(atual.enabledPlugins || {}) };
  for (const [p, v] of Object.entries(base.enabledPlugins)) if (v === false) atual.enabledPlugins[p] = false;
  atual.extraKnownMarketplaces = { ...base.extraKnownMarketplaces, ...(atual.extraKnownMarketplaces || {}) };
  atual.worktree = atual.worktree || base.worktree;
  // Conector do claude.ai (Lovable, Trello, Docs) manda instrucao pra todo
  // subagente, use ou nao a ferramenta: ~1,5k tokens por spawn. Quem quer de
  // volta poe false no proprio settings e o instalador respeita.
  atual.disableClaudeAiConnectors = atual.disableClaudeAiConnectors ?? base.disableClaudeAiConnectors;
  // env do usuario vence: o base so' preenche chave ausente.
  atual.env = { ...base.env, ...(atual.env || {}) };
  fs.writeFileSync(settingsPath, JSON.stringify(atual, null, 2) + '\n');
  console.log('plugins  ' + settingsPath);

  // Modos sempre ligados: os plugins leem esses marcadores no SessionStart.
  for (const [f, v] of [['.caveman-active', 'full'], ['.ponytail-active', 'full'], ['.i-have-adhd-always', '']])
    if (!fs.existsSync(path.join(claudeDir, f))) fs.writeFileSync(path.join(claudeDir, f), v);

  const bin = path.join(os.homedir(), 'bin');
  copiar(path.join(aqui, 'bin', 'git-faxina.sh'), path.join(bin, 'git-faxina.sh'));
  const cp = require('child_process');
  if (cp.spawnSync('git', ['config', '--global', '--get', 'alias.faxina']).status !== 0)
    cp.spawnSync('git', ['config', '--global', 'alias.faxina', '!bash ~/bin/git-faxina.sh']);
  // Commit/push/PR/merge sem subagente. Alias com ! roda da raiz do repo,
  // onde o script acha os scripts/check-*.sh do projeto.
  copiar(path.join(aqui, 'bin', 'entrega.sh'), path.join(bin, 'entrega.sh'));
  cp.spawnSync('git', ['config', '--global', 'alias.entrega', '!bash ~/bin/entrega.sh']);
  // Driver de conflito mecanico (?v=, changelog .json). So' age em repo que
  // pede por .gitattributes (merge=mecanico); nos outros o git nem chama.
  copiar(path.join(aqui, 'bin', 'merge-mecanico.js'), path.join(bin, 'merge-mecanico.js'));
  cp.spawnSync('git', ['config', '--global', 'merge.mecanico.name', 'conflito mecanico: ?v= e changelog json']);
  cp.spawnSync('git', ['config', '--global', 'merge.mecanico.driver', 'node ~/bin/merge-mecanico.js %O %A %B %P']);

  // rtk e' binario a parte (nao vem neste repo). So' liga o hook se a maquina
  // ja tem rtk no PATH: sem isso todo comando Bash quebraria pra quem nao tem.
  var rtkLigado = cp.spawnSync('rtk', ['--version'], { shell: true }).status === 0;
  if (rtkLigado) {
    copiar(path.join(aqui, 'RTK.md'), path.join(claudeDir, 'RTK.md'));
    const rtkCmd = 'rtk hook claude';
    const lista = (atual.hooks.PreToolUse = atual.hooks.PreToolUse || []);
    const jaTem = lista.some(g => g.hooks.some(h => h.command === rtkCmd));
    if (!jaTem) lista.unshift({ matcher: 'Bash', hooks: [{ type: 'command', command: rtkCmd }] });
    fs.writeFileSync(settingsPath, JSON.stringify(atual, null, 2) + '\n');
    console.log('rtk      ligado (' + settingsPath + ')');
  } else {
    // https://github.com/rtk-ai/rtk#installation: um comando por SO.
    const comando = { win32: 'winget install rtk-ai.rtk', darwin: 'brew install rtk' }[process.platform]
      || 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh';
    console.log('rtk      nao encontrado no PATH: hook e RTK.md pulados.');
    console.log('         instale com: ' + comando);
    console.log('         depois rode este instalador de novo pra ligar.');
  }
}

// O trecho vive entre marcadores e é trocado inteiro a cada instalação:
// seção editada no repo chega em máquina já instalada. Antes dos marcadores
// as seções eram anexadas soltas; a migração apaga essas cópias pelo título.
const claudeMd = global ? path.join(claudeDir, 'CLAUDE.md') : path.join(alvoDir, 'CLAUDE.md');
// CRLF -> LF: checkout no Windows (autocrlf) deixa CR no fim das linhas.
let existente = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8').replace(/\r\n/g, '\n') : '';
if (typeof rtkLigado !== 'undefined' && rtkLigado && !existente.includes('@RTK.md'))
  existente = '@RTK.md\n\n' + existente;
const INI = '<!-- claude-agents: gerado por install.js, edite no repo claude-agents -->';
const FIM = '<!-- /claude-agents -->';
const secoes = fs.readFileSync(path.join(aqui, 'CLAUDE.snippet.md'), 'utf8').replace(/\r\n/g, '\n').split(/^(?=## )/m).filter(s => s.trim());
// Higiene de git depende do ~/bin/git-faxina.sh: so' no global.
const bloco = INI + '\n\n' + secoes.filter(s => global || !s.startsWith('## Higiene')).map(s => s.trimEnd()).join('\n\n') + '\n\n' + FIM + '\n';
const i = existente.indexOf(INI), j = existente.indexOf(FIM);
let novoMd;
if (i >= 0 && j > i) novoMd = existente.slice(0, i) + bloco + existente.slice(j + FIM.length).replace(/^\n/, '');
else {
  // ponytail: casa pelo começo do título antigo; seção do próprio usuário com
  // o mesmo começo ("## Entrega de ...") sairia junto na primeira instalação.
  const legado = ['Higiene de git', 'Subagentes', 'Autonomia', 'Entrega'];
  novoMd = existente.split(/^(?=#{1,6} )/m)
    .filter(s => !legado.some(l => new RegExp('^#{1,6} ' + l).test(s)))
    .join('').trimEnd();
  novoMd = (novoMd ? novoMd + '\n\n' : '') + bloco;
}
if (novoMd === existente) console.log('mantido  ' + claudeMd);
else {
  fs.writeFileSync(claudeMd, novoMd);
  console.log('trecho   ' + claudeMd);
}

console.log('\nPronto. Sessao nova (ou /hooks) carrega tudo.');
