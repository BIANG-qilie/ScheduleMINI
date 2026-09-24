#Requires -Version 5.1
<#
.SYNOPSIS
  Pull origin/main and build the release exe (no MSI).

.DESCRIPTION
  Ends a running desktop-schedule-widget if needed, discards local noise on
  package-lock.json / src-tauri/Cargo.toml, fast-forwards main, installs npm
  deps, then runs `tauri build --no-bundle` with the MSVC environment.
#>
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Find-VcVars64 {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'vswhere.exe not found. Install Visual Studio Build Tools with the C++ workload.'
  }
  $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (-not $installPath) {
    throw 'MSVC Build Tools not found. Install Visual Studio Build Tools with the C++ workload.'
  }
  $vcvars = Join-Path $installPath 'VC\Auxiliary\Build\vcvars64.bat'
  if (-not (Test-Path -LiteralPath $vcvars)) {
    throw "vcvars64.bat not found under $installPath"
  }
  return $vcvars
}

Write-Step 'Stop running app (if any)'
Get-Process -Name 'desktop-schedule-widget' -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host "Stopping PID $($_.Id)"
    Stop-Process -Id $_.Id -Force
  }
Start-Sleep -Seconds 1

Write-Step 'Check working tree'
$porcelain = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'git status failed' }

$allowed = @(
  'package-lock.json',
  'src-tauri/Cargo.toml'
)
$dirty = @()
foreach ($line in ($porcelain -split "`n")) {
  $trimmed = $line.TrimEnd()
  if (-not $trimmed) { continue }
  $path = $trimmed.Substring(3).Trim().Replace('\', '/')
  if ($path -notin $allowed) {
    $dirty += $trimmed
  }
}
if ($dirty.Count -gt 0) {
  Write-Host 'Uncommitted changes (besides package-lock / Cargo.toml):' -ForegroundColor Yellow
  $dirty | ForEach-Object { Write-Host "  $_" }
  throw 'Clean or commit these changes before pull:build.'
}

Write-Step 'Discard lockfile / Cargo.toml noise'
git checkout -- package-lock.json src-tauri/Cargo.toml 2>$null

Write-Step 'git pull --ff-only origin main'
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only failed' }
git log -1 --oneline

Write-Step 'npm install'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

Write-Step 'tauri build --no-bundle'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Test-Path -LiteralPath (Join-Path $cargoBin 'cargo.exe'))) {
  throw "cargo not found at $cargoBin. Install Rust from https://rustup.rs/"
}
$vcvars = Find-VcVars64
$bat = Join-Path $env:TEMP 'schedulemini-pull-and-build.bat'
@"
@echo off
call "$vcvars" || exit /b 1
set PATH=$cargoBin;%PATH%
cd /d "$Root"
call npm run tauri -- build --no-bundle
exit /b %ERRORLEVEL%
"@ | Set-Content -Path $bat -Encoding ASCII

cmd /c $bat
if ($LASTEXITCODE -ne 0) { throw "tauri build failed (exit $LASTEXITCODE)" }

$exe = Join-Path $Root 'src-tauri\target\release\desktop-schedule-widget.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  throw "Build finished but exe missing: $exe"
}

Write-Host ""
Write-Host "OK  $exe" -ForegroundColor Green
Write-Host "Run:  & '$exe'"
