import { expect, test } from 'claude-code/testing'

const BANDA = (surface: 'terminal' | 'desktop', isWorking = false) => ({
  plugin: 'contexto-bar',
  component: 'AbovePrompt',
  surface,
  props: { hasSurvey: false, isWorking, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 3 }, view: {} },
}) as const

// O engine embaixo: contexto em 60%, fork respondendo, nada de subagente.
const engine = (on: any, gravado: { path?: string; text?: string }, rodou: string[]) => {
  on('session.usage', () => ({ value: { context: { breakdown: { percentage: 60 }, percent: 10 } } }))
  on('agent.list', () => ({ value: [] }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'Tarefa: x\nPrimeiro passo: y', usage: {} } }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'minha-branch\n', stderr: '' } }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 23, 13, 5) }))
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    gravado.path = e.path
    gravado.text = e.text
    return { value: undefined }
  })
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('command.run', (_: unknown, e: { command: string }) => {
    rodou.push('/' + e.command)
    return {}
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    rodou.push('submit:' + e.text)
    return { text: e.text }
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`um clique grava o handoff, limpa e retoma a sessão (${surface})`, async ($, on) => {
    const gravado: { path?: string; text?: string } = {}
    const rodou: string[] = []
    engine(on, gravado, rodou)

    const ui = await $.ui.mount(BANDA(surface))
    await ui.press({ key: 'nova' })
    expect(gravado.path).toMatch(/handoffs[\\/]\d{8}-\d{4}\.md$/)
    expect(gravado.text).toBe('cwd: C:/proj\nsessao_anterior: abc-123\nbranch: minha-branch\nTarefa: x\nPrimeiro passo: y\n')
    expect(rodou).toEqual(['/clear', 'submit:Continue daqui.'])
    await ui.unmount()
  })
}

test('com turno em andamento não grava nada', async ($, on) => {
  const gravado: { path?: string; text?: string } = {}
  const rodou: string[] = []
  engine(on, gravado, rodou)

  const ui = await $.ui.mount(BANDA('terminal', true))
  await ui.press({ key: 'nova' })
  expect(gravado.path).toBe(undefined)
  expect(rodou).toEqual([])
  await ui.unmount()
})
