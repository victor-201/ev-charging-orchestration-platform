param(
  [string]$Device = 'auto'
)

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\..\.."
$AppDir = Join-Path $ProjectRoot "frontend\mobile-app"

Write-Host "======================================================"
Write-Host "  EV Charging Platform — Flutter Frontend"
Write-Host "======================================================"
Write-Host "  App dir : $AppDir"

Set-Location $AppDir

if ($Device -eq 'auto') {
    Write-Host "[INFO] Scanning connected devices..." -ForegroundColor Cyan
    $devices = flutter devices --machine | ConvertFrom-Json

    # Prefer physical/emulator targets over web or desktop runners.
    $target = $devices | Where-Object { $_.targetPlatform -match 'android|ios' } | Select-Object -First 1

    if ($target) {
        $Device = $target.id
        Write-Host "[OK] Selected device: $($target.name) ($($target.id))" -ForegroundColor Green
    } else {
        Write-Host "[WARN] No USB/Emulator device found. Falling back to Chrome." -ForegroundColor Yellow
        $Device = 'chrome'
    }
}

if ($Device -match 'chrome|web') {
    Write-Host "[RUN] Chrome (--disable-web-security bypasses CORS for local dev)" -ForegroundColor Green
    flutter run -d chrome --web-browser-flag "--disable-web-security" --flavor dev --dart-define=FLAVOR=dev
} elseif ($Device -eq 'windows') {
    Write-Host "[RUN] Windows Desktop" -ForegroundColor Green
    flutter run -d windows --flavor dev --dart-define=FLAVOR=dev
} else {
    Write-Host "[RUN] Device: $Device" -ForegroundColor Green
    flutter run -d $Device --flavor dev --dart-define-from-file=dart-defines.json
}
