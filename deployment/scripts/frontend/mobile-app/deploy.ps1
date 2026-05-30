param(
    [ValidateSet('dev','staging','prod')]
    [string]$Flavor = 'dev',

    [string]$Device = 'auto'
)

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $MyInvocation -and $MyInvocation.MyCommand -and $MyInvocation.MyCommand.Path) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $ScriptDir) {
    $ScriptDir = (Get-Location).Path
}

$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..\..")).Path
$AppDir      = Join-Path $ProjectRoot "frontend\mobile-app"

Write-Host "======================================================"
Write-Host "  EV Charging Platform — Flutter Wireless Deploy Tool"
Write-Host "======================================================"
Write-Host "  App dir : $AppDir"
Write-Host ""

Set-Location $AppDir

# 1. Check/Select connected device via ADB
if ($Device -eq 'auto') {
    $retryCount = 0
    $maxRetries = 6  # Total wait up to ~18 seconds
    
    while ($retryCount -lt $maxRetries) {
        Write-Host "[INFO] Scanning connected USB/ADB devices..." -ForegroundColor Cyan
        $adbDevices = adb devices
        
        # Check if there is an authorized active device
        $lines = @($adbDevices | Where-Object { $_ -match '\tdevice$' })
        
        if ($lines.Count -gt 0) {
            $firstDeviceLine = $lines[0]
            $Device = ($firstDeviceLine -split '\t')[0].Trim()
            Write-Host "[OK] Target device detected: $Device" -ForegroundColor Green
            break
        }
        
        # Check if device is connecting/authorizing/unauthorized
        $unauthorizedLines = @($adbDevices | Where-Object { $_ -match '\t(authorizing|unauthorized|offline)$' })
        if ($unauthorizedLines.Count -gt 0) {
            $unauthorizedLine = $unauthorizedLines[0]
            $devId = ($unauthorizedLine -split '\t')[0].Trim()
            $devState = ($unauthorizedLine -split '\t')[1].Trim()
            
            Write-Host ""
            Write-Host " [!] PHAT HIEN THIET BI ($devId) DANG O TRANG THAI: $devState" -ForegroundColor Yellow -BackgroundColor Black
            Write-Host " [?] Vui lau kiem tra man hinh dien thoai va nhan 'Cho phep go loi USB' (Allow USB debugging)." -ForegroundColor Cyan
            Write-Host " [>] Dang doi ban cap quyen tren dien thoai (Thu lai sau 3 giay...) [$($retryCount + 1)/$maxRetries]" -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
            $retryCount++
            continue
        }
        
        # No device at all
        Write-Host "[FAIL] Khong tim thay thiet bi nao qua ADB." -ForegroundColor Red
        Write-Host "Vui long cam cap USB ket noi dien thoai va may tinh truoc!" -ForegroundColor Yellow
        exit 1
    }
    
    if ($retryCount -eq $maxRetries) {
        Write-Host ""
        Write-Host "[FAIL] Qua thoi gian cho cap quyen. Thiet bi van o trang thai chua duoc uy quyen." -ForegroundColor Red
        Write-Host "Vui long cho phep ket noi tren dien thoai roi chay lai tap lenh." -ForegroundColor Yellow
        exit 1
    }
}

# 2. Rebuild the debug APK with build.ps1
Write-Host "[BUILD] Running build.ps1 for debug APK..." -ForegroundColor Cyan
& "$ScriptDir\build.ps1" -Target apk -Flavor $Flavor

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Build failed. Aborting deploy." -ForegroundColor Red
    exit 1
}

# 3. Locate the built APK
$ApkPath = "$AppDir\build\app\outputs\flutter-apk\app-$Flavor-debug.apk"
if (-not (Test-Path $ApkPath)) {
    Write-Host "[FAIL] Could not find the built APK at: $ApkPath" -ForegroundColor Red
    exit 1
}

# 4. Install the APK to the device
Write-Host "[DEPLOY] Installing APK to $Device..." -ForegroundColor Cyan
& adb -s $Device install -r "$ApkPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Failed to install APK to device." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] APK installed successfully!" -ForegroundColor Green

# 5. Determine package and main activity to launch
$Package = switch ($Flavor) {
    'prod'    { 'com.evcharging.ev_charging_app' }
    'staging' { 'com.evcharging.ev_charging_app.staging.debug' }
    default   { 'com.evcharging.ev_charging_app.dev.debug' }
}
$Activity = "$Package/com.evcharging.ev_charging_app.MainActivity"

Write-Host "[LAUNCH] Starting application on phone..." -ForegroundColor Cyan
& adb -s $Device shell am start -n "$Activity"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Could not automatically start the app. Please launch it manually from your phone screen." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Application launched successfully!" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  SUCCESS: Code deployed to your device!" -ForegroundColor Green
Write-Host "  You can now SAFE UNPLUG the USB cable." -ForegroundColor Green
Write-Host "  The app will run as a standalone app on your phone." -ForegroundColor Green
Write-Host "======================================================"
Write-Host ""
