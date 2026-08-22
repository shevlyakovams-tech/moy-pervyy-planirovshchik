$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:APP_DATA_ROOT = if ($env:UTRENNIY_TEST_PROFILE) { [System.IO.Path]::GetFullPath($env:UTRENNIY_TEST_PROFILE) } else { Join-Path $root "tmp\final-setup-profile" }
$nodeExecutable = if ($env:UTRENNIY_TEST_NODE_PATH) { $env:UTRENNIY_TEST_NODE_PATH } else { (Get-Command node -ErrorAction Stop).Source }
$env:UTRENNIY_NODE_PATH = $nodeExecutable
$env:UTRENNIY_TEST_MODE = "1"
$env:UTRENNIY_TEST_EXIT_AFTER_HEALTH = "6000"
$nodeBin = Split-Path -Parent $nodeExecutable
$env:PATH = "$nodeBin;$env:PATH"

function Wait-Health {
  param([int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:3210/api/health" -TimeoutSec 1
      if ($health.status -eq "ok" -and $health.appVersion -eq "0.1.0" -and $health.schemaVersion -eq 3) { return }
    } catch { Start-Sleep -Milliseconds 200 }
  }
  throw "start.bat health-check timeout"
}

function Test-PortOpen {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect("127.0.0.1", 3210); return $true } catch { return $false } finally { $client.Dispose() }
}

Push-Location $root
try {
  cmd /d /c start.bat
  if ($LASTEXITCODE -ne 0) { throw "First start.bat failed" }
  Wait-Health -TimeoutSeconds 15
  cmd /d /c start.bat
  if ($LASTEXITCODE -ne 0) { throw "Second start.bat failed" }
  Wait-Health -TimeoutSeconds 3
  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline -and (Test-PortOpen)) { Start-Sleep -Milliseconds 250 }
  if (Test-PortOpen) { throw "Electron did not stop its known server during test exit" }
  Write-Output "start.bat offline launch, repeated launch, health and server shutdown verified."
} finally { Pop-Location }
