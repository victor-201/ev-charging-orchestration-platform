#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Join-Path $ScriptDir "..\..\..\frontend\web-admin"

Write-Host "======================================================"
Write-Host "  EV Charging — Web Admin Dev Server (npm run dev)" -ForegroundColor Cyan
Write-Host "======================================================"

Set-Location $AppDir
& npm run dev
