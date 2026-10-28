import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, RenderSurface } from 'claude-code'

const LARGURA = 48
// Só o corpo: o cabeçalho (cwd, sessão, branch) o mod escreve, porque o fork
// não tem ferramenta nenhuma para conferir e erraria a pasta ou o id.
const RESUMO =
  'Escreva o handoff desta sessão para uma sessão nova continuar: em até 8 linhas, a tarefa, branch e PR, ' +
  'o que está pronto e provado, o que falta, decisões que o usuário já tomou, arquivos-chave e o primeiro passo. ' +
  'Responda só com essas linhas, sem título, sem bloco de código, sem comentário antes ou depois.'

const gravando = atom({ plugin: 'contexto-bar', key: 'gravando' } as const, false)

// A barra mostra o MESMO número do /context: breakdown.percentage é contra a
// janela de autocompact. `context.percent` usa a janela do modelo (1M) e dava
// 13% enquanto o /context dizia 42%. Sem breakdown (sessão ainda sem resposta),
// cai para tokens/janela do modelo.

// Cortes sobre a janela de compactação: cada turno relê o contexto inteiro.
// 50% = não começar tarefa nova; 70% = fechar o passo e fazer o handoff já,
// com folga para o resumo sair bom.
const nivel = (p: number) => (p >= 70 ? 'error' : p >= 50 ? 'warning' : 'success')

const dois = (n: number) => String(n).padStart(2, '0')

// /clear no meio de um turno ou com subagente rodando perde o trabalho dele;
// o fork também resumiria um passo pela metade.
async function fazerHandoff($: EngineInterface, surface: RenderSurface, emTurno: boolean) {
  if (emTurno || (await $.agent.list()).some((a: AgentInfo) => a.status === 'running' || a.status === 'pending'))
    return $.ui.toast('Espere o turno e os subagentes terminarem para fazer o handoff.')
  if (await read($, gravando)) return
  await update($, gravando, () => true)
  try {
    const r = await $.model.fork({ prompt: RESUMO })
    if (!r.isAnswered) return $.ui.toast(`Handoff não saiu: ${r.reason}`)
    const [cwd, id, git] = await Promise.all([
      $.session.cwd(),
      $.session.id(),
      $.process.run(['git', 'branch', '--show-current']).catch(() => null),
    ])
    const branch = git?.stdout.trim() || '(fora de git)'
    const d = new Date(await $.clock.now())
    const nome = `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}.md`
    // O mod mora em <config>/mods/contexto-bar; o hook-handoff.js lê <config>/handoffs.
    const arquivo = `${$.plugin.root}/../../handoffs/${nome}`
    const texto = `cwd: ${cwd}\nsessao_anterior: ${id}\nbranch: ${branch}\n${r.text.trim()}\n`
    await $.fs.write(arquivo, texto)
    // Copiado para colar quando a sessão nova abrir em outra pasta, depois de
    // 48h ou na outra máquina; aqui o hook-handoff.js já o injeta no /clear.
    await $.ui.copy({ text: `${texto}\nContinue daqui.`, surface })
    // Sem confirmação, por pedido do usuário: o transcript fica no disco e o
    // livro de decisões sai dele, então um resumo ruim não perde nada.
    await $.command.run({ command: 'clear' })
    await $.prompt.submit({ text: 'Continue daqui.' })
  } finally {
    await update($, gravando, () => false)
  }
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const { context } = await $.session.usage({ breakdown: 'summary' })
    const bruto = context.breakdown?.percentage ?? context.percent ?? 0
    const p = Math.min(100, Math.round(bruto))
    const cheio = Math.round((p / 100) * LARGURA)
    const ocupado = await read($, gravando)

    return (
      <Box>
        <Text color={nivel(p)}>{'━'.repeat(cheio)}</Text>
        <Text dimColor>{'━'.repeat(LARGURA - cheio)} {p}%</Text>
        {p >= 50 ? <Text dimColor>{p >= 70 ? ' faça o handoff agora' : ' não comece tarefa nova'}</Text> : null}
        {ocupado ? <Text dimColor> gravando handoff…</Text> : p >= 50 ? (
          <Button key="nova" label="↻ Handoff" onPress={() => fazerHandoff($, e.surface, e.props.isWorking)} />
        ) : null}
      </Box>
    )
  })
}
