#!/usr/bin/env pwsh
# Usage:
#   .\build.ps1                                        # APK debug (dev)
#   .\build.ps1 -Target apk -Flavor staging -Release
#   .\build.ps1 -Target appbundle -Flavor prod -Release
#   .\build.ps1 -Target apk -Flavor dev -Analyze

param(
    [ValidateSet('apk','appbundle','ipa')]
    [string]$Target = 'apk',

    [ValidateSet('dev','staging','prod')]
    [string]$Flavor = 'dev',

    [string]$ApiUrl  = '',
    [switch]$Release,
    [switch]$Analyze,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Join-Path $ScriptDir "..\..\..\frontend\mobile-app"
$EnvFile   = Join-Path $AppDir ".env"

$EnvVars = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | Where-Object { $_ -match '^\s*[A-Z_]+=.+' -and $_ -notmatch '^\s*#' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $EnvVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

# CLI flags take precedence over .env values.
if ($Flavor -eq 'dev' -and $EnvVars.ContainsKey('FLAVOR')) {
    $Flavor = $EnvVars['FLAVOR']
}

Write-Host "======================================================"
Write-Host "  EV Charging — Flutter Build [$Flavor | $Target]" -ForegroundColor Cyan
Write-Host "======================================================"

if (-not (Get-Command "flutter" -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] Flutter SDK not found in PATH." -ForegroundColor Red; exit 1
}
if (-not (Test-Path $AppDir)) {
    Write-Host "[FAIL] App directory not found: $AppDir" -ForegroundColor Red; exit 1
}

Set-Location $AppDir

if ($Clean) {
    Write-Host "[CLEAN] Clearing build cache..." -ForegroundColor Yellow
    & flutter clean
    & flutter pub get
}

if ($Analyze) {
    Write-Host "[ANALYZE] Running static analysis..." -ForegroundColor Cyan
    & flutter analyze --no-fatal-infos
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Analysis errors found. Build aborted." -ForegroundColor Red; exit 1
    }
    Write-Host "[OK] Analysis passed." -ForegroundColor Green
}

# Resolve API URL: CLI arg > .env > per-flavor default.
if ($ApiUrl -eq '') {
    if ($EnvVars.ContainsKey('API_BASE_URL')) {
        $ApiUrl = $EnvVars['API_BASE_URL']
    } else {
        switch ($Flavor) {
            'prod'    { $ApiUrl = 'https://api.ev-charging.vn' }
            'staging' { $ApiUrl = 'https://api-staging.ev-charging.vn' }
            default   { $ApiUrl = 'http://localhost:8000' }
        }
    }
}

$DartDefines    = @("FLAVOR=$Flavor", "API_BASE_URL=$ApiUrl")
$DartDefineArgs = $DartDefines | ForEach-Object { "--dart-define=$_" }
$ModeFlag       = if ($Release) { "--release" } else { "--debug" }

$BuildArgs = @("build", $Target, "--flavor", $Flavor, $ModeFlag) + $DartDefineArgs

# Obfuscation requires a debug-info directory to allow crash symbolication.
if ($Release) {
    $DebugInfoDir = "build\debug-info\$Flavor"
    New-Item -ItemType Directory -Force -Path $DebugInfoDir | Out-Null
    $BuildArgs += "--obfuscate"
    $BuildArgs += "--split-debug-info=$DebugInfoDir"
}

Write-Host ""
Write-Host "[BUILD] API URL : $ApiUrl" -ForegroundColor DarkGray
Write-Host "[BUILD] flutter build $Target --flavor $Flavor $ModeFlag" -ForegroundColor Green
Write-Host ""

$StartTime = Get-Date
& flutter @BuildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Build failed (Exit $LASTEXITCODE)." -ForegroundColor Red; exit 1
}

$Duration = [math]::Round(((Get-Date) - $StartTime).TotalSeconds)

$OutputPath = switch ($Target) {
    'apk'       { "build\app\outputs\flutter-apk" }
    'appbundle' { "build\app\outputs\bundle\${Flavor}Release" }
    'ipa'       { "build\ios" }
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  Build complete in ${Duration}s" -ForegroundColor Green
Write-Host "  Artifact: $AppDir\$OutputPath" -ForegroundColor Green
Write-Host "======================================================"

if ($Release -and $Target -eq 'appbundle') {
    Write-Host ""
    Write-Host "  Upload AAB to Google Play Console:" -ForegroundColor Cyan
    Write-Host "  https://play.google.com/console" -ForegroundColor DarkGray
    Write-Host "  Debug symbols: $AppDir\build\debug-info\$Flavor\" -ForegroundColor DarkGray
    Write-Host ""
}
