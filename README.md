# claude-agents

Subagentes com papel fixo, skill de orquestração, hooks e trecho de CLAUDE.md
para o Claude Code. Genérico: vale em qualquer repo. O que é específico de um
projeto fica no `.claude/` daquele projeto e sobrepõe o global pelo nome.

## Máquina nova (2 comandos)

```bash
git clone https://github.com/victorctb18-netizen/claude-agents
node claude-agents/install.js --global
```

Instala em `~/.claude/` (agentes, skill, hooks, `CLAUDE.md`) — todo repo da
máquina passa a ter. Também: plugins + marketplaces (`settings.base.json`),
modos caveman/ponytail/adhd sempre ligados, `~/bin/git-faxina.sh` + alias
`git faxina`. Sessão nova carrega e oferece instalar os plugins (se não
oferecer: `/plugin` → instalar cada um). Rodar de novo atualiza sem duplicar;
plugin que você desligou continua desligado. `bash test/install.sh` (e o CI)
prova isso.

Várias contas do Claude: uma pasta de config por conta, instale em cada:

```powershell
$env:CLAUDE_CONFIG_DIR="$HOME\.claude-2"; node claude-agents/install.js --global
```

Fica de fora (específico da máquina): hook do `rtk`, statusLine, chaves ssh,
MCP servers.

Por projeto (`node install.js <pasta>`) só quando o projeto precisa de versão
própria de um agente.

## O que tem

| Pasta | Conteúdo |
|---|---|
| `agents/` | `explorer` (mapa, só leitura) · `worker` (edita lista fechada de arquivos, cirúrgico) · `tester` (roda e cola evidência) · `reviewer` (opus, só o diff) · `ui-reviewer` (opus, tela real + `impeccable`/`hallmark` se existirem) · `researcher` (fato externo) · `entregador` (sonnet low: commit/push/PR/merge, só a pedido) · `ci-triage` (sonnet low: log de CI vermelho → job+linha+causa) |
| `skills/orchestrator/` | gate delegar-ou-fazer, fluxo explorer → workers → tester → reviewer, contrato de spawn, falha e conclusão, revisão proporcional ao risco |
| `hooks/` | `hook-node-check.js` (PostToolUse: `node --check` / `py_compile` no arquivo salvo, bloqueia) · `hook-cache-bust.js` (PreToolUse: antes de `git commit`, pergunta se `.js`/`.css` está sem bump de `?v=`; no-op se o projeto não tem `scripts/check-cache-bust.sh`) · `check-cache-bust.sh` · `hooks.json` |
| `lib/cdp-lib.js` | harness de browser sem dependência (Edge/Chrome headless + servidor estático + stub de `fetch`); copie pra `tests/` de projeto vanilla JS. ~20 linhas por prova de teclado/DOM |
| `CLAUDE.snippet.md` | seções "Subagentes" e "Autonomia e pronto" — o instalador anexa ao `~/.claude/CLAUDE.md` |

## Projeto vanilla JS com `?v=` (cache-bust)

Copie `hooks/check-cache-bust.sh` pra `scripts/` do projeto e `lib/cdp-lib.js`
pra `tests/`. O hook global passa a conferir `?v=` nesse projeto sozinho.

## Atualizar

Edite no projeto onde provou valor, copie pra cá, commite. Sem sync automático
de propósito: o repo é o que já valeu, não o rascunho.
