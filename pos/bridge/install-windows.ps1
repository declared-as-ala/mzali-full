$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $nodeCandidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )
  $nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $nodePath) {
    throw 'Node.js est absent. Installez Node.js LTS puis relancez INSTALL-ON-POS-PC.cmd.'
  }
} else {
  $nodePath = $nodeCommand.Source
}

$installFolder = Join-Path $env:LOCALAPPDATA 'MZALI POS Bridge'
New-Item -ItemType Directory -Path $installFolder -Force | Out-Null

$bridgeFiles = @('server.mjs', 'drawer.mjs', 'display.mjs', 'dedupe.mjs')
foreach ($bridgeFile in $bridgeFiles) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $bridgeFile) -Destination (Join-Path $installFolder $bridgeFile) -Force
}

$serverPath = Join-Path $installFolder 'server.mjs'
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'MZALI POS Bridge.lnk'

# This boutique's customer display is exposed by Windows as COM1. Persist the
# detected assignment so other serial devices can never be selected instead.
$serialMap = Get-ItemProperty 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction SilentlyContinue
$hasCom1 = $serialMap -and ($serialMap.PSObject.Properties.Value -contains 'COM1')
if ($hasCom1) {
  [Environment]::SetEnvironmentVariable('POS_VFD_COM_PORT', 'COM1', 'User')
  $env:POS_VFD_COM_PORT = 'COM1'
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $nodePath
$shortcut.Arguments = '"' + $serverPath + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'MZALI POS local cash drawer bridge'
$shortcut.Save()

$bridgeProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and (
    $_.CommandLine -like ('*' + $serverPath + '*') -or
    $_.CommandLine -like '*\pos\bridge\server.mjs*'
  )
}

foreach ($bridgeProcess in $bridgeProcesses) {
  Stop-Process -Id $bridgeProcess.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $installFolder -WindowStyle Hidden
Start-Sleep -Seconds 1

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:17890/v1/health' -TimeoutSec 10
if (-not $health.ok) {
  throw 'Le service local a demarre mais son controle de sante a echoue.'
}

Write-Host 'MZALI POS Bridge est installe et demarre automatiquement.' -ForegroundColor Green
if ($health.drawerPort) {
  Write-Host ('Tiroir USB detecte sur ' + $health.drawerPort + '.') -ForegroundColor Green
} else {
  Write-Warning 'Service actif, mais tiroir USB non detecte. Verifiez le cable USB du tiroir.'
}
if ($health.vfdPort) {
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:17890/v1/display/test' -ContentType 'application/json' -Body '{}' -TimeoutSec 10 | Out-Null
  Write-Host ('Afficheur client detecte sur ' + $health.vfdPort + '.') -ForegroundColor Green
  Write-Host 'L afficheur doit maintenant indiquer MZALI POS / CAISSE PRETE.' -ForegroundColor Green
}
