# Blorq — One-command installer for Windows (PowerShell)
# Usage:
#   iwr -useb https://raw.githubusercontent.com/your-org/blorq/main/install.ps1 | iex
#   # Or with options:
#   $env:PORT="9900"; $env:INSTALL_DIR="$env:APPDATA\blorq"; iwr -useb .../install.ps1 | iex

$ErrorActionPreference = "Stop"

# ── Config ────────────────────────────────────────────────────────────────
$Port       = if ($env:PORT)        { $env:PORT }        else { "9900" }
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { "$env:LOCALAPPDATA\blorq" }
$DataDir    = if ($env:DATA_DIR)    { $env:DATA_DIR }    else { "$env:LOCALAPPDATA\blorq\data" }

# ── Helpers ───────────────────────────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "  $([char]0x2713) $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "  -> $msg"              -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "  ! $msg"               -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  X $msg" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +----------------------------------+" -ForegroundColor Cyan
Write-Host "  |  Blorq - Log Aggregator         |" -ForegroundColor Cyan
Write-Host "  +----------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ─────────────────────────────────────────────────────────
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Warn "Node.js not found."
    Write-Info  "Opening https://nodejs.org/en/download — please install Node.js 18+ then rerun."
    Start-Process "https://nodejs.org/en/download"
    Write-Fail "Install Node.js 18+ first, then rerun this script."
}

$nodeVersion = (node --version 2>&1).ToString().TrimStart('v')
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Fail "Blorq requires Node.js >=18. Found: $nodeVersion. Download: https://nodejs.org"
}
Write-Ok "Node.js v$nodeVersion"
Write-Ok "npm $(npm --version)"

# ── Download / install ────────────────────────────────────────────────────
Write-Host ""
Write-Info "Installing Blorq to $InstallDir"

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$already = Test-Path "$InstallDir\package.json"
if (-not $already) {
    # Install from npm global (preferred once published):
    # npm install -g blorq

    # For now: download GitHub zip
    $zipUrl = "https://github.com/your-org/blorq/archive/refs/heads/main.zip"
    $tmpZip = "$env:TEMP\blorq.zip"
    $tmpDir = "$env:TEMP\blorq-extract"

    Write-Info "Downloading Blorq..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip -UseBasicParsing

    Write-Info "Extracting..."
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir

    $src = Get-ChildItem -Path $tmpDir -Directory | Where-Object { $_.Name -like "blorq-*" } | Select-Object -First 1
    if ($src) {
        Copy-Item "$($src.FullName)\*" $InstallDir -Recurse -Force
    } else {
        Copy-Item "$tmpDir\*" $InstallDir -Recurse -Force
    }

    Remove-Item $tmpZip, $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "Downloaded"
}

# ── Dependencies ──────────────────────────────────────────────────────────
Write-Info "Installing dependencies..."
Push-Location $InstallDir
npm install --omit=dev --no-audit --no-fund --loglevel=error
Pop-Location
Write-Ok "Dependencies installed"

# ── First-run setup ───────────────────────────────────────────────────────
Write-Host ""
Write-Info "Running first-time setup..."
$env:PORT     = $Port
$env:DATA_DIR = $DataDir
node "$InstallDir\setup.js"
Write-Host ""

# ── Create blorq.cmd wrapper ──────────────────────────────────────────────
$cmdDir = "$env:APPDATA\npm"  # usually in PATH from npm global installs
if (-not (Test-Path $cmdDir)) { New-Item -ItemType Directory -Path $cmdDir -Force | Out-Null }

$blorqCmd = "@echo off`r`nnode `"$InstallDir\bin\blorq`" %*"
$cmdPath  = "$cmdDir\blorq.cmd"
Set-Content -Path $cmdPath -Value $blorqCmd -Encoding ASCII
Write-Ok "blorq command created at $cmdPath"

# Add to PATH if not there
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$cmdDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$cmdDir", "User")
    Write-Info "Added $cmdDir to user PATH"
    Write-Warn "Restart your terminal for 'blorq' to be available"
} else {
    Write-Ok "PATH already includes $cmdDir"
}

# ── Done ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Blorq installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start now:         blorq start" -ForegroundColor Cyan
Write-Host "  Start on boot:     blorq service install" -ForegroundColor Cyan
Write-Host "  Open dashboard:    http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Default login:     admin / admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Install dir:  $InstallDir"
Write-Host "  Data dir:     $DataDir"
Write-Host ""
Write-Warn "Change default passwords at http://localhost:$Port/settings"
Write-Host ""

# Offer to start now
$reply = Read-Host "  Start Blorq now? [Y/n]"
if (-not $reply -or $reply -match "^[Yy]") {
    Write-Host ""
    & node "$InstallDir\bin\blorq" start
}
