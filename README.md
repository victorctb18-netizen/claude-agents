# claude-agents

Configuração compartilhada do Claude Code: subagentes com papéis definidos, uma
skill de orquestração, hooks de verificação e um trecho padrão de `CLAUDE.md`.

O conteúdo é genérico e vale para qualquer repositório. Regras específicas de um
projeto ficam no `.claude/` daquele projeto; um agente com o mesmo nome no
projeto substitui a versão global.

## Instalação

Em uma máquina nova, bastam dois comandos:

```bash
git clone https://github.com/victorctb18-netizen/claude-agents
node claude-agents/install.js --global
```

O instalador copia para `~/.claude/`:

- os agentes, as skills de `skills/` (pasta inteira, com os arquivos que cada
  uma traz), os hooks e o trecho de `CLAUDE.md`;
- os plugins e marketplaces listados em `settings.base.json`: `caveman`,
  `ponytail`, `i-have-adhd`, `impeccable`, `claude-md-management`,
  `security-guidance`, `code-simplifier`, `claude-code-setup`, `playwright` e
  `skill-creator`;
- os modos caveman, ponytail e adhd, ativos por padrão;
- o script `~/bin/git-faxina.sh` e o alias `git faxina`;
- o driver de merge `~/bin/merge-mecanico.js` (registrado no git global como
  `merge.mecanico`), que resolve sozinho conflito de `?v=` e de changelog
  `.json` nos repos que pedem por `.gitattributes`;
- o hook do `rtk` e o `RTK.md`, **só se a máquina já tem `rtk` no PATH** — sem
  isso o hook quebraria todo comando `Bash` de quem não tem o binário. Sem
  `rtk` instalado, o instalador imprime o comando certo pro seu sistema
  ([rtk-ai/rtk](https://github.com/rtk-ai/rtk)):

  ```powershell
  winget install rtk-ai.rtk          # Windows
  ```
  ```bash
  brew install rtk                    # macOS
  curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh   # Linux
  ```

  Rode `node install.js --global` de novo depois de instalar pra ligar o hook.

Na sessão seguinte, o Claude Code oferece instalar os plugins. Se não oferecer,
use `/plugin` e instale cada um.

O instalador pode ser executado novamente para atualizar: não duplica entradas e
mantém desligado qualquer plugin que você tenha desativado. Plugin marcado
`false` no `settings.base.json` saiu do pacote e é desligado também em máquina
já instalada: `superpowers`, `frontend-design`, `ui-ux-pro-max` e `code-review`
(sem uso em 40 sessões; sobrepunham `grilling`, `diagnosing-bugs`, `tdd`,
`impeccable` e o `reviewer`, e custavam descrição em toda sessão). O teste
`bash test/install.sh` (também executado no CI) verifica esse comportamento.

**Mais de uma conta do Claude:** use uma pasta de configuração por conta e
instale em cada uma.

```powershell
$env:CLAUDE_CONFIG_DIR="$HOME\.claude-2"; node claude-agents/install.js --global
```

**Não incluído** (depende da máquina): binário do `rtk` em si (só o hook, e
condicional — veja acima), statusLine, chaves SSH e servidores MCP.

**Instalação por projeto** (`node install.js <pasta>`): use apenas quando o
projeto precisa de uma versão própria de algum agente.

## Subagentes

Cada subagente tem uma única responsabilidade. A sessão principal decide a
arquitetura e integra o resultado; os subagentes executam partes delimitadas.

### Modelo e objetivo

| Agente | Modelo | Esforço | Objetivo |
|---|---|---|---|
| `explorer` | Sonnet | baixo | Entregar um mapa do código antes de qualquer mudança. |
| `worker` | Sonnet | médio | Implementar uma tarefa delimitada, sem sair dos arquivos autorizados. |
| `tester` | Sonnet | baixo | Provar com a saída real dos testes que a mudança funciona. |
| `reviewer` | Opus 5.5 (`claude-opus-5-5`) | médio | Achar defeitos no diff com olhar independente, antes do commit. |
| `ui-reviewer` | Opus 5.5 (`claude-opus-5-5`) | médio | Apontar problemas de uso de uma tela, com arquivo e linha. |
| `researcher` | Sonnet | médio | Confirmar um fato externo, com fonte e data. |
| `entregador` | Sonnet | baixo | Commitar, subir, abrir PR e mergear a pedido do usuário. |
| `ci-triage` | Sonnet | baixo | Dizer por que o CI falhou: job, linha e causa provável. |

### Escopo e uso

| Agente | O que faz | Pode editar? | Quando usar |
|---|---|---|---|
| `explorer` | Localiza onde fica cada coisa, quem chama o quê e qual é o fluxo real. | Não | Antes de alterar código desconhecido ou arquivos muito grandes. |
| `worker` | Implementa dentro de uma lista fechada de arquivos. | Sim | Partes independentes de uma tarefa maior. Dois workers nunca tocam o mesmo arquivo. |
| `tester` | Executa testes e verificações e devolve a saída. | Não | Depois da implementação. |
| `reviewer` | Lê só o diff, sem conhecer o plano. | Não | Antes de commitar mudanças relevantes. |
| `ui-reviewer` | Revisa a tela real: hierarquia, estados, teclado e consistência visual. Usa `impeccable`/`hallmark` quando disponíveis. | Não | Ao criar ou alterar interface. |
| `researcher` | Consulta documentação de APIs, bibliotecas, versões e formatos de arquivo. | Não | Quando a resposta depende de algo fora do repositório. |
| `entregador` | Executa o fluxo de git e GitHub. | Apenas git | Somente quando o usuário pede explicitamente. |
| `ci-triage` | Lê o log de um CI com falha. | Não | Quando o CI falha. |

## Conteúdo do repositório

| Caminho | Conteúdo |
|---|---|
| `agents/` | Definição dos subagentes da tabela acima. |
| `skills/orchestrator/` | Decide entre delegar ou fazer direto; conduz o fluxo explorer → workers → tester → reviewer, com revisão proporcional ao risco, economia de tokens por spawn e a skill certa por etapa. |
| `skills/prova-tela/` | Prova de teclado/DOM em navegador headless sem login: `SKILL.md` + `cdp-lib.js` (Edge/Chrome, servidor estático, stub de `fetch`, `--prints`). |
| `skills/resolving-merge-conflicts/` | Fork do `mattpocock-skills`: triagem mecânica (`?v=`, changelog) antes de ler a intenção de cada lado. |
| `skills/to-spec/` | Fork do `mattpocock-skills`: marca `[NEEDS CLARIFICATION]` e pergunta tudo numa mensagem antes de publicar. |
| `skills/mapping-and-dispatching-issues/` | Pilha de issues → mapa priorizado → sessões/worktrees em paralelo. |
| `skills/pencil-design/` | Desenhar em arquivo `.pen` via MCP do Pencil. |
| `hooks/hook-node-check.js` | Após salvar um arquivo, roda `node --check` ou `py_compile` e bloqueia se houver erro de sintaxe. |
| `hooks/hook-cache-bust.js` | Antes de `git commit`, avisa se um `.js`/`.css` mudou sem atualizar o `?v=`. Só atua em projetos com `scripts/check-cache-bust.sh`. |
| `CLAUDE.snippet.md` | Seções "Higiene de git", "Subagentes" e "Autonomia e pronto", anexadas ao `~/.claude/CLAUDE.md` pelo instalador. |
| `bin/git-faxina.sh` | Remove branches e worktrees cujo PR já foi mergeado. |
| `bin/merge-mecanico.js` | Driver de merge: `?v=` vizinho e changelog `.json` com inserção dos dois lados. Resto do conflito volta com marcador. Prova: `bash test/merge.sh`. |
| `settings.base.json` | Plugins, marketplaces e permissões globais que o instalador une ao `settings.json`. |
| `RTK.md` | Comandos do `rtk`; só é copiado se a máquina já tem o binário. |

## Projetos em JavaScript puro com `?v=`

Copie `hooks/check-cache-bust.sh` para `scripts/` do projeto: o hook global
passa a verificar o `?v=` nesse projeto automaticamente. Para o conflito de
`?v=` entre PRs se resolver sozinho, acrescente ao `.gitattributes` do projeto:

```
*.html merge=mecanico
caminho/do/changelog.json merge=mecanico
```

A prova de tela (`cdp-lib.js`) vem com a skill `prova-tela`, que a copia para
`tests/` na primeira vez.

## Skills de fora

As skills do Matt Pocock (`grilling`, `tdd`, `diagnosing-bugs`, `retro`...)
e `impeccable`/`hallmark` vêm dos repos de origem, não daqui. Clone de repo de
skills fica **fora** de `~/.claude/skills/`: lá dentro o Claude Code descobre as
subpastas de novo com prefixo (`mattpocock-skills:tdd`) e cada skill aparece
duas vezes na listagem de toda sessão. Fork de skill de fora (como `to-spec`)
mora aqui e o instalador sobrescreve a cópia original.

## Como atualizar

Altere primeiro no projeto em que a mudança se provou útil, depois copie para
este repositório e faça o commit. Não há sincronização automática, de propósito:
aqui entra apenas o que já foi validado na prática.
