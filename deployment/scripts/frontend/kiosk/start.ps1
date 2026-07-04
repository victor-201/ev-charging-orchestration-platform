#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $MyInvocation -and $MyInvocation.MyCommand -and $MyInvocation.MyCommand.Path) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $ScriptDir) {
    $ScriptDir = (Get-Location).Path
}
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..\..")).Path
$AppDir = Join-Path $ProjectRoot "frontend\kiosk"
$EnvFile = Join-Path $AppDir ".env"

# Read DEV_PORT from .env
$Port = ((Get-Content $EnvFile) -match '^DEV_PORT=') -replace '^DEV_PORT=' -replace '^"|"$'
if (-not $Port) { $Port = "5001" }

Write-Host "======================================================"
Write-Host "  EV Charging — Kiosk Production Preview Server" -ForegroundColor Green
Write-Host "  Port: $Port  (from $EnvFile)" -ForegroundColor Green
Write-Host "======================================================"

Set-Location $AppDir
& npm.cmd run preview -- --port $Port --host
