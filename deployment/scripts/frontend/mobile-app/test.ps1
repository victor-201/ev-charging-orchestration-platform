#!/usr/bin/env pwsh
# Usage:
#   .\test.ps1                    # Run all unit tests
#   .\test.ps1 -Coverage          # Generate HTML coverage report
#   .\test.ps1 -Filter "Booking"  # Run only tests matching string
#   .\test.ps1 -Widget            # Include widget tests in run

param(
    [string]$Filter   = '',
    [switch]$Coverage,
    [switch]$Widget
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Join-Path $ScriptDir "..\..\..\frontend\mobile-app"

Write-Host "======================================================"
Write-Host "  EV Charging — Flutter Test Suite" -ForegroundColor Cyan
Write-Host "======================================================"

if (-not (Get-Command "flutter" -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] Flutter SDK not found in PATH." -ForegroundColor Red; exit 1
}

Set-Location $AppDir

if (-not (Test-Path "test")) {
    Write-Host "[WARN] test/ directory not found. Creating..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "test" | Out-Null
}

$TestArgs = @("test")

if ($Filter -ne '') {
    $TestArgs += "--name"
    $TestArgs += $Filter
    Write-Host "[FILTER] Running tests matching: '$Filter'" -ForegroundColor Yellow
}

if ($Coverage) {
    $TestArgs += "--coverage"
    Write-Host "[INFO] Generating code coverage report." -ForegroundColor Cyan
}

# Exclude widget tests by default to prioritize fast unit test execution.
if (-not $Widget) {
    $TestArgs += "--exclude-tags"
    $TestArgs += "widget"
}

Write-Host ""
Write-Host "[ANALYZE] Running static analysis..." -ForegroundColor Cyan
& flutter analyze --no-fatal-infos
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Analysis passed." -ForegroundColor Green
} else {
    Write-Host "[WARN] Analysis warnings found. Proceeding with tests..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[TEST] flutter $($TestArgs -join ' ')" -ForegroundColor Green
Write-Host ""

$StartTime    = Get-Date
& flutter @TestArgs
$TestExitCode = $LASTEXITCODE
$Duration     = [math]::Round(((Get-Date) - $StartTime).TotalSeconds)

if ($Coverage -and (Test-Path "coverage\lcov.info")) {
    Write-Host ""
    Write-Host "[COVERAGE] Analyzing code coverage..." -ForegroundColor Cyan
    $lcov  = Get-Content "coverage\lcov.info" -Raw
    $found = ([regex]::Matches($lcov, "^DA:\d+,1", [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
    $total = ([regex]::Matches($lcov, "^DA:\d+",   [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
    if ($total -gt 0) {
        $pct   = [math]::Round(($found / $total) * 100, 1)
        $color = if ($pct -ge 80) { 'Green' } elseif ($pct -ge 60) { 'Yellow' } else { 'Red' }
        Write-Host ("  Lines covered: {0}/{1} ({2}%)" -f $found, $total, $pct) -ForegroundColor $color
    }
    if (Get-Command "genhtml" -ErrorAction SilentlyContinue) {
        & genhtml coverage/lcov.info -o coverage/html --quiet
        Write-Host "  HTML report: $AppDir\coverage\html\index.html" -ForegroundColor DarkGray
    } else {
        Write-Host "  [HINT] Install genhtml to view HTML report: choco install lcov" -ForegroundColor DarkGray
    }
}

Write-Host ""
if ($TestExitCode -eq 0) {
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "  All tests passed in ${Duration}s" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
} else {
    Write-Host "======================================================" -ForegroundColor Red
    Write-Host "  Tests failed (Exit $TestExitCode)." -ForegroundColor Red
    Write-Host "======================================================" -ForegroundColor Red
    exit $TestExitCode
}

Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    Build APK: .\deployment\scripts\frontend\build.ps1 -Target apk -Flavor dev"
Write-Host "    Build AAB: .\deployment\scripts\frontend\build.ps1 -Target appbundle -Flavor prod -Release"
Write-Host ""
