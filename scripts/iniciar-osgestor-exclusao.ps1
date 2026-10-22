[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedCommit,
  [switch]$CheckOnly,
  [string]$CredentialFile = 'C:\Users\User\Documents\osgestor\.env'
)

$ErrorActionPreference = 'Stop'
$RealRoot = 'C:\Users\User\Documents\osgestor'
$FrontendRoot = Join-Path $RealRoot 'frontend'
$LogRoot = 'C:\Users\User\Documents\osgestor-logs'
$BackendPort = 3000
$FrontendPort = 5173
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
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | ForEach-Object {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    [pscustomobject]@{ Port=$Port; ProcessId=$_.OwningProcess; ExecutablePath=$process.ExecutablePath; CommandLine=$process.CommandLine }
  })
}

if (-not (Test-Path -LiteralPath $RealRoot -PathType Container)) { Stop-WithError "worktree ausente: $RealRoot" }
if (-not (Test-Path -LiteralPath $FrontendRoot -PathType Container)) { Stop-WithError "frontend ausente: $FrontendRoot" }
if (-not (Test-Path -LiteralPath $Node -PathType Leaf)) { Stop-WithError "Node.js ausente: $Node" }
if (-not (Test-Path -LiteralPath $Npm -PathType Leaf)) { Stop-WithError "npm ausente: $Npm" }
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$RunLog = Join-Path $LogRoot ("startup-exclusao-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-RunLog "START worktree=$RealRoot expectedCommit=$ExpectedCommit checkOnly=$CheckOnly"

$actualCommit = (& git -C $RealRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $ExpectedCommit) { Stop-WithError "commit incorreto: $actualCommit. Esperado: $ExpectedCommit" }
if ((git -C $RealRoot status --porcelain)) { Stop-WithError 'worktree não está limpo; publique uma versão commitada antes de iniciar.' }
Write-RunLog "COMMIT_OK $actualCommit"

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
$badBackend=$backendOwners|Where-Object{$_.CommandLine -notlike "*$RealRoot*" -or $_.CommandLine -notmatch 'src[\\/]server\.ts'}; $badFrontend=$frontendOwners|Where-Object{$_.CommandLine -notlike "*$FrontendRoot*" -or $_.CommandLine -notmatch 'vite'}
if($badBackend){Stop-WithError 'porta 3000 ocupada por processo incompatível; nenhum processo foi encerrado.'}; if($badFrontend){Stop-WithError 'porta 5173 ocupada por processo incompatível; nenhum processo foi encerrado.'}
if($CheckOnly){Write-RunLog 'CHECK_ONLY_OK';Write-Output 'CHECK-ONLY concluído.';exit 0}

$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $backendLog=Join-Path $LogRoot "backend-exclusao-$stamp.log"; $backendErr=Join-Path $LogRoot "backend-exclusao-$stamp.err.log"; $frontendLog=Join-Path $LogRoot "frontend-exclusao-$stamp.log"; $frontendErr=Join-Path $LogRoot "frontend-exclusao-$stamp.err.log"
if($backendOwners.Count -eq 0){Start-Process -FilePath $Npm -ArgumentList @('run','dev') -WorkingDirectory $RealRoot -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr|Out-Null;Write-RunLog "BACKEND_START log=$backendLog";Start-Sleep 3}
try{$h=Invoke-WebRequest -UseBasicParsing http://localhost:3000/health -TimeoutSec 10;if($h.StatusCode-ne 200){Stop-WithError 'backend não respondeu HTTP 200.'}}catch{Stop-WithError 'backend não respondeu em /health.'}
if($frontendOwners.Count -eq 0){Start-Process -FilePath $Npm -ArgumentList @('run','dev','--','--host','0.0.0.0') -WorkingDirectory $FrontendRoot -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr|Out-Null;Write-RunLog "FRONTEND_START log=$frontendLog";Start-Sleep 3}
try{$f=Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 10;if($f.StatusCode-ne 200){Stop-WithError 'frontend não respondeu HTTP 200.'}}catch{Stop-WithError 'frontend não respondeu em localhost:5173.'}
Write-RunLog 'START_OK backend=3000 frontend=5173';Write-Output "OS Gestor com exclusão iniciado. Logs: $LogRoot"
