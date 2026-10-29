---
name: raio-x-memoria
description: Diagnóstico de RAM no Windows, do que pesa e por quê, com a correção de cada causa. Use quando o usuário reclama de PC lento, travando, memória cheia, "gargalo de RAM", ou pede para ver o que consome memória.
---

# Raio-x de memória

Só Windows. Rode o `raio-x.ps1` desta pasta (só lê, não encerra nada), com o caminho da pasta da skill: ela pode estar em `~/.claude/skills`, no cache de plugins ou no `.claude/skills` do projeto, conforme a instalação.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<pasta desta skill>\raio-x.ps1"
```

Passe por **todas** as seções, inclusive o Checklist: cada ATENCAO vira uma linha na resposta, com a correção da tabela abaixo. Item que é decisão do usuário (Warsaw, OneDrive, upgrade) se apresenta com prós e contras, nunca se aplica por conta própria.

Leia **memória privada**, não só a RAM do Gerenciador de Tarefas: processo parado vai para o pagefile e some da coluna de RAM, mas continua pesando quando volta.

## Causas já vistas e a correção

| Sinal no raio-x | Causa | Correção |
|---|---|---|
| Mais `claude.exe` do que sessões visíveis no VSCode; nomes "OK -", FEITO, FECHADO | Arquivar ou fechar a sessão não encerra o processo (~600 MB cada) | A faxina agendada encerra (poupa a sessão com shell vivo: tarefa em background, Monitor, dev server) (linha "Faxina agendada" abaixo). Sessão encerrada reabre com o histórico; a 1ª mensagem depois pode se perder, é só reenviar |
| Navegador de teste com `Dono=morto` ou mais de 25 min | Harness `.cdp.js` morto; a varredura do `cdp-lib.js` procura pela pasta, que some com a worktree | Mesma faxina. `Dono=vivo` é teste de outra sessão rodando: não mexa |
| Origem `tmp.*` (Chrome headless com perfil em `Temp`) | Sessão abriu um Chrome à mão para dividir entre harnesses e nunca fechou | Mesma faxina, aos 25 min |
| Mais de 500 MB em `SearchIndexer` | Indexação do Windows varrendo pasta de código (worktrees, `node_modules`) | Opções de Indexação → Modificar → desmarcar `Documents\VSCode` |
| `OneDrive.Sync.Service` com GB e `OneDrive.exe` FECHADO | Serviço ficou solto; o índice cresce com o número de arquivos | `taskkill /IM OneDrive.Sync.Service.exe /F`. Pasta com dezenas de milhares de arquivos (jogo, `node_modules`): tirar do OneDrive. Para não voltar: desabilitar em Aplicativos de inicialização e `Get-ScheduledTask -TaskName "OneDrive*" \| Disable-ScheduledTask` |
| Serviço `Warsaw Technology` (`core.exe`) ~1,3 GB | Módulo de segurança de banco; recusa mudar para Manual até como administrador | Desinstalar e reinstalar quando o banco pedir, se o uso for raro |
| Muitas sessões Claude todas ativas | Trabalho real, ~650 MB cada + Edge dos testes | Sessões ao mesmo tempo: no máximo (RAM livre depois do boot) / 1 GB; em 12 GB, umas 4 |
| Faxina agendada: NÃO instalada | Instalação só da skill (plugin ou `npx skills`); `node install.js --global` do claude-agents já instala | Usuário cola num PowerShell: `New-Item -ItemType Directory -Force $HOME\bin; Copy-Item "<pasta desta skill>\faxina-memoria.ps1" $HOME\bin\ -Force; schtasks /Create /F /TN "Claude faxina de memoria" /SC MINUTE /MO 10 /TR "conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HOME\bin\faxina-memoria.ps1"`. Copia para `~/bin` porque a pasta do plugin muda a cada versão. Antes, `faxina-memoria.ps1 -Simular` lista o que seria encerrado |
| Checklist: compressão de memória ATENCAO | Serviço SysMain desativado (dica de "otimização"); RAM cheia vai direto para o disco, tela congela ao trocar de janela | Em SSD, religar. PowerShell **elevado** (sem UAC dá "Acesso negado" mesmo sendo admin): `Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command','Set-Service SysMain -StartupType Automatic; Start-Service SysMain; Enable-MMAgent -MemoryCompression; Get-MMAgent \| Select MemoryCompression'` e reiniciar |
| Checklist: ligado há 7+ dias | Núcleo acumula (pool paginado passou de 1,3 GB em 7 dias) | Reiniciar |
| Checklist: pentes de tamanhos diferentes | Dual channel parcial e o pente mais rápido cai para a velocidade do mais lento | Upgrade para 2 pentes iguais (2x16 GB) |
| Checklist: Widgets | Web Experience Pack segue rodando (~250 MB) mesmo com Widgets desligado na barra | `Get-AppxPackage *WebExperience* \| Remove-AppxPackage` (volta pela Microsoft Store) |
| Checklist: Chrome economia de memória | Abas paradas seguem carregadas; conversa longa de ChatGPT/Claude web passa de 600 MB | `chrome://settings/performance` → Economia de memória, Equilibrada; em "Sempre manter ativos" os sites que não podem parar (mensageiro, hub). Shift+Esc no Chrome mostra memória por aba |
| Checklist: Edge guias em suspensão DESLIGADAS | Abas paradas do Edge seguem carregadas, como no Chrome sem economia | `edge://settings/system` → Otimizar desempenho → Guias em suspensão ligadas, 5 min |
| `msedge (teste)` em Maiores | Edge/Chrome dos harnesses, separado do navegador do usuário | Ver a seção Navegador de teste: `Dono=morto` é órfão, `vivo` não se mexe |
| `msedgewebview2 (<programa>)` | Navegador embutido do programa entre parênteses (SearchHost = busca do Iniciar, OUTLOOK, Teams) | Pesa com o programa; fechar ou desligar o programa, não o WebView2 |
| `.wslconfig` com `memory=` alto e Docker ligado | VM do WSL reserva o teto | Desligar o Docker Desktop quando não usar |

## Limites do agente

O classificador do auto mode barra o agente de encerrar processo de outra sessão e de criar tarefa agendada. Entregue o comando pronto para o usuário colar num PowerShell; não tente contornar.
