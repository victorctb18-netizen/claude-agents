# claude-agents

Subagentes, skill de orquestração e hooks que uso no Claude Code. Feito para
o hub-contabil (vanilla JS + Flask); em outro projeto, adapte as referências
ao CLAUDE.md.

## Máquina nova

```bash
git clone https://github.com/victorctb18-netizen/claude-agents
node claude-agents/install.js caminho/do/projeto
```

Depois abra uma sessão nova do Claude Code no projeto (ou `/hooks` numa
sessão aberta). Nada é apagado: agentes e skill sobrescrevem, hooks são
mesclados em `.claude/settings.local.json`, scripts só entram se não existem.

## O que tem

| Pasta | Conteúdo |
|---|---|
| `agents/` | `explorer` (mapa, só leitura) · `worker` (edita lista fechada de arquivos) · `tester` (roda e cola evidência) · `reviewer` (opus, só o diff) · `ui-reviewer` (opus, tela + `impeccable critique`) · `researcher` (fato externo) |
| `skills/orchestrator/` | gate delegar-ou-fazer, fluxo explorer → workers → tester → reviewer, contrato de spawn, falha e conclusão |
| `hooks/` | `hook-node-check.js` (PostToolUse: `node --check` / `py_compile` no arquivo salvo, bloqueia) · `hook-cache-bust.js` (PreToolUse: antes de `git commit`, pergunta se `.js`/`.css` está sem bump de `?v=`) · `hooks.json` (bloco pronto de settings) |

`hook-cache-bust.js` chama `scripts/check-cache-bust.sh`, que é do hub-contabil.
Em projeto sem `?v=`, apague esse hook do `hooks.json` antes de instalar.

## Atualizar o repo a partir do projeto

Edite no projeto (`.claude/agents/`, `.claude/skills/orchestrator/`,
`scripts/hook-*.js`), depois copie de volta e commite aqui. Sem sync
automático de propósito: o repo é o que já provou valor, não o rascunho.
