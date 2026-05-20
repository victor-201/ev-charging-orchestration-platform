#!/usr/bin/env pwsh
# Usage:
#   .\setup.ps1              # Verify environment and install dependencies
#   .\setup.ps1 -GenKeystore # Generate Android release keystore
#   .\setup.ps1 -SkipDoctor  # Skip flutter doctor check

param(
    [switch]$GenKeystore,
    [switch]$SkipDoctor
)

$ErrorActionPreference = 'Stop'
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir     = Join-Path $ScriptDir "..\..\..\frontend\mobile-app"
$AndroidDir = Join-Path $AppDir "android"

Write-Host "======================================================"
Write-Host "  EV Charging — Frontend Setup" -ForegroundColor Cyan
Write-Host "======================================================"

Write-Host ""
Write-Host "[CHECK] Flutter SDK..." -ForegroundColor Cyan

if (-not (Get-Command "flutter" -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] Flutter SDK not found in PATH." -ForegroundColor Red
    Write-Host "  Install from: https://flutter.dev/docs/get-started/install" -ForegroundColor Yellow
    exit 1
}

$flutterVer = (flutter --version 2>&1 | Select-String "Flutter").ToString().Trim()
Write-Host "[OK] $flutterVer" -ForegroundColor Green

if (-not $SkipDoctor) {
    Write-Host ""
    Write-Host "[DOCTOR] Running flutter doctor..." -ForegroundColor Cyan
    & flutter doctor -v
}

Write-Host ""
Write-Host "[DEPS] Installing Flutter packages..." -ForegroundColor Cyan
Set-Location $AppDir
& flutter pub get

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] flutter pub get failed." -ForegroundColor Red; exit 1
}
Write-Host "[OK] Packages installed." -ForegroundColor Green

Write-Host ""
Write-Host "[CHECK] ADB..." -ForegroundColor Cyan

if (Get-Command "adb" -ErrorAction SilentlyContinue) {
    Write-Host "[OK] ADB available." -ForegroundColor Green
    $devices = adb devices 2>&1 | Where-Object { $_ -match '\t(device|offline)' }
    if ($devices) {
        Write-Host "[INFO] Connected devices:" -ForegroundColor Cyan
        $devices | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "[WARN] No Android device connected." -ForegroundColor Yellow
        Write-Host "  Connect via USB and enable USB Debugging." -ForegroundColor DarkGray
    }
} else {
    Write-Host "[WARN] ADB not found in PATH." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[CHECK] google-services.json (Firebase)..." -ForegroundColor Cyan

$googleServices = Join-Path $AppDir "android\app\google-services.json"
if (Test-Path $googleServices) {
    Write-Host "[OK] google-services.json present." -ForegroundColor Green
} else {
    Write-Host "[WARN] google-services.json missing. FCM notifications will not work." -ForegroundColor Yellow
    Write-Host "  1. Go to: https://console.firebase.google.com" -ForegroundColor DarkGray
    Write-Host "  2. Create project > Add Android app > package: com.evcharging.ev_charging_app" -ForegroundColor DarkGray
    Write-Host "  3. Download file > place in android\app\" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "[CHECK] Android signing config..." -ForegroundColor Cyan

$keyProps = Join-Path $AndroidDir "key.properties"
if (Test-Path $keyProps) {
    $kpContent = Get-Content $keyProps -Raw
    if ($kpContent -match "YOUR_KEYSTORE_PASSWORD") {
        Write-Host "[WARN] key.properties contains placeholder values." -ForegroundColor Yellow
        Write-Host "  Run: .\setup.ps1 -GenKeystore to create a new keystore." -ForegroundColor DarkGray
    } else {
        Write-Host "[OK] key.properties configured." -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] key.properties not found. Release builds will fail signing." -ForegroundColor Yellow
}

if ($GenKeystore) {
    Write-Host ""
    Write-Host "[KEYSTORE] Generating Android release keystore..." -ForegroundColor Cyan

    if (-not (Get-Command "keytool" -ErrorAction SilentlyContinue)) {
        Write-Host "[FAIL] keytool not found. Install JDK and ensure it is in PATH." -ForegroundColor Red
        exit 1
    }

    $KeystorePath = Join-Path $AndroidDir "ev_charging_release.keystore"
    $KeyAlias     = "ev_charging_key"

    Write-Host ""
    $storePass = Read-Host "  Keystore password (min 6 chars)"
    if ($storePass.Length -lt 6) {
        Write-Host "[FAIL] Password too short." -ForegroundColor Red; exit 1
    }

    $keyPass = Read-Host "  Key password (Enter = same as keystore password)"
    if ($keyPass -eq '') { $keyPass = $storePass }

    $dname = "CN=EV Charging App, OU=Mobile, O=EV Charging VN, L=Ho Chi Minh City, ST=Ho Chi Minh, C=VN"

    Write-Host "[BUILD] Generating keystore..." -ForegroundColor Cyan
    & keytool -genkey -v `
        -keystore $KeystorePath `
        -alias $KeyAlias `
        -keyalg RSA -keysize 2048 `
        -validity 10000 `
        -storepass $storePass `
        -keypass $keyPass `
        -dname $dname

    if ($LASTEXITCODE -eq 0) {
        $propsContent = "storePassword=$storePass`nkeyPassword=$keyPass`nkeyAlias=$KeyAlias`nstoreFile=../ev_charging_release.keystore"
        Set-Content -Path $keyProps -Value $propsContent -Encoding UTF8
        Write-Host "[OK] Keystore created: $KeystorePath" -ForegroundColor Green
        Write-Host "[OK] key.properties updated." -ForegroundColor Green
        Write-Host "[SECURITY] Do NOT commit key.properties or .keystore to version control." -ForegroundColor Red
    } else {
        Write-Host "[FAIL] Keystore generation failed." -ForegroundColor Red; exit 1
    }
}

Write-Host ""
Write-Host "======================================================"
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host "======================================================"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    Run dev  : .\deployment\scripts\frontend\run.ps1"
Write-Host "    Run tests: .\deployment\scripts\frontend\test.ps1"
Write-Host "    Build APK: .\deployment\scripts\frontend\build.ps1 -Target apk -Flavor dev"
Write-Host "    Build AAB: .\deployment\scripts\frontend\build.ps1 -Target appbundle -Flavor prod -Release"
Write-Host ""
