// PostToolUse: conta leituras do root sem Edit nem spawn no meio (Read, Grep, Glob, Bash só de
// leitura) e, na 6a, lembra de mandar o mapa para o explorer. Medido em 20
// sessões: ~40% das chamadas do root eram leitura, cada uma um turno de Opus
// relendo o contexto inteiro; o explorer foi chamado 1 vez. Edit, Write e
// spawn zeram: leitura entre edições é retoque, não mapa. Teste, ssh, script
// não contam nem zeram; zerar neles deixava a maior sequência em 8 numa sessão
// que leu 37 vezes antes do primeiro Edit. Repassado nas 20 sessões: 24 avisos,
// concentrados nas que mapearam no root; a orquestrada (explorer+worker) fica
// calada. Só avisa, não trava: o worker-nudge já trava arquivo grande.
// Dentro de subagente fica calado: ler é o trabalho dele.
const fs = require('fs'), os = require('os'), path = require('path');
const AVISA = 6, DE_NOVO = 15;
const LER = /^(grep|rg|sed|cat|head|tail|awk|ls|find|wc|less|git)$/;
const GIT_LER = /^(show|log|diff|grep|blame|ls-files)$/;

// Bash conta como leitura só se todo segmento lê; `sed -i`, teste ou build não contam.
function soLeitura(cmd) {
  return cmd.split(/&&|\|\||;|\|/).every(seg => {
    const t = seg.trim().split(/\s+/);
    while (t[0] === 'rtk' || t[0] === 'proxy') t.shift();
    if (!t[0] || t[0] === 'cd') return true;
    if (!LER.test(t[0])) return false;
    if (t[0] === 'sed' && t.some(x => /^-i/.test(x))) return false;
    if (t[0] === 'git' && !GIT_LER.test(t[1] || '')) return false;
    return true;
  });
}

let s = '';
process.stdin.on('data', d => s += d).on('end', () => { try {
  const e = JSON.parse(s);
  if (e.agent_id || e.agent_type) return;
  const i = e.tool_input || {};
  const est = path.join(os.tmpdir(), 'claude-explorer-nudge-' + (e.session_id || 'x'));
  if (/^(Edit|Write|NotebookEdit|Agent|Task|SendMessage)$/.test(e.tool_name)) { fs.rmSync(est, { force: true }); return; }
  const leu = /^(Read|Grep|Glob)$/.test(e.tool_name) || (e.tool_name === 'Bash' && soLeitura(i.command || ''));
  if (!leu) return;
  let n = 0;
  try { n = +fs.readFileSync(est, 'utf8') || 0; } catch {}
  fs.writeFileSync(est, String(++n));
  if (n !== AVISA && n !== DE_NOVO) return;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
    `${n} leituras no root desde o último Edit. Se ainda está entendendo o código (quem chama, qual fluxo), ` +
    'mande a pergunta ao explorer com o caminho do mapa e leia só o resumo. ' +
    'Se já sabe o que mudar e está a 1-2 leituras do Edit, siga.' } }));
} catch {} });  // bug do hook nunca trava o trabalho
