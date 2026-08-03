$ErrorActionPreference = 'Stop'

$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverPath = Join-Path $PSScriptRoot 'server.mjs'
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'MZALI POS Bridge.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $nodePath
$shortcut.Arguments = '"' + $serverPath + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'MZALI POS local cash drawer bridge'
$shortcut.Save()

$alreadyRunning = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $serverPath + '*')
}

if (-not $alreadyRunning) {
  Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
}

Write-Host 'MZALI POS Bridge est installe et demarre.' -ForegroundColor Green
Write-Host 'Le tiroir utilisera automatiquement l imprimante par defaut Windows.'
