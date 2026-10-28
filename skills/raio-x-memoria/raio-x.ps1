# Raio-x de memória: só lê, não encerra nada. Junta numa rodada o que custou
# uma sessão inteira de investigação em 28/10/2026 (ver SKILL.md).
$claude = Join-Path $env:USERPROFILE '.claude'
$agora = Get-Date
$todos = Get-Process
$vivos = @{}; $todos | ForEach-Object { $vivos[$_.Id] = $_ }

'== Memória'
$os = Get-CimInstance Win32_OperatingSystem
'RAM {0:N1} GB, livre {1:N1} GB | comprometida {2:N1} GB | pagefile em uso {3} MB' -f ($os.TotalVisibleMemorySize / 1MB),
  ($os.FreePhysicalMemory / 1MB), (($os.TotalVirtualMemorySize - $os.FreeVirtualMemory) / 1MB),
  ((Get-CimInstance Win32_PageFileUsage | Measure-Object CurrentUsage -Sum).Sum)
$wsl = Join-Path $env:USERPROFILE '.wslconfig'
if (Test-Path $wsl) { 'wslconfig: ' + ((Get-Content $wsl | Where-Object { $_ -match '^(memory|swap)=' }) -join ' ') }

''
'== Maiores (memória privada inclui o que foi para o pagefile)'
# Navegador de teste e o do usuário têm o mesmo nome de processo; somados,
# o Edge dos harnesses parecia ser o navegador aberto. Cada filho leva o
# --user-data-dir do pai, então a linha de comando separa os dois.
$cim = Get-CimInstance Win32_Process
$porPid = @{}; $cim | ForEach-Object { $porPid[[int]$_.ProcessId] = $_ }
function DeTeste($c) { $c.Name -in 'msedge.exe', 'chrome.exe' -and ($c.CommandLine -like '*.edge-cdp-*' -or
  ($c.CommandLine -match '--headless' -and $c.CommandLine -match '--remote-debugging')) }
# WebView2 é o navegador embutido de outro programa; o nome sozinho não diz qual.
function DonoWebView($c) {
  while ($c -and $c.Name -eq 'msedgewebview2.exe') { $c = $porPid[[int]$c.ParentProcessId] }
  if ($c) { $c.Name -replace '\.exe$' } else { '?' }
}
$todos | Group-Object { $c = $porPid[$_.Id]
  if ($c -and (DeTeste $c)) { "$($_.ProcessName) (teste)" }
  elseif ($_.ProcessName -eq 'msedgewebview2') { "msedgewebview2 ($(DonoWebView $c))" }
  else { $_.ProcessName } } | ForEach-Object {
  [pscustomobject]@{ Nome = $_.Name; Qtd = $_.Count
    PrivMB = [math]::Round(($_.Group | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)
    RamMB = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) }
} | Sort-Object PrivMB -Descending | Select-Object -First 12 | Format-Table -AutoSize | Out-String -Width 200

'== Sessões do Claude (claude.exe vivo; arquivar no VSCode não encerra)'
Get-ChildItem (Join-Path $claude 'sessions') -Filter *.json -ErrorAction SilentlyContinue | ForEach-Object {
  try { $s = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
  $p = $vivos[[int]$s.pid]
  if (-not $p -or $p.ProcessName -ne 'claude') { return }
  $desde = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$s.statusUpdatedAt).LocalDateTime
  [pscustomobject]@{ Pid = $p.Id; MB = [math]::Round($p.PrivateMemorySize64 / 1MB); Status = $s.status
    ParadaH = [math]::Round(($agora - $desde).TotalHours, 1); Origem = $s.entrypoint; Nome = $s.name }
} | Sort-Object ParadaH -Descending | Format-Table -AutoSize | Out-String -Width 200

'== Navegador de teste (.edge-cdp-* ou headless com depuração); Dono=morto é órfão'
$cim | Where-Object { DeTeste $_ } | ForEach-Object {
  $raiz = $_.CommandLine -notmatch '--type='
  [pscustomobject]@{ Perfil = ($_.CommandLine -replace '.*user-data-dir="?([^" ]+).*', '$1' | Split-Path | Split-Path -Leaf)
    MB = [math]::Round($vivos[[int]$_.ProcessId].WorkingSet64 / 1MB)
    Min = [math]::Round(($agora - $_.CreationDate).TotalMinutes)
    Orfao = $raiz -and -not $vivos[[int]$_.ParentProcessId] }
} | Group-Object Perfil | ForEach-Object {
  [pscustomobject]@{ Origem = $_.Name; Qtd = $_.Count; RamMB = ($_.Group | Measure-Object MB -Sum).Sum
    MaisVelhoMin = ($_.Group | Measure-Object Min -Maximum).Maximum
    Dono = $(if ($_.Group | Where-Object Orfao) { 'morto' } else { 'vivo' }) }
} | Format-Table -AutoSize | Out-String -Width 200

'== Serviço sem janela'
$sync = $vivos.Values | Where-Object ProcessName -eq 'OneDrive.Sync.Service'
if ($sync) {
  'OneDrive.Sync.Service {0} MB, aberto desde {1:dd/MM HH:mm}; OneDrive.exe {2}' -f [math]::Round($sync.PrivateMemorySize64 / 1MB),
    $sync.StartTime, $(if ($vivos.Values | Where-Object ProcessName -eq 'OneDrive') { 'aberto' } else { 'FECHADO (serviço solto)' })
  $pasta = (Get-ItemProperty 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal' -ErrorAction SilentlyContinue).UserFolder
  if ($pasta) {
    'Pastas do OneDrive com mais arquivos (cada arquivo pesa no índice do serviço):'
    Get-ChildItem $pasta -Directory -Force | ForEach-Object { Get-ChildItem $_.FullName -Directory -Force } | ForEach-Object {
      [pscustomobject]@{ Arquivos = (Get-ChildItem $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue).Count; Pasta = $_.FullName.Substring($pasta.Length) }
    } | Sort-Object Arquivos -Descending | Select-Object -First 5 | Format-Table -AutoSize | Out-String -Width 200
  }
}
Get-CimInstance Win32_Service | Where-Object { $_.State -eq 'Running' -and $_.ProcessId -and $vivos[[int]$_.ProcessId].PrivateMemorySize64 -gt 500MB } |
  ForEach-Object { 'Serviço {0} ({1}): {2} MB' -f $_.Name, $vivos[[int]$_.ProcessId].ProcessName, [math]::Round($vivos[[int]$_.ProcessId].PrivateMemorySize64 / 1MB) }

''
'== Checklist (cada ATENCAO tem correção na tabela do SKILL.md)'
function Item($ok, $texto) { '{0}  {1}' -f $(if ($ok) { 'OK     ' } else { 'ATENCAO' }), $texto }
# Sem o SysMain não há compressão: RAM cheia vai direto para o disco. Estava
# desligado aqui por dica de "otimização"; Get-MMAgent exige admin, o
# processo Memory Compression não.
$sysmain = Get-Service SysMain -ErrorAction SilentlyContinue
Item ([bool](Get-Process 'Memory Compression' -ErrorAction SilentlyContinue)) ('compressão de memória (SysMain {0}, {1})' -f $sysmain.Status, $sysmain.StartType)
$dias = ($agora - $os.LastBootUpTime).TotalDays
Item ($dias -lt 7) ('ligado há {0:N1} dias (núcleo acumula; reiniciar por semana)' -f $dias)
$pentes = Get-CimInstance Win32_PhysicalMemory
Item (@($pentes.Capacity | Select-Object -Unique).Count -le 1) ('pentes: {0}' -f (($pentes | ForEach-Object { '{0} GB {1} MHz' -f ($_.Capacity / 1GB), $_.ConfiguredClockSpeed }) -join ' + '))
Item (-not (Get-AppxPackage *WebExperience* -ErrorAction SilentlyContinue)) 'Widgets removidos (Windows Web Experience Pack)'
$chrome = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Local State'
if (Test-Path $chrome) {
  # state 2 = ligada; aggressiveness 1 = equilibrada.
  $hm = (Get-Content $chrome -Raw -Encoding UTF8 | ConvertFrom-Json).performance_tuning.high_efficiency_mode
  Item ($hm.state -eq 2) ('Chrome: economia de memória (state {0}, aggressiveness {1})' -f $hm.state, $hm.aggressiveness)
}
$edge = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
if (Test-Path "$edge\Default\Preferences") {
  # Guias em suspensão vêm ligadas de fábrica; a chave só aparece quando alguém mexe.
  $st = (Get-Content "$edge\Default\Preferences" -Raw -Encoding UTF8 | ConvertFrom-Json).edge.sleeping_tabs
  $ef = (Get-Content "$edge\Local State" -Raw -Encoding UTF8 | ConvertFrom-Json).edge.perf_center.efficiency_mode_v2_is_active
  Item ($st.enabled -ne $false) ('Edge: guias em suspensão ({0}, após {1} min; modo de eficiência {2})' -f
    $(if ($st.enabled -ne $false) { 'ligadas' } else { 'DESLIGADAS' }), $(if ($st.threshold) { $st.threshold / 60 } else { '?' }),
    $(if ($ef) { 'ligado' } else { 'desligado' }))
}
$warsaw = Get-Service 'Warsaw Technology' -ErrorAction SilentlyContinue
Item (-not $warsaw) ('Warsaw {0} (~1,3 GB rodando; desinstalar é decisão do usuário, banco pede para reinstalar)' -f $(if ($warsaw) { "instalado, $($warsaw.Status)" } else { 'ausente' }))
$odTarefas = @(Get-ScheduledTask -TaskName 'OneDrive*' -ErrorAction SilentlyContinue | Where-Object State -ne 'Disabled').Count
Item (-not $sync -or ($vivos.Values | Where-Object ProcessName -eq 'OneDrive')) ('OneDrive sem serviço solto ({0} tarefas agendadas ativas; desligar é decisão do usuário)' -f $odTarefas)

''
'== Faxina agendada'
$t = Get-ScheduledTask -TaskName 'Claude faxina de memoria' -ErrorAction SilentlyContinue
if ($t) { $i = $t | Get-ScheduledTaskInfo; 'estado {0}, última {1:dd/MM HH:mm}, próxima {2:dd/MM HH:mm}' -f $t.State, $i.LastRunTime, $i.NextRunTime }
else { 'NÃO instalada (comando na tabela do SKILL.md)' }
$log = Join-Path $claude 'faxina-memoria.log'
if (Test-Path $log) { Get-Content $log -Encoding UTF8 -Tail 5 | ForEach-Object { $_.Substring(0, [math]::Min(110, $_.Length)) } }
