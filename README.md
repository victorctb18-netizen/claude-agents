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

- os agentes, a skill `orchestrator`, os hooks e o trecho de `CLAUDE.md`;
- os plugins e marketplaces listados em `settings.base.json`: `caveman`,
  `ponytail`, `i-have-adhd`, `impeccable`, `frontend-design`, `superpowers`
  (traz as skills do Matt Pocock junto), `code-review`, `claude-md-management`,
  `security-guidance`, `code-simplifier`, `claude-code-setup`, `ui-ux-pro-max`,
  `playwright` e `skill-creator`;
- os modos caveman, ponytail e adhd, ativos por padrão;
- o script `~/bin/git-faxina.sh` e o alias `git faxina`;
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
mantém desligado qualquer plugin que você tenha desativado. O teste
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
| `skills/orchestrator/` | Decide entre delegar ou fazer direto; conduz o fluxo explorer → workers → tester → reviewer, com revisão proporcional ao risco. |
| `hooks/hook-node-check.js` | Após salvar um arquivo, roda `node --check` ou `py_compile` e bloqueia se houver erro de sintaxe. |
| `hooks/hook-cache-bust.js` | Antes de `git commit`, avisa se um `.js`/`.css` mudou sem atualizar o `?v=`. Só atua em projetos com `scripts/check-cache-bust.sh`. |
| `lib/cdp-lib.js` | Harness de navegador sem dependências (Edge/Chrome headless, servidor estático, stub de `fetch`) para testes de teclado e DOM. |
| `CLAUDE.snippet.md` | Seções "Subagentes" e "Autonomia e pronto", anexadas ao `~/.claude/CLAUDE.md` pelo instalador. |
| `bin/git-faxina.sh` | Remove branches e worktrees cujo PR já foi mergeado. |
| `settings.base.json` | Plugins, marketplaces e permissões globais que o instalador une ao `settings.json`. |
| `RTK.md` | Comandos do `rtk`; só é copiado se a máquina já tem o binário. |

## Projetos em JavaScript puro com `?v=`

Copie `hooks/check-cache-bust.sh` para `scripts/` do projeto e `lib/cdp-lib.js`
para `tests/`. O hook global passa a verificar o `?v=` nesse projeto
automaticamente.

## Como atualizar

Altere primeiro no projeto em que a mudança se provou útil, depois copie para
este repositório e faça o commit. Não há sincronização automática, de propósito:
aqui entra apenas o que já foi validado na prática.
