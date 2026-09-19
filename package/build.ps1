# ============================================================
#  KasabiPOS Windows installer builder
#  Produces package\dist\KasabiPOS-Setup-<version>.exe
#
#  Usage:  powershell -ExecutionPolicy Bypass -File build.ps1 [-Version 1.0.0] [-Port 3000] [-SkipClientBuild] [-SkipDownloads]
# ============================================================
[CmdletBinding()]
param(
  [string]$Version = "1.0.0",
  [int]$Port = 3000,
  [switch]$SkipClientBuild,
  [switch]$SkipDownloads
)

$ErrorActionPreference = "Stop"

$Pkg = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Pkg
$Cache = Join-Path $Pkg "cache"
$Stage = Join-Path $Pkg "build\stage"
$Out = Join-Path $Pkg "dist"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Download {
  param([string]$Url, [string]$Dest, [string[]]$AltUrls = @())
  if (Test-Path -LiteralPath $Dest) {
    Write-Step "Using cached $Dest"
    return
  }
  foreach ($u in @($Url) + $AltUrls) {
    try {
      Write-Step "Downloading $u"
      & curl.exe -L -sS --retry 2 -o $Dest $u
      if ($LASTEXITCODE -ne 0) { throw "curl exited $LASTEXITCODE" }
      $bytes = [System.IO.File]::ReadAllBytes($Dest)
      $isZip = ($bytes.Length -gt 2 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B)
      if ($isZip) {
        Write-Host "OK ($([Math]::Round($bytes.Length / 1MB, 1)) MB)"
        return
      }
      Remove-Item -LiteralPath $Dest -Force
      Write-Host "Not a valid zip, trying next URL..."
    } catch {
      Remove-Item -LiteralPath $Dest -Force -ErrorAction SilentlyContinue
      Write-Host "Download failed: $($_.Exception.Message)"
    }
  }
  throw "Could not download $($Dest | Split-Path -Leaf) from any URL"
}

# --- 1. Build the React client -----------------------------------
if (-not $SkipClientBuild) {
  Push-Location (Join-Path $Root "client")
  try {
    Write-Step "Building client (npm run build)"
    & "npm.cmd" run build
    if ($LASTEXITCODE -ne 0) { throw "Client build failed (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}
$clientDist = Join-Path $Root "client\dist"
if (-not (Test-Path -LiteralPath (Join-Path $clientDist "index.html"))) {
  throw "client\dist\index.html is missing. Run the client build first."
}

# --- 2. Fresh staging tree ---------------------------------------
Write-Step "Preparing staging tree: $Stage"
New-Item -ItemType Directory -Path $Cache -Force | Out-Null
New-Item -ItemType Directory -Path $Out -Force | Out-Null
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
foreach ($dir in @("runtime", "server", "client", "tools")) {
  New-Item -ItemType Directory -Path (Join-Path $Stage $dir) -Force | Out-Null
}
Copy-Item -LiteralPath (Join-Path $Pkg "provision.js") -Destination (Join-Path $Stage "provision.js")

# --- 3. Node runtime ---------------------------------------------
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Write-Step "Bundling Node runtime: $nodeExe"
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $Stage "runtime\node.exe")

# --- 4. Server code + production dependencies ---------------------
Write-Step "Staging server (code + node_modules)"
$serverSrc = Join-Path $Root "server"
$serverStage = Join-Path $Stage "server"
Copy-Item -Path (Join-Path $serverSrc "*") -Destination $serverStage -Recurse -Force

# remove dev/test/deployment artifacts we must never ship
foreach ($rel in @(
  "server\tests",
  "server\backups",
  "server\uploads",
  "server\public\barcodes"
)) {
  $target = Join-Path $Stage $rel
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

# wildcard sweep for runtime DB/log/test leftovers
Get-ChildItem -LiteralPath $serverStage -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '\.sqlite(-wal|-shm|-journal|-pre-restore)?$|\.log$|^\.cache$|\.pre-restore$'
  } |
  Remove-Item -Force -ErrorAction SilentlyContinue

# slim the native-addon payloads: keep only the win32-x64 prebuild we run on
Get-ChildItem -LiteralPath (Join-Path $serverStage "node_modules\better-sqlite3\prebuilds") -File |
  Where-Object { $_.Name -ne "win32-x64.node" } |
  Remove-Item -Force
Get-ChildItem -LiteralPath (Join-Path $serverStage "node_modules\sqlite3\deps") -File -Filter "*.tar.gz" -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

# --- 5. Built client ---------------------------------------------
Write-Step "Staging client build (client\dist)"
$clientStage = Join-Path $Stage "client"
Copy-Item -Path (Join-Path $clientDist "*") -Destination $clientStage -Recurse -Force
if (-not (Test-Path -LiteralPath (Join-Path $clientStage "index.html"))) {
  throw "Client dist did not stage correctly"
}

# --- 6. App icon ------------------------------------------------
Write-Step "Generating app icon"
& (Join-Path $Pkg "make-icon.ps1") -OutFile (Join-Path $Stage "app.ico")

# --- 7. NSSM (Windows service manager) ---------------------------
if (-not $SkipDownloads) {
  Write-Step "Fetching NSSM"
  $nssmZip = Join-Path $Cache "nssm-2.24.zip"
  Download -Url "https://nssm.cc/release/nssm-2.24.zip" -Dest $nssmZip
  $nssmDir = Join-Path $Cache "nssm-2.24"
  if (-not (Test-Path -LiteralPath (Join-Path $Cache "nssm-2.24\win64\nssm.exe"))) {
    Expand-Archive -LiteralPath $nssmZip -DestinationPath $Cache -Force
  }
  Copy-Item -LiteralPath (Join-Path $Cache "nssm-2.24\win64\nssm.exe") -Destination (Join-Path $Stage "tools\nssm.exe")
} else {
  $src = Join-Path $Cache "nssm-2.24\win64\nssm.exe"
  if (-not (Test-Path -LiteralPath $src)) { throw "NSSM not cached and -SkipDownloads was used" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $Stage "tools\nssm.exe")
}

# --- 8. NSIS compiler ---------------------------------------------
if (-not $SkipDownloads) {
  Write-Step "Fetching NSIS 3"
  $nsisZip = Join-Path $Cache "nsis-3.11.zip"
  Download `
    -Url "https://sourceforge.net/projects/nsis/files/NSIS%203/3.11/nsis-3.11.zip/download" `
    -Dest $nsisZip `
    -AltUrls @("https://downloads.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11.zip?use_mirror=autoselect")
  if (-not (Test-Path -LiteralPath (Join-Path $Cache "nsis-3.11\makensis.exe"))) {
    Expand-Archive -LiteralPath $nsisZip -DestinationPath $Cache -Force
  }
}
$makensis = Join-Path $Cache "nsis-3.11\makensis.exe"
if (-not (Test-Path -LiteralPath $makensis)) { throw "makensis.exe not found in cache" }

# --- 9. Compile installer -----------------------------------------
Write-Step "Compiling installer (NSIS)"
Push-Location $Pkg
try {
  & $makensis /V2 "/DAPP_VER=$Version" "/DAPP_PORT=$Port" "kasabi.nsi"
  if ($LASTEXITCODE -ne 0) { throw "makensis failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

# --- 10. Report ---------------------------------------------------
$artifact = Join-Path $Out "KasabiPOS-Setup-$Version.exe"
if (-not (Test-Path -LiteralPath $artifact)) { throw "Expected installer not found: $artifact" }
$size = (Get-Item -LiteralPath $artifact).Length / 1MB
Write-Step "DONE: $artifact ($([Math]::Round($size, 1)) MB)"