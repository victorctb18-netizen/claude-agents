# Devolve a RAM que sobra de sessão encerrada. Duas fontes de vazamento,
# medidas em 28/10/2026 numa máquina de 11,6 GB com 0,2 GB livres:
#
# - Arquivar ou fechar a sessão no VSCode não encerra o claude.exe dela
#   (~600 MB cada). Eram 24 processos para ~10 sessões visíveis, 13 delas já
#   marcadas "OK -".
# - Harness .cdp.js que morre de SIGKILL deixa o Edge headless vivo. A
#   varredura do cdp-lib.js acha o órfão pela pasta .edge-cdp-*, e a pasta some
#   junto com a worktree no `git faxina --apaga`: eram 34 navegadores de
#   worktrees que já não existiam, alguns com 6 dias.
#
# Roda pelo Agendador de Tarefas (install.js registra). -Simular só lista.
param([switch]$Simular)

$agora = Get-Date
$claude = Join-Path $env:USERPROFILE '.claude'
$mortos = @()

# Sessão: só a do VSCode (a do terminal o usuário fecha vendo) e só ociosa.
# Encerrar não perde nada: o transcript fica, e abrir a sessão de novo no
# VSCode sobe outro claude.exe com --resume. Nome de sessão terminada (marcado
# à mão "OK -" ou pelo hook-status-sessao) sai em 30 min; o resto, em 6 h.
$terminada = '^(OK -|FEITO|FECHADO|✅|⚪)'
foreach ($f in Get-ChildItem (Join-Path $claude 'sessions') -Filter *.json -ErrorAction SilentlyContinue) {
  try { $s = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
  # PID reaproveitado pelo Windows: o arquivo fica, o processo é outro.
  $p = Get-Process -Id $s.pid -ErrorAction SilentlyContinue
  if (-not $p -or $p.ProcessName -ne 'claude') { continue }
  if ($s.entrypoint -ne 'claude-vscode' -or $s.status -ne 'idle') { continue }
  $limite = if ($s.name -match $terminada) { 30 } else { 360 }
  $parada = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$s.statusUpdatedAt).LocalDateTime
  # O status nem sempre acompanha o turno; o transcript é a prova de atividade.
  $t = Get-ChildItem (Join-Path $claude 'projects') -Recurse -Depth 1 -Filter "$($s.sessionId).jsonl" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($t -and $t.LastWriteTime -gt $parada) { $parada = $t.LastWriteTime }
  if (($agora - $parada).TotalMinutes -lt $limite) { continue }
  $mortos += [pscustomobject]@{ Tipo = 'sessao'; Pid = $p.Id; MB = [math]::Round($p.PrivateMemorySize64 / 1MB); Nome = $s.name }
}

# Edge/Chrome de harness: órfão é o navegador raiz (sem --type=) cujo node
# já morreu, ou qualquer um vivo há mais de 25 min (o cdp-lib.js derruba todo
# harness em 20 min). Só a idade deixava um harness morto segurar ~2 GB por
# quase uma hora. Os filhos do raiz órfão saem pela árvore, no taskkill /T.
$limiteEdge = $agora.AddMinutes(-25)
$vivos = @{}; Get-Process | ForEach-Object { $vivos[$_.Id] = $true }
# Headless com porta de depuração entra junto: sessão que abre Chrome à mão
# para dividir entre harnesses (perfil em Temp\tmp.*) nunca o fecha; em
# 28/10 eram 7, ~2 GB. O navegador do usuário nunca é headless.
$navegadores = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*.edge-cdp-*' -or ($_.CommandLine -match '--headless' -and $_.CommandLine -match '--remote-debugging') }
$orfaos = $navegadores | Where-Object { $_.CommandLine -notmatch '--type=' -and -not $vivos[[int]$_.ParentProcessId] }
$navegadores |
  Where-Object { $_.CreationDate -lt $limiteEdge -or $orfaos.ProcessId -contains $_.ProcessId -or $orfaos.ProcessId -contains $_.ParentProcessId } |
  ForEach-Object {
    $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
    if ($p) { $mortos += [pscustomobject]@{ Tipo = 'edge'; Pid = $p.Id; MB = [math]::Round($p.PrivateMemorySize64 / 1MB); Nome = '' } }
  }

if ($Simular) { $mortos | Format-Table -AutoSize | Out-String -Width 200; exit 0 }
if (-not $mortos) { exit 0 }

$mortos | ForEach-Object { taskkill /PID $_.Pid /T /F 2>&1 | Out-Null }
$resumo = $mortos | Group-Object Tipo | ForEach-Object {
  '{0}: {1} ({2:N1} GB)' -f $_.Name, $_.Count, (($_.Group | Measure-Object MB -Sum).Sum / 1KB)
}
$nomes = ($mortos | Where-Object Nome | ForEach-Object Nome) -join ' | '
Add-Content -Path (Join-Path $claude 'faxina-memoria.log') -Encoding UTF8 -Value (
  '{0:dd/MM HH:mm} {1}{2}' -f $agora, ($resumo -join ', '), $(if ($nomes) { "  [$nomes]" }))
