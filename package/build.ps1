# ============================================================
#  KasabiPOS Windows installer builder (Inno Setup)
#  Produces package\dist\KasabiPOS-Setup-<version>.exe
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File package\build.ps1 `
#      [-Version 1.0.0] [-Port 3000] [-SkipClientBuild] [-SkipInnoInstall]
#
#  -SkipInnoInstall  fail instead of downloading/installing Inno Setup 6
# ============================================================
[CmdletBinding()]
param(
  [string]$Version = "1.0.0",
  [int]$Port = 3000,
  [switch]$SkipClientBuild,
  [switch]$SkipInnoInstall
)

$ErrorActionPreference = "Stop"

$Pkg = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Pkg
$Cache = Join-Path $Pkg "cache"
$Stage = Join-Path $Pkg "build\stage"
$Out = Join-Path $Pkg "dist"
$IsccCandidates = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe",
  (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
)

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail {
  param([string]$Message)
  Write-Host ""
  Write-Host "FAILED: $Message" -ForegroundColor Red
  exit 1
}

# --------------------------------------------------------------- Inno Setup --

function Resolve-Iscc {
  foreach ($c in $IsccCandidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  $found = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }

  if ($SkipInnoInstall) {
    Fail "ISCC.exe not found. Install Inno Setup 6 or drop -SkipInnoInstall."
  }

  Write-Step "Inno Setup 6 not found -- downloading and installing it silently"
  New-Item -ItemType Directory -Path $Cache -Force | Out-Null
  $installer = Join-Path $Cache "innosetup-6.7.3.exe"
  if (-not (Test-Path -LiteralPath $installer)) {
    $url = "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe"
    Write-Host "Downloading $url"
    & curl.exe -L -sS --retry 3 -o $installer $url
    if ($LASTEXITCODE -ne 0) { Fail "Could not download Inno Setup (curl exit $LASTEXITCODE)" }
  }
  $head = [System.IO.File]::ReadAllBytes($installer)
  if ($head.Length -lt 100000 -or $head[0] -ne 0x4D) {
    Fail "The downloaded Inno Setup installer is not a valid PE executable."
  }
  Write-Step "Running the Inno Setup installer silently"
  $proc = Start-Process -FilePath $installer `
    -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/NOICONS" `
    -Wait -PassThru
  if ($proc.ExitCode -ne 0) { Fail "Inno Setup installer exited $($proc.ExitCode)" }

  foreach ($c in $IsccCandidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  Fail "Inno Setup installed but ISCC.exe could not be located."
}

# --- 1. Locating the toolchain ------------------------------------------
$iscc = Resolve-Iscc
Write-Step "Using Inno Setup compiler: $iscc"
$isccVersion = (Get-Item -LiteralPath $iscc).VersionInfo.ProductVersion
Write-Host "Version: $isccVersion"

# --- 2. Building the React client ---------------------------------------
if (-not $SkipClientBuild) {
  Push-Location (Join-Path $Root "client")
  try {
    Write-Step "Building client (npm run build)"
    & "npm.cmd" run build
    if ($LASTEXITCODE -ne 0) { Fail "Client build failed (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}
$clientDist = Join-Path $Root "client\dist"
if (-not (Test-Path -LiteralPath (Join-Path $clientDist "index.html"))) {
  Fail "client\dist\index.html is missing. Run the client build first (drop -SkipClientBuild)."
}

# --- 3. Service-side dependencies (node-windows / WinSW) -----------------
$serviceSrc = Join-Path $Pkg "service"
if (-not (Test-Path -LiteralPath (Join-Path $serviceSrc "node_modules\node-windows\bin\winsw\winsw.exe"))) {
  Write-Step "Installing provisioning dependencies (package\service)"
  Push-Location $serviceSrc
  try {
    & "npm.cmd" install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed in package\service (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

# --- 4. Fresh staging tree -----------------------------------------------
Write-Step "Preparing staging tree: $Stage"
New-Item -ItemType Directory -Path $Cache -Force | Out-Null
New-Item -ItemType Directory -Path $Out -Force | Out-Null
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
foreach ($dir in @("runtime", "server", "client", "service")) {
  New-Item -ItemType Directory -Path (Join-Path $Stage $dir) -Force | Out-Null
}
# provision.js lives beside its node_modules so `require('node-windows/...')`
# resolves the same way in the staging tree as it does once installed.
Copy-Item -LiteralPath (Join-Path $serviceSrc "provision.js") -Destination (Join-Path $Stage "service\provision.js")

# --- 5. Node runtime ------------------------------------------------------
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path -LiteralPath $nodeExe)) { Fail "node.exe not found on PATH. Install Node.js first." }
$nodeVer = (& $nodeExe -v).Trim()
Write-Step "Bundling Node runtime: $nodeExe ($nodeVer)"
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $Stage "runtime\node.exe")

# --- 6. Server code + production dependencies ----------------------------
Write-Step "Staging server (code + node_modules)"
$serverStage = Join-Path $Stage "server"
Copy-Item -Path (Join-Path $Root "server\*") -Destination $serverStage -Recurse -Force

# dev/test/deployment artifacts we must never ship
foreach ($rel in @("tests", "backups", "uploads", "public\barcodes")) {
  $target = Join-Path $serverStage $rel
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
# runtime DB / log / cache leftovers
Get-ChildItem -LiteralPath $serverStage -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '\.sqlite(-wal|-shm|-journal|-pre-restore)?$|\.log$|^\.cache$|\.pre-restore$'
  } |
  Remove-Item -Force -ErrorAction SilentlyContinue
# keep only the better-sqlite3 prebuild matching the machine we build on
$prebuilds = Join-Path $serverStage "node_modules\better-sqlite3\prebuilds"
if (Test-Path -LiteralPath $prebuilds) {
  Get-ChildItem -LiteralPath $prebuilds -File |
    Where-Object { $_.Name -ne "win32-x64.node" } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -LiteralPath (Join-Path $serverStage "node_modules\sqlite3\deps") -File -Filter "*.tar.gz" -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue
foreach ($junk in @("node_modules\.bin", "node_modules\.package-lock.json")) {
  $target = Join-Path $serverStage $junk
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

# --- 7. Built client ------------------------------------------------------
Write-Step "Staging client build (client\dist)"
$clientStage = Join-Path $Stage "client"
Copy-Item -Path (Join-Path $clientDist "*") -Destination $clientStage -Recurse -Force
if (-not (Test-Path -LiteralPath (Join-Path $clientStage "index.html"))) {
  Fail "Client dist did not stage correctly"
}

# --- 8. Service wrapper ---------------------------------------------------
Write-Step "Staging service wrapper (node-windows / WinSW)"
$serviceStage = Join-Path $Stage "service\node_modules"
New-Item -ItemType Directory -Path $serviceStage -Force | Out-Null
Copy-Item -Path (Join-Path $serviceSrc "node_modules\*") -Destination $serviceStage -Recurse -Force
$winsw = Join-Path $Stage "service\node_modules\node-windows\bin\winsw\winsw.exe"
if (-not (Test-Path -LiteralPath $winsw)) { Fail "winsw.exe missing from the staged service folder" }
# yargs is only used by node-windows' CLI entry point, not by the wrapper API
$junkYargs = Join-Path $Stage "service\node_modules\yargs"
if (Test-Path -LiteralPath $junkYargs) { Remove-Item -LiteralPath $junkYargs -Recurse -Force }

# --- 9. App icon ----------------------------------------------------------
Write-Step "Generating app icon"
& (Join-Path $Pkg "make-icon.ps1") -OutFile (Join-Path $Stage "app.ico")
if (-not (Test-Path -LiteralPath (Join-Path $Stage "app.ico"))) { Fail "Icon generation failed" }

# --- 10. Compile the installer -------------------------------------------
$outFile = Join-Path $Out "KasabiPOS-Setup-$Version.exe"
if (Test-Path -LiteralPath $outFile) { Remove-Item -LiteralPath $outFile -Force }

Write-Step "Compiling installer (ISCC) -> $outFile"
Push-Location $Pkg
try {
  & $iscc `
    "/DAPP_VER=$Version" `
    "/DAPP_PORT=$Port" `
    "/DAPP_PUBLISHER=KasabiPOS" `
    "kasabi.iss"
  if ($LASTEXITCODE -ne 0) { Fail "ISCC failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# --- 11. Report -----------------------------------------------------------
if (-not (Test-Path -LiteralPath $outFile)) { Fail "Expected installer not found: $outFile" }
$size = (Get-Item -LiteralPath $outFile).Length / 1MB
Write-Step "DONE: $outFile ($([Math]::Round($size, 1)) MB)"
Write-Host "On the shop PC run this setup, then use Start Menu > نظام الكاشير"
Write-Host "Phone access: firewall port $Port is open on the local network."
