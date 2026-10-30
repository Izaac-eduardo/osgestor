[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedCommit = '',
  [switch]$Daily,
  [switch]$CheckOnly,
  [string]$CredentialFile = 'C:\Users\User\Documents\osgestor\.env',
  [ValidateRange(5,300)]
  [int]$BackendTimeoutSec = 60,
  [ValidateRange(5,300)]
  [int]$FrontendTimeoutSec = 60,
  [ValidateRange(1,10)]
  [int]$PollIntervalSec = 1
)

$ErrorActionPreference = 'Stop'
$RealRoot = 'C:\Users\User\Documents\osgestor'
$FrontendRoot = Join-Path $RealRoot 'frontend'
$LogRoot = 'C:\Users\User\Documents\osgestor-logs'
$BackendPort = 3000
$FrontendPort = 5173
$BackendHealthUrl = 'http://127.0.0.1:3000/health'
$FrontendHealthUrl = 'http://127.0.0.1:5173/'
$Node = 'C:\Program Files\nodejs\node.exe'
$Npm = 'C:\Program Files\nodejs\npm.cmd'
$RunLog = $null

function Write-RunLog([string]$Message) {
  if ($RunLog) { Add-Content -LiteralPath $RunLog -Value ("{0} {1}" -f (Get-Date -Format 's'), $Message) }
}

function Stop-WithError([string]$Message) {
  Write-RunLog "FAIL: $Message"
  throw "OS Gestor com exclusão não iniciado: $Message"
}

function Format-PortOwners($Owners) {
  if (-not $Owners -or $Owners.Count -eq 0) { return 'nenhum processo identificado' }
  return (($Owners | ForEach-Object { "PID=$($_.ProcessId) Path=$($_.ExecutablePath) CommandLine=$($_.CommandLine)" }) -join ' | ')
}

function Read-EnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Stop-WithError "arquivo de credenciais não encontrado: $Path" }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}

function Get-PortOwners([int]$Port) {
  $seen = @{}
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | ForEach-Object {
    if ($seen.ContainsKey($_.OwningProcess)) { return }
    $seen[$_.OwningProcess] = $true
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    [pscustomobject]@{ Port=$Port; ProcessId=$_.OwningProcess; ExecutablePath=$process.ExecutablePath; CommandLine=$process.CommandLine }
  })
}

function Test-OfficialBackendProcess($Owner) {
  if (-not $Owner.CommandLine) { return $false }
  return $Owner.CommandLine.IndexOf($RealRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $Owner.CommandLine -match '(?i)(^|[\\/ ])src[\\/]server\.ts([" ]|$)'
}

function Test-OfficialFrontendProcess($Owner) {
  if (-not $Owner.CommandLine) { return $false }
  return $Owner.CommandLine.IndexOf($FrontendRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $Owner.CommandLine -match '(?i)(^|[\\/])vite([\\/]|[.]js)'
}

function Wait-BackendReady([int]$TimeoutSec, [string]$LogPath, [string]$ErrorLogPath) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastError = 'nenhuma resposta recebida'
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $BackendHealthUrl -TimeoutSec ([Math]::Max(1, [Math]::Min(5, $PollIntervalSec + 1)))
      $payload = $response.Content | ConvertFrom-Json
      if ($response.StatusCode -eq 200 -and $payload.status -eq 'ok') {
        return $true
      }
      $lastError = "resposta inválida (HTTP $($response.StatusCode)): $($response.Content)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds $PollIntervalSec
  } while ((Get-Date) -lt $deadline)

  $owners = @(Get-PortOwners $BackendPort)
  $processState = if ($owners.Count -gt 0) { Format-PortOwners $owners } else { 'nenhum processo escutando na porta 3000' }
  Stop-WithError "backend não ficou pronto em ${TimeoutSec}s; última tentativa: $lastError; processos: $processState; logs: $LogPath e $ErrorLogPath"
}

function Wait-FrontendReady([int]$TimeoutSec, [string]$LogPath, [string]$ErrorLogPath) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastError = 'nenhuma resposta recebida'
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $FrontendHealthUrl -TimeoutSec ([Math]::Max(1, [Math]::Min(5, $PollIntervalSec + 1)))
      if ($response.StatusCode -eq 200 -and $response.Content.Length -gt 0) { return $true }
      $lastError = "resposta inválida (HTTP $($response.StatusCode))"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds $PollIntervalSec
  } while ((Get-Date) -lt $deadline)

  $owners = @(Get-PortOwners $FrontendPort)
  $processState = if ($owners.Count -gt 0) { Format-PortOwners $owners } else { 'nenhum processo escutando na porta 5173' }
  Stop-WithError "frontend não ficou pronto em ${TimeoutSec}s; última tentativa: $lastError; processos: $processState; logs: $LogPath e $ErrorLogPath"
}

if (-not (Test-Path -LiteralPath $RealRoot -PathType Container)) { Stop-WithError "worktree ausente: $RealRoot" }
if (-not (Test-Path -LiteralPath $FrontendRoot -PathType Container)) { Stop-WithError "frontend ausente: $FrontendRoot" }
if (-not (Test-Path -LiteralPath $Node -PathType Leaf)) { Stop-WithError "Node.js ausente: $Node" }
if (-not (Test-Path -LiteralPath $Npm -PathType Leaf)) { Stop-WithError "npm ausente: $Npm" }
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$RunLog = Join-Path $LogRoot ("startup-exclusao-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-RunLog "START worktree=$RealRoot expectedCommit=$ExpectedCommit daily=$Daily checkOnly=$CheckOnly"

if (-not $Daily) {
  if ([string]::IsNullOrWhiteSpace($ExpectedCommit)) { Stop-WithError 'ExpectedCommit obrigatorio fora do modo diario.' }
  $actualCommit = (& git -C $RealRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $ExpectedCommit) { Stop-WithError "commit incorreto: $actualCommit. Esperado: $ExpectedCommit" }
if ((& git -C $RealRoot branch --show-current).Trim() -ne 'main') { Stop-WithError 'branch incorreta; a inicialização exige a branch main.' }
if ((git -C $RealRoot status --porcelain)) { Stop-WithError 'worktree não está limpo; publique uma versão commitada antes de iniciar.' }
  Write-RunLog "COMMIT_OK $actualCommit"
} else {
  Write-RunLog 'DAILY_MODE git validation skipped'
}

$viteConfig = Get-Content -Raw -LiteralPath (Join-Path $FrontendRoot 'vite.config.ts')
if ($viteConfig -notmatch "host:\s*'0\.0\.0\.0'" -or $viteConfig -notmatch "port:\s*5173" -or $viteConfig -notmatch "'/abastecimento':\s*'http://localhost:3000'") { Stop-WithError 'proxy/host/porta do frontend não confirmados.' }

$sourceFiles = Get-ChildItem -LiteralPath (Join-Path $RealRoot 'src') -Recurse -File -Include *.ts,*.tsx
if (-not ($sourceFiles | Select-String -Pattern 'excluido_at|excluido_por|motivo_exclusao')) { Stop-WithError 'backend não contém a implementação de exclusão lógica esperada.' }

$envValues = Read-EnvFile $CredentialFile
if ($envValues['DB_NAME'] -ne 'oficina') { Stop-WithError 'DB_NAME não é oficina.' }
if ([string]::IsNullOrWhiteSpace($envValues['DB_PASSWORD'])) { Stop-WithError 'DB_PASSWORD não está definido.' }
$env:PORT='3000'; $env:DB_HOST=if($envValues['DB_HOST']){$envValues['DB_HOST']}else{'localhost'}; $env:DB_PORT=if($envValues['DB_PORT']){$envValues['DB_PORT']}else{'5432'}; $env:DB_NAME='oficina'; $env:DB_USER=if($envValues['DB_USER']){$envValues['DB_USER']}else{'postgres'}; $env:DB_PASSWORD=$envValues['DB_PASSWORD']; $env:CORS_ORIGINS='http://localhost:5173,http://192.168.53.100:5173'

& $Node (Join-Path $RealRoot 'scripts\validar-schema-exclusao.mjs')
if ($LASTEXITCODE -ne 0) { Stop-WithError 'schema 034/035 incompatível ou banco incorreto.' }
Write-RunLog 'DATABASE_OK database=oficina schema=034+035'

$backendOwners=@(Get-PortOwners $BackendPort); $frontendOwners=@(Get-PortOwners $FrontendPort)
Write-RunLog ("PORT_3000 owners=" + (($backendOwners|ForEach-Object{$_.ProcessId}) -join ',')); Write-RunLog ("PORT_5173 owners=" + (($frontendOwners|ForEach-Object{$_.ProcessId}) -join ','))
$badBackend=@($backendOwners|Where-Object{ -not (Test-OfficialBackendProcess $_) }); $badFrontend=@($frontendOwners|Where-Object{ -not (Test-OfficialFrontendProcess $_) })
if($badBackend){Stop-WithError "porta 3000 ocupada por processo incompatível ou não identificado; nenhum processo foi encerrado. $((Format-PortOwners $badBackend))"}; if($badFrontend){Stop-WithError "porta 5173 ocupada por processo incompatível ou não identificado; nenhum processo foi encerrado. $((Format-PortOwners $badFrontend))"}
if($CheckOnly){Write-RunLog 'CHECK_ONLY_OK';Write-Output 'CHECK-ONLY concluído.';exit 0}

$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $backendLog=Join-Path $LogRoot "backend-exclusao-$stamp.log"; $backendErr=Join-Path $LogRoot "backend-exclusao-$stamp.err.log"; $frontendLog=Join-Path $LogRoot "frontend-exclusao-$stamp.log"; $frontendErr=Join-Path $LogRoot "frontend-exclusao-$stamp.err.log"
Write-Output '[1/5] Validações de Git, diretório e segurança concluídas.'
Write-Output '[2/5] Validação do banco de dados concluída.'
Write-Output '[3/5] Verificando backend...'
if($backendOwners.Count -eq 0){Start-Process -FilePath $Npm -ArgumentList @('run','dev') -WorkingDirectory $RealRoot -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr|Out-Null;Write-RunLog "BACKEND_START log=$backendLog";Write-Output 'Backend iniciado; aguardando /health...'} else {Write-Output 'Backend oficial já está em execução; reutilizando-o.'}
$null = Wait-BackendReady -TimeoutSec $BackendTimeoutSec -LogPath $backendLog -ErrorLogPath $backendErr
Write-Output 'Backend respondendo com conteúdo válido.'
Write-Output '[4/5] Verificando frontend...'
if($frontendOwners.Count -eq 0){Start-Process -FilePath $Npm -ArgumentList @('run','dev','--','--host','0.0.0.0') -WorkingDirectory $FrontendRoot -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr|Out-Null;Write-RunLog "FRONTEND_START log=$frontendLog";Write-Output 'Frontend iniciado; aguardando HTTP...'} else {Write-Output 'Frontend oficial já está em execução; reutilizando-o.'}
$null = Wait-FrontendReady -TimeoutSec $FrontendTimeoutSec -LogPath $frontendLog -ErrorLogPath $frontendErr
Write-Output 'Frontend respondendo.'
Write-Output '[5/5] Verificação final...'
Write-RunLog 'START_OK backend=3000 frontend=5173';Write-Output 'START_OK';Write-Output "OS Gestor disponível em: http://localhost:5173`nLogs: $LogRoot"
