// Harness CDP compartilhado: Edge headless + servidor estatico do repo +
// stub de fetch dentro da pagina. Existe porque cada tests/*.cdp.js copiava
// ~150 linhas disso (serve/until/conectar/avaliar/tecla) e escolhia porta
// propria; provar um comportamento de teclado custava mais boilerplate que
// teste. Uso minimo:
//
//   const { abrir, checar, resumo } = require('./cdp-lib');
//   const h = await abrir({ fetchStub: { '/api/empresas': { empresas: [] } } });
//   await h.navegar('/app/empresas.html', 'document.getElementById("empresasBody")');
//   checar('nada selecionado', await h.avaliar('...'), -1);
//   await h.fechar(); resumo();
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

// No Windows `edge.kill()` mata so' o processo raiz: renderer/GPU/utility
// sobrevivem, seguram o lock do perfil e vazam ~10 GB/h de .edge-cdp-*.
// taskkill /T derruba a arvore inteira. spawnSync porque tambem roda no
// handler de 'exit', onde nada assincrono termina.
function matarArvore(edge) {
  if (!edge.pid || edge.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    // Grupo inteiro (pid negativo; o spawn e' detached): SIGKILL so' no pai
    // deixava os filhos do Chrome gravando no perfil, e o rmSync do
    // limparPerfil esgotava os retries -- ~24s por abertura no CI.
    try { process.kill(-edge.pid, 'SIGKILL'); } catch (_) {
      try { edge.kill('SIGKILL'); } catch (_) { /* ja morreu */ }
    }
  }
}

// Harness que estoura antes de fechar() (ou resumo() -> process.exit) nao pode
// deixar Edge orfao: o registro abaixo garante a limpeza em qualquer saida.
const vivos = new Map();
function limparPerfil(perfil) {
  try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 }); } catch (_) {
    // rmSync da EPERM no Windows mesmo sem processo vivo segurando o perfil;
    // rd /s /q passa pelo mesmo diretorio sem o problema.
    if (process.platform === 'win32') spawnSync('cmd', ['/c', 'rd', '/s', '/q', perfil], { stdio: 'ignore' });
  }
}
process.on('exit', () => vivos.forEach((perfil, edge) => { matarArvore(edge); limparPerfil(perfil); }));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => process.exit(130));
// Harness pendurado (await que nunca resolve) nunca chega no 'exit': em 07/10
// sobraram 4 node desde 09:22 segurando 143 processos do Edge e travando a
// máquina. O teto força a saída, e a saída limpa a árvore. unref: não segura
// harness que terminou antes.
setTimeout(() => {
  console.error('cdp-lib: harness passou de 20 min, encerrando para não deixar Edge órfão');
  process.exit(124);
}, 20 * 60 * 1000).unref();

// Teto de Edges de harness abertos ao mesmo tempo na máquina, somando sessões
// e worktrees. Em 14/10 uma medição com `xargs -P 3` mais as provas de outras
// sessões abriram Edges demais (~0,7 GB cada) numa máquina de 11 GB. Em 28/10
// o teto caiu de 3 para 2: mesmo com as flags enxutas, um Edge de harness do
// wizard ainda ocupa ~0,9 GB de RAM no pico, e três ao mesmo tempo (~2,6 GB)
// numa máquina que já vive cheia empurravam o resto para o disco. Fila de
// alguns segundos sai mais barato que a máquina inteira paginando.
// Vaga é uma porta local escutando: o SO solta a porta em qualquer morte do
// processo. Arquivo de pid foi descartado: fica velho com pid reaproveitado, e
// dois processos liberando a mesma vaga apagavam a do outro. Uma vaga por processo, até
// ele sair: harness com dois Edges abertos não espera por si mesmo.
// CDP_PORTA (CI) não pega vaga: contexto em navegador aberto é barato.
const VAGAS = 2;
const PORTA_VAGAS = 47301;
let vaga = null;

async function pegarVaga() {
  if (vaga) return;
  for (let esperando = false; ; esperando = true) {
    for (let i = 0; i < VAGAS; i++) {
      const s = net.createServer();
      const erro = await new Promise(r => { s.once('error', e => r(e.code)); s.listen(PORTA_VAGAS + i, '127.0.0.1', () => r(null)); });
      // Só EADDRINUSE é vaga ocupada. Porta que o Windows reservou depois de
      // um boot (EACCES) não pode travar a prova: segue sem teto.
      if (erro !== 'EADDRINUSE') { vaga = s.unref(); return; }
    }
    if (!esperando) console.error('cdp-lib: ' + VAGAS + ' Edges de harness já abertos na máquina, esperando vaga');
    await new Promise(r => setTimeout(r, 500));
  }
}

const root = path.join(__dirname, '..');

// Nada do registro acima roda quando o node do harness morre de SIGKILL
// (taskkill /F, sessao interrompida no meio da rodada): a arvore do Edge
// sobrevive e o perfil fica no disco. Por isso a limpeza tambem acontece na
// ENTRADA -- cada rodada varre o rastro das anteriores, e o conserto fica
// auto-curavel mesmo na pior saida possivel. So' mexe em perfil parado ha
// mais de 15 min, para nao derrubar outro harness rodando em paralelo na
// mesma arvore (uma rodada leva menos de 10 min).
const IDADE_ORFAO_MS = 15 * 60 * 1000;

// Mata pelo --user-data-dir, nao pelo pid: o pid do dono morreu junto com o
// node. So' CIM/WMI mostra CommandLine; tasklist nao mostra argumento.
function matarPorPerfil(perfil) {
  if (process.platform === 'win32') {
    const alvo = "'*" + perfil.replace(/'/g, "''") + "*'";
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\""
      + ' | Where-Object { $_.CommandLine -like ' + alvo + ' }'
      + ' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
  } else {
    spawnSync('pkill', ['-9', '-f', perfil], { stdio: 'ignore' });
  }
}

// Todas as worktrees do repo, nao so' a raiz desta: worktree onde ninguem
// roda harness de novo nunca era varrida (em 2026-09-28 eram 68 perfis,
// 10 GB, 33 so' numa worktree parada). Sem git, fica so' a raiz.
function arvoresDoRepo() {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const arvores = (r.stdout || '').split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => path.resolve(l.slice('worktree '.length).trim()));
  return arvores.length ? arvores : [root];
}

function varrerOrfaos() {
  for (const arvore of arvoresDoRepo()) {
    let entradas;
    try { entradas = fs.readdirSync(arvore); } catch (_) { continue; }
    for (const nome of entradas) {
      if (!nome.startsWith('.edge-cdp-')) continue;
      const perfil = path.join(arvore, nome);
      try { if (Date.now() - fs.statSync(perfil).mtimeMs < IDADE_ORFAO_MS) continue; } catch (_) { continue; }
      matarPorPerfil(perfil);
      limparPerfil(perfil);
    }
  }
}

// Metade dos harnesses nasceu no Chrome, metade no Edge; os dois servem.
const EDGE = [process.env.CDP_BROWSER, process.env.CHROME_BIN,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find(p => p && fs.existsSync(p));
if (!EDGE) throw new Error('nenhum navegador: defina CDP_BROWSER');
const PRINTS = process.argv.includes('--prints');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'
};

// Prontidao por polling, nunca setTimeout fixo: timeout fixo da' falso-negativo
// por corrida de carregamento de script (ver CLAUDE.md).
// Excecao tambem conta como "ainda nao": logo apos um Page.navigate o
// documento novo chega parcial, getElementById devolve null e a expressao
// estoura -- na CI (Linux, mais lenta) isso derrubava a rodada no meio. O
// ultimo erro vai junto no timeout, pra expressao quebrada de verdade nao
// virar so' "timeout".
// 45s e nao 15s: com 4 harnesses em paralelo (CI) o wizard de ~20k linhas
// leva mais de 15s pra montar o passo. O limite so' pesa quando falha.
async function until(fn, descricao, limiteMs = 45000) {
  const fim = Date.now() + limiteMs;
  for (;;) {
    let valor, erro;
    try { valor = await fn(); } catch (e) { erro = e; }
    if (valor) return valor;
    if (Date.now() > fim) throw new Error('timeout esperando: ' + descricao + (erro ? ' (ultimo erro: ' + erro.message + ')' : ''));
    await new Promise(r => setTimeout(r, 50));
  }
}

// `rotas`: { '/prefixo': (req, res) => boolean } â€” devolve true se respondeu.
// Serve pra trocar uma pagina de destino por um HTML minimo, por exemplo.
function serve(rotas) {
  const server = http.createServer((req, res) => {
    for (const [prefixo, fn] of Object.entries(rotas)) {
      if (req.url.startsWith(prefixo) && fn(req, res)) return;
    }
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nao encontrado'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  // Porta 0: o SO escolhe. Acaba com a colecao de 10111/10113/10119 que
  // colidia quando dois harnesses rodavam juntos.
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function conectar(url) {
  const ws = new WebSocket(url);
  let proximoId = 0;
  const pendentes = new Map();
  const erros = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    // `text` e' so' "Uncaught"; a mensagem util vem em exception.description.
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      erros.push((d.exception && d.exception.description) || d.text);
    }
    const p = pendentes.get(msg.id);
    if (!p) return;
    pendentes.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
  });
  const pronto = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return {
    pronto, ws, erros,
    send(method, params = {}) {
      const id = ++proximoId;
      return new Promise((resolve, reject) => {
        pendentes.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

// Stub de rede dentro da pagina: sem backend, sem login. `fetchStub` mapeia
// prefixo de URL â†’ corpo JSON (ou funcao (url) â†’ corpo). URL sem match vai
// pro fetch real (arquivos estaticos do proprio servidor).
// Runner da CI (Linux headless) nao tem mouse: la' `(pointer: fine)` da' false
// e a tela se comporta como toque -- empresas.js nao poe o cursor na busca e a
// prova so' quebra na CI, nunca na maquina com mouse. O harness simula o
// desktop com mouse, que e' onde o app e' usado. Emulation.setEmulatedMedia nao
// cobre `pointer` (testado: segue igual), por isso o override em JS.
// ponytail: so' a consulta exata "(pointer: fine)"; consulta composta com
// pointer/hover continua real -- estender quando alguma tela usar.
function mouseNoDesktop() {
  var real = window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    var m = real(q);
    if (m.matches || String(q).replace(/\s+/g, '') !== '(pointer:fine)') return m;
    return { matches: true, media: m.media, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } };
  };
}

function scriptStub(fetchStub) {
  const entradas = Object.entries(fetchStub).map(([k, v]) =>
    '[' + JSON.stringify(k) + ',' + (typeof v === 'function' ? v.toString() : 'function(){return ' + JSON.stringify(v) + '}') + ']');
  return '(function(){var S=[' + entradas.join(',') + '];var real=window.fetch;'
    + 'window.fetch=function(url){var u=String(url);'
    + 'for(var i=0;i<S.length;i++){if(u.indexOf(S[i][0])===0||u.indexOf(location.origin+S[i][0])===0){'
    + 'var corpo=S[i][1](u);'
    + 'return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(corpo)},text:function(){return Promise.resolve(JSON.stringify(corpo))}});}}'
    + 'return real.apply(this,arguments);};})();';
}

// Navegador próprio por abrir(): perfil em disco, processo morto no fechar().
async function lancarNavegador() {
  // Porta livre pedida ao SO, nao sorteada: a CI roda harnesses em paralelo
  // e dois sorteios iguais disputavam a mesma porta e o mesmo perfil.
  const livre = await serve({});
  const cdpPort = livre.address().port;
  await new Promise(r => livre.close(r));
  const perfil = path.join(root, '.edge-cdp-' + cdpPort);
  fs.rmSync(perfil, { recursive: true, force: true });
  await pegarVaga();
  // --remote-debugging-pipe com o fd 3/4 aberto e nunca usado: o Edge fecha
  // quando o pipe cai, e o pipe cai em qualquer morte do node, inclusive
  // TerminateProcess (`timeout`, taskkill /F, sessão interrompida), onde
  // nenhum handler de 'exit' roda. Provado em 14/10: só com a porta, a árvore
  // do Edge sobrevive ao node; com o pipe, some em menos de 5 s.
  // Flags enxutas: desligam extensão, atualização de componente, rede de
  // fundo, sync e tradução, que o harness nunca usa. Medido em 28/10 com
  // wizard-limite-fornecedor (6 rodadas sem, 3 com): pico privado de ~480 MB
  // para ~405 MB e RAM de ~980 MB para ~870 MB por Edge. --renderer-process-limit=1
  // foi descartada: o ganho sumia no ruído entre rodadas.
  const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-pipe',
    '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', '--disable-default-apps', '--mute-audio',
    '--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,AutofillServerCommunication',
    '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + perfil, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  vivos.set(edge, perfil);

  const wsUrl = await until(async () => {
    try {
      const lista = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json();
      const alvo = lista.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      return alvo && alvo.webSocketDebuggerUrl;
    } catch (_) { return null; }
  }, 'endpoint CDP do Edge');
  return {
    wsUrl,
    encerrar() {
      matarArvore(edge);
      vivos.delete(edge);
      // taskkill /F volta antes do SO soltar o lock; o retry cobre a janela.
      // Best-effort: EPERM aqui nao pode reprovar a rodada. .gitignore cobre .edge-*/.
      limparPerfil(perfil);
    }
  };
}

// CDP_PORTA: navegador ja' aberto (o CI abre um so' para a rodada inteira).
// Subir o Chrome custava 2-4 s por abrir(), ~80 aberturas por rodada. Cada
// abrir() ganha um BrowserContext proprio, que isola cookie, storage e cache
// como o perfil novo isolava.
async function abrirContexto(porta) {
  const versao = await (await fetch('http://127.0.0.1:' + porta + '/json/version')).json();
  const nav = conectar(versao.webSocketDebuggerUrl);
  await nav.pronto;
  // disposeOnDetach: harness que morre sem fechar() derruba o socket, e o
  // contexto vai junto em vez de seguir rodando timers no Chrome da rodada.
  const { browserContextId } = await nav.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await nav.send('Target.createTarget', { url: 'about:blank', browserContextId });
  return {
    wsUrl: 'ws://127.0.0.1:' + porta + '/devtools/page/' + targetId,
    async encerrar() {
      // Teto: em 13/10 o Chrome da rodada nunca respondeu o dispose de um
      // harness com tudo ok, e o passo ficou 20 min parado até o vigia matar.
      // Contexto que sobra morre com o socket logo abaixo (disposeOnDetach).
      await Promise.race([
        nav.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}),
        new Promise(res => setTimeout(res, 5000).unref())
      ]);
      try { nav.ws.close(); } catch (_) { /* navegador caiu */ }
    }
  };
}

async function abrir({ fetchStub = {}, rotas = {}, viewport = { width: 1280, height: 900 }, scripts = [] } = {}) {
  varrerOrfaos();
  const server = await serve(rotas);
  const base = 'http://127.0.0.1:' + server.address().port;
  const navegador = process.env.CDP_PORTA ? await abrirContexto(process.env.CDP_PORTA) : await lancarNavegador();
  const wsUrl = navegador.wsUrl;
  const cli = conectar(wsUrl);
  await cli.pronto;
  await cli.send('Page.enable');
  await cli.send('Runtime.enable');
  // Com o Chrome compartilhado do CI, só uma aba tem foco de verdade: o
  // harness ao lado roubava o foco e .focus()/Enter daqui caíam no vazio
  // (wizard-saldo-grupo e wizard-578-lupa falhavam juntos, passavam sozinhos).
  await cli.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cli.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  await cli.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await cli.send('Page.addScriptToEvaluateOnNewDocument', { source: scriptStub(fetchStub) });
  await cli.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + mouseNoDesktop + ')();' });
  for (const s of scripts) await cli.send('Page.addScriptToEvaluateOnNewDocument', { source: s });

  async function avaliar(expressao) {
    const r = await cli.send('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expressao);
    return r.result.value;
  }

  // `code` explicito pra digito: o code de "2" e' "Digit2", nao "2" -- com o
  // code errado o Edge descarta o evento e a tecla simplesmente nao chega.
  async function tecla(key, keyCode, code) {
    for (const type of ['keyDown', 'keyUp']) {
      await cli.send('Input.dispatchKeyEvent', {
        type, key, code: code || key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode
      });
    }
  }

  // `pronto`: expressao JS que vira true quando a pagina esta usavel.
  async function navegar(caminho, pronto, descricao) {
    await cli.send('Page.navigate', { url: base + caminho });
    if (pronto) await until(() => avaliar(pronto), descricao || 'pronto: ' + caminho);
  }

  async function estabilizar() {
    await avaliar('document.fonts.ready.then(() => Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))))');
  }

  // So' grava com --prints. Pasta por harness pra o ui-reviewer achar.
  async function print(nome, pasta) {
    if (!PRINTS) return;
    await estabilizar();
    const dir = path.join(root, '.prints', pasta || path.basename(process.argv[1], '.cdp.js'));
    fs.mkdirSync(dir, { recursive: true });
    const captura = await cli.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(dir, nome + '.png'), Buffer.from(captura.data, 'base64'));
  }

  async function fechar() {
    try { cli.ws.close(); } catch (_) { /* socket ja caiu com o Edge */ }
    await navegador.encerrar();
    server.close();
  }

  return { cli, base, erros: cli.erros, avaliar, tecla, navegar, until, estabilizar, print, fechar };
}

const casos = [];
function checar(nome, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  casos.push({ nome, ok });
  let linha = (ok ? 'ok   ' : 'FALHA') + ' ' + nome;
  if (!ok) linha += '\n        esperado ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real);
  console.log(linha);
}

function resumo() {
  const falhas = casos.filter(c => !c.ok).length;
  console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' passaram');
  process.exit(falhas ? 1 : 0);
}

module.exports = { abrir, checar, resumo, until, varrerOrfaos, PRINTS };
