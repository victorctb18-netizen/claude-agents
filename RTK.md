# RTK - Rust Token Killer

Proxy de CLI que economiza token em operação de dev (60-90% em `git`, etc.).
Binário próprio (Rust, open source), não vem neste repo. Repo:
https://github.com/rtk-ai/rtk

## Instalar

```powershell
winget install rtk-ai.rtk          # Windows
```

```bash
brew install rtk                    # macOS
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh   # Linux
```

Depois rode `node claude-agents/install.js --global` de novo — o instalador
deste repo só liga o hook e copia este arquivo se detectar `rtk` no PATH.

## Comandos meta (sempre via rtk direto)

```bash
rtk gain              # Mostra economia de token
rtk gain --history     # Historico de uso com economia
rtk discover           # Analisa historico do Claude Code por oportunidade perdida
rtk proxy <cmd>        # Executa comando cru, sem filtro (debug)
```

## Verificar instalação

```bash
rtk --version          # Deve mostrar: rtk X.Y.Z
rtk gain               # Deve funcionar (nao "command not found")
which rtk               # Confirma o binario certo
```

⚠️ **Colisão de nome**: se `rtk gain` falhar, pode ter outro `rtk` instalado
(reachingforthejack/rtk — Rust Type Kit).

## Uso via hook

O resto dos comandos é reescrito automaticamente pelo hook do Claude Code.
Exemplo: `git status` → `rtk git status` (transparente, 0 token de overhead).
