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
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
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
async function until(fn, descricao, limiteMs = 15000) {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > fim) throw new Error('timeout esperando: ' + descricao);
    await new Promise(r => setTimeout(r, 50));
  }
}

// `rotas`: { '/prefixo': (req, res) => boolean } — devolve true se respondeu.
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
// prefixo de URL → corpo JSON (ou funcao (url) → corpo). URL sem match vai
// pro fetch real (arquivos estaticos do proprio servidor).
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

async function abrir({ fetchStub = {}, rotas = {}, viewport = { width: 1280, height: 900 }, scripts = [] } = {}) {
  const server = await serve(rotas);
  const base = 'http://127.0.0.1:' + server.address().port;
  const cdpPort = 9400 + Math.floor(Math.random() * 500);
  const perfil = path.join(root, '.edge-cdp-' + cdpPort);
  fs.rmSync(perfil, { recursive: true, force: true });
  const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + perfil, 'about:blank'], { stdio: 'ignore' });

  const wsUrl = await until(async () => {
    try {
      const lista = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json();
      const alvo = lista.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      return alvo && alvo.webSocketDebuggerUrl;
    } catch (_) { return null; }
  }, 'endpoint CDP do Edge');
  const cli = conectar(wsUrl);
  await cli.pronto;
  await cli.send('Page.enable');
  await cli.send('Runtime.enable');
  await cli.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  await cli.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await cli.send('Page.addScriptToEvaluateOnNewDocument', { source: scriptStub(fetchStub) });
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
    edge.kill();
    server.close();
    // Best-effort: o Edge ainda pode estar soltando o lock do perfil; EPERM
    // aqui nao pode reprovar a rodada. .gitignore cobre .edge-*/.
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (_) { /* lock do Edge */ }
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

module.exports = { abrir, checar, resumo, until, PRINTS };
