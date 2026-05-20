#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Join-Path $ScriptDir "..\..\..\frontend\web-admin"

Write-Host "======================================================"
Write-Host "  EV Charging — Web Admin Build (npm run build)" -ForegroundColor Cyan
Write-Host "======================================================"

Set-Location $AppDir
& npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Build failed." -ForegroundColor Red; exit 1
}
Write-Host "[OK] Build completed." -ForegroundColor Green
