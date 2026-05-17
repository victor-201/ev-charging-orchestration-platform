$ErrorActionPreference = "Continue"
$OriginalPath = Get-Location

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location $ProjectRoot

function Safe-Clear {
    try { [Console]::Clear() }
    catch { Clear-Host }
}

function Clear-KeyBuffer {
    try {
        while ([Console]::KeyAvailable) { $null = [Console]::ReadKey($true) }
    } catch {}
}

function Get-Key {
    try { $k = [Console]::ReadKey($true) }
    catch { return $null }
    switch ($k.Key) {
        ([ConsoleKey]::Escape)     { return "0" }
        ([ConsoleKey]::Backspace)  { return "0" }
        ([ConsoleKey]::LeftArrow)  { return "0" }
        ([ConsoleKey]::RightArrow) { return "enter" }
        ([ConsoleKey]::Enter)      { return "enter" }
        ([ConsoleKey]::UpArrow)    { return "up" }
        ([ConsoleKey]::DownArrow)  { return "down" }
    }
    return $k.KeyChar.ToString().ToLower()
}

function Get-Key-Timeout {
    param([int]$TimeoutMs = 500)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.ElapsedMilliseconds -lt $TimeoutMs) {
        if ([Console]::KeyAvailable) {
            try {
                $k = [Console]::ReadKey($true)
                switch ($k.Key) {
                    ([ConsoleKey]::Escape)    { return "0" }
                    ([ConsoleKey]::Backspace) { return "0" }
                    ([ConsoleKey]::LeftArrow) { return "0" }
                }
                return $k.KeyChar.ToString().ToLower()
            } catch { break }
        }
        # Use short sleep to lower CPU utilization while maintaining low input latency.
        [System.Threading.Thread]::Sleep(5)
    }
    return $null
}

function Confirm-Action {
    param([string]$Message)
    Write-Host ""
    Write-Host " [!] $Message" -ForegroundColor White -BackgroundColor Red
    Write-Host " [?] Confirm action? (Y to confirm / any other key to cancel): " -ForegroundColor Yellow -NoNewline
    $k = Get-Key
    if ($k -eq "y") {
        Write-Host "Y - CONFIRMED" -ForegroundColor Green
        return $true
    }
    Write-Host "Cancelled." -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 400
    return $false
}

function Pause-Key {
    param([string]$Msg = "Press any key to return...")
    Write-Host ""
    Write-Host " $Msg" -ForegroundColor DarkGray
    Get-Key | Out-Null
}

function Get-WslRoot {
    $result = wsl wslpath -u "$ProjectRoot" 2>$null
    if ($null -eq $result -or $result -eq "") {
        # Fallback to manual path conversion if WSL wslpath utility fails.
        $wslPath = $ProjectRoot -replace "\\", "/"
        $drive   = $wslPath[0].ToString().ToLower()
        $wslPath = $wslPath -replace "^[A-Za-z]:", "/mnt/$drive"
        return $wslPath.TrimEnd("/")
    }
    return $result.Trim()
}

function Open-UbuntuTerminal {
    param([string]$BashCommand)

    # Prefer Windows Terminal (wt) for optimal multi-tab and color support.
    $wtCmd = Get-Command "wt" -ErrorAction SilentlyContinue
    if ($null -ne $wtCmd) {
        Start-Process "wt" -ArgumentList "new-tab", "--profile", "Ubuntu", "bash", "-c", "$BashCommand"
    } else {
        # Fallback to standard CLI app or direct wsl.exe shell.
        $uCmd = Get-Command "ubuntu" -ErrorAction SilentlyContinue
        if ($null -ne $uCmd) {
            Start-Process "ubuntu" -ArgumentList "run", "bash", "-c", "$BashCommand"
        } else {
            Start-Process "wsl.exe" -ArgumentList "-d", "Ubuntu", "--", "bash", "-c", "$BashCommand"
        }
    }
}

function Run-WSL {
    param(
        [string]$ScriptName,
        [string]$ArgsStr = ""
    )
    $WslRoot  = Get-WslRoot
    $FullArgs = if ($ArgsStr) { " $ArgsStr" } else { "" }
    $PathPrefix = if ($ScriptName -match "/") { "" } else { "backend/" }
    $BashCmd  = "cd '$WslRoot' && bash ./deployment/scripts/$PathPrefix$ScriptName$FullArgs; echo ''; echo ' Press Enter to close window...'; read -r"

    Open-UbuntuTerminal -BashCommand $BashCmd
    Start-Sleep -Milliseconds 100
}

function Run-Frontend {
    param(
        [string]$ScriptName,
        [string]$ArgsStr = ""
    )
    $scriptPath = "$ProjectRoot\deployment\scripts\frontend\$ScriptName"
    $FullArgs   = if ($ArgsStr) { " $ArgsStr" } else { "" }
    $PsCmd      = "Set-Location '$ProjectRoot'; & '$scriptPath'$FullArgs; Write-Host ''; Write-Host ' [DONE] Press any key to close...' -ForegroundColor DarkGray; `$null = [Console]::ReadKey(`$true)"

    Start-Process "powershell" -ArgumentList "-NoProfile", "-NoExit", "-Command", $PsCmd
    Start-Sleep -Milliseconds 100
}

$LINE_FULL = "=========================================================================="
$LINE_THIN = "--------------------------------------------------------------------------"

function Show-Header {
    param([string]$SubTitle = "")
    Safe-Clear
    Write-Host " ╔══════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host " ║          EV CHARGING PLATFORM - SYSTEM MANAGER (v9.0)              ║" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host " ╚══════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    if ($SubTitle) {
        Write-Host "  [>] $SubTitle" -ForegroundColor Yellow
    }
    Write-Host ""
    Clear-KeyBuffer
}

function Write-MenuItem {
    param(
        [string]$Key   = "",
        [string]$Label = "",
        [ConsoleColor]$Color = [ConsoleColor]::White,
        [switch]$IsBack,
        [switch]$IsQuit
    )
    if ($IsBack) {
        Write-Host "  [0] Back" -ForegroundColor DarkCyan
    } elseif ($IsQuit) {
        Write-Host "  [Q] Quit" -ForegroundColor Red
    } else {
        Write-Host "  [$Key] " -NoNewline -ForegroundColor $Color
        Write-Host $Label -ForegroundColor White
    }
}

function Show-Separator {
    param([string]$Label = "")
    if ($Label) {
        Write-Host "  ─── $Label ───" -ForegroundColor DarkGray
    } else {
        Write-Host "  ────────────────────────────────────────────────────────────" -ForegroundColor DarkCyan
    }
}

function Sub-Start {
    while ($true) {
        Show-Header "START SYSTEM"
        Write-MenuItem "1" "Normal Start"     Green
        Write-MenuItem "2" "Rebuild Images"   Yellow
        Write-MenuItem "3" "Start + Ngrok"    Cyan
        Write-MenuItem "4" "Rebuild + Ngrok"  Magenta
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Run-WSL "start.sh"; return }
            "2" { if (Confirm-Action "Rebuild all images?") { Run-WSL "start.sh" "--rebuild" }; return }
            "3" { Run-WSL "start.sh" "--ngrok"; return }
            "4" { if (Confirm-Action "Rebuild and start with Ngrok?") { Run-WSL "start.sh" "--rebuild --ngrok" }; return }
            "0" { return }
        }
    }
}

function Sub-Stop {
    while ($true) {
        Show-Header "STOP SYSTEM"
        Write-MenuItem "1" "Stop Services"    Yellow
        Write-MenuItem "2" "Clean Stop (Remove data)" Red
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Run-WSL "stop.sh"; return }
            "2" { if (Confirm-Action "Stop and DELETE all volumes?") { Run-WSL "stop.sh" "--clean" }; return }
            "0" { return }
        }
    }
}

function Sub-Reset {
    while ($true) {
        Show-Header "RESET PROJECT"
        Write-Host "  [!] Reset will delete all Containers, Images, and Volumes!" -ForegroundColor Red
        Write-Host ""
        Write-MenuItem "1" "Reset Now (Force)" Red
        Write-MenuItem "2" "Reset + Ngrok"     Red
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { if (Confirm-Action "Reset project and delete all data?") { Run-WSL "reset.sh" "--force" }; return }
            "2" { if (Confirm-Action "Reset and restart with Ngrok?") { Run-WSL "reset.sh" "--force --ngrok" }; return }
            "0" { return }
        }
    }
}

function Sub-Logs {
    while ($true) {
        Show-Header "SYSTEM LOGS"
        Write-MenuItem "1" "All Services"     White
        Write-MenuItem "2" "Microservices"    Green
        Write-MenuItem "3" "Databases"        Yellow
        Write-MenuItem "4" "Infrastructure"   Magenta
        Write-MenuItem "5" "Select Service..." Cyan
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Run-WSL "logs.sh"; return }
            "2" { Run-WSL "logs.sh" "--app"; return }
            "3" { Run-WSL "logs.sh" "--pg"; return }
            "4" { Run-WSL "logs.sh" "--infra"; return }
            "5" { Sub-Log-Service-Selector; return }
            "0" { return }
        }
    }
}

function Sub-Log-Service-Selector {
    $apps  = @(
        "iam-service", "analytics-service", "ev-infrastructure-service",
        "session-service", "billing-service", "notification-service",
        "telemetry-ingestion-service", "ocpp-gateway-service"
    )
    $dbs   = @(
        "postgres-iam", "postgres-infra", "postgres-session",
        "postgres-billing", "postgres-analytics", "postgres-notification"
    )
    $infra = @("redis", "rabbitmq", "clickhouse", "kong")

    Show-Header "SELECT SERVICE FOR LOGS"
    Show-Separator "MICROSERVICES (1-8)"
    for ($i = 0; $i -lt $apps.Length; $i++) {
        Write-Host ("  [{0,2}] {1}" -f ($i + 1), $apps[$i]) -ForegroundColor Green
    }
    Show-Separator "DATABASES (9-14)"
    for ($i = 0; $i -lt $dbs.Length; $i++) {
        Write-Host ("  [{0,2}] {1}" -f ($i + 9), $dbs[$i]) -ForegroundColor Yellow
    }
    Show-Separator "INFRASTRUCTURE (15-18)"
    for ($i = 0; $i -lt $infra.Length; $i++) {
        Write-Host ("  [{0,2}] {1}" -f ($i + 15), $infra[$i]) -ForegroundColor Magenta
    }
    Write-Host ""
    Show-Separator
    Write-MenuItem -IsBack
    Write-Host ""
    Write-Host "  [?] Select number (1-18): " -ForegroundColor White -NoNewline
    Clear-KeyBuffer

    $k1 = Get-Key
    if ($k1 -eq "0") { return }

    # Parse single or double-digit CLI menu inputs.
    $choiceStr = ""
    if ($k1 -match "^[1-9]$") {
        Write-Host $k1 -NoNewline -ForegroundColor Green
        if ($k1 -eq "1") {
            $k2 = Get-Key-Timeout -TimeoutMs 800
            if ($null -ne $k2 -and $k2 -match "^[0-8]$") {
                $choiceStr = "1$k2"
                Write-Host $k2 -ForegroundColor Green
            } else {
                $choiceStr = "1"
                Write-Host ""
            }
        } else {
            $choiceStr = $k1
            Write-Host ""
        }
    } else {
        Write-Host ""
        return
    }

    $idx    = [int]$choiceStr
    $target = ""
    if     ($idx -ge 1  -and $idx -le 8)  { $target = $apps[$idx - 1]   }
    elseif ($idx -ge 9  -and $idx -le 14) { $target = $dbs[$idx - 9]    }
    elseif ($idx -ge 15 -and $idx -le 18) { $target = $infra[$idx - 15] }

    if (-not $target) {
        Write-Host "  [!] Invalid choice." -ForegroundColor Red
        Start-Sleep -Milliseconds 800
        return
    }

    Show-Header "LOG: $target"
    Write-MenuItem "1" "Realtime (follow -f)"  Green
    Write-MenuItem "2" "Static  (no-follow)"   White
    Write-Host ""
    Show-Separator
    Write-MenuItem -IsBack
    Write-Host ""
    $m = Get-Key
    switch ($m) {
        "1" { Run-WSL "logs.sh" "--service $target" }
        "2" { Run-WSL "logs.sh" "--service $target --no-follow" }
    }
}

function Sub-Testing {
    while ($true) {
        Show-Header "TESTING SUITE (Backend — WSL)"
        Write-MenuItem "1" "tests.sh --all           Run all tests (unit + smoke)"    White
        Write-MenuItem "2" "tests.sh --unit          Run unit tests"                  Green
        Write-MenuItem "3" "tests.sh --smoke         Run integration smoke tests"     Yellow
        Write-MenuItem "4" "validate-rabbitmq.sh     Verify RabbitMQ queues & DLQ"    Magenta
        Write-MenuItem "5" "clickhouse-check.sh      Verify ClickHouse database"      Magenta
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Run-WSL "tests.sh" "--all";        return }
            "2" { Run-WSL "tests.sh" "--unit";       return }
            "3" { Run-WSL "tests.sh" "--smoke";      return }
            "4" { Run-WSL "validate-rabbitmq.sh";   return }
            "5" { Run-WSL "clickhouse-check.sh";    return }
            "0" { return }
        }
    }
}

function Sub-Seeding {
    while ($true) {
        Show-Header "DATABASE SEEDING ENGINE"
        Write-Host "  [!] Manage mock database records using UP/DOWN operations." -ForegroundColor Yellow
        Write-Host ""
        Write-MenuItem "1" "SEED UP (Insert seed data)" Green
        Write-MenuItem "2" "SEED DOWN (Clear seed data)" Red
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Sub-Seeding-Up }
            "2" { Sub-Seeding-Down }
            "0" { return }
        }
    }
}

function Sub-Seeding-Up {
    while ($true) {
        Show-Header "DATABASE SEED UP MENU"
        Write-Host "  [+] Seed target database instance with default fixtures." -ForegroundColor Green
        Write-Host ""
        Write-MenuItem "1" "Seed UP All Databases" Green
        Write-MenuItem "2" "Seed UP IAM Service"            Green
        Write-MenuItem "3" "Seed UP EV Infrastructure Service"    Green
        Write-MenuItem "4" "Seed UP Billing Service"        Green
        Write-MenuItem "5" "Seed UP Session Service"   Green
        Write-MenuItem "6" "Seed UP Analytics Service"     Green
        Write-MenuItem "7" "Seed UP Notification Service"   Green
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Run-WSL "database/seed-up.sh"; return }
            "2" { Run-WSL "database/seed-up.sh" "iam-service"; return }
            "3" { Run-WSL "database/seed-up.sh" "ev-infrastructure-service"; return }
            "4" { Run-WSL "database/seed-up.sh" "billing-service"; return }
            "5" { Run-WSL "database/seed-up.sh" "session-service"; return }
            "6" { Run-WSL "database/seed-up.sh" "analytics-service"; return }
            "7" { Run-WSL "database/seed-up.sh" "notification-service"; return }
            "0" { return }
        }
    }
}

function Sub-Seeding-Down {
    while ($true) {
        Show-Header "DATABASE SEED DOWN MENU"
        Write-Host "  [!] WARNING: Truncates seeded database content." -ForegroundColor Red
        Write-Host ""
        Write-MenuItem "1" "Seed DOWN All Databases" Red
        Write-MenuItem "2" "Seed DOWN IAM Service"                          Red
        Write-MenuItem "3" "Seed DOWN EV Infrastructure Service"              Red
        Write-MenuItem "4" "Seed DOWN Billing Service"                      Red
        Write-MenuItem "5" "Seed DOWN Session Service"                      Red
        Write-MenuItem "6" "Seed DOWN Analytics Service"                      Red
        Write-MenuItem "7" "Seed DOWN Notification Service"                  Red
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { if (Confirm-Action "Truncate all seeded data?") { Run-WSL "database/seed-down.sh" }; return }
            "2" { if (Confirm-Action "Truncate IAM seed data?") { Run-WSL "database/seed-down.sh" "iam-service" }; return }
            "3" { if (Confirm-Action "Truncate EV Infrastructure seed data?") { Run-WSL "database/seed-down.sh" "ev-infrastructure-service" }; return }
            "4" { if (Confirm-Action "Truncate Billing seed data?") { Run-WSL "database/seed-down.sh" "billing-service" }; return }
            "5" { if (Confirm-Action "Truncate Session seed data?") { Run-WSL "database/seed-down.sh" "session-service" }; return }
            "6" { if (Confirm-Action "Truncate Analytics seed data?") { Run-WSL "database/seed-down.sh" "analytics-service" }; return }
            "7" { if (Confirm-Action "Truncate Notification seed data?") { Run-WSL "database/seed-down.sh" "notification-service" }; return }
            "0" { return }
        }
    }
}

function Sub-Troubleshoot {
    while ($true) {
        Show-Header "TROUBLESHOOTING & DIAGNOSTICS"
        Write-MenuItem "1" "Docker status"                                      Cyan
        Write-MenuItem "2" "WSL + Ubuntu path health"                           Cyan
        Write-MenuItem "3" "Auto-Fix DB Network (Map LAN IP to local .env)"     Green
        Write-MenuItem "4" "Open WSL shell (external window)"                  Yellow
        Write-MenuItem "5" "Environment variables summary"                      White
        Write-Host ""
        Show-Separator
        Write-MenuItem -IsBack
        Write-Host ""
        $c = Get-Key
        switch ($c) {
            "1" { Check-Docker }
            "2" { Check-WSL }
            "3" { Fix-Database-Networking }
            "4" { Open-UbuntuShell }
            "5" { Show-EnvInfo }
            "0" { return }
        }
    }
}

function Check-Docker {
    Write-Host ""
    Write-Host " [*] Checking Docker..." -ForegroundColor Cyan -NoNewline
    $info = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK - Daemon running" -ForegroundColor Green
        $containers = docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}" 2>$null
        if ($containers) {
            Write-Host ""
            Write-Host " Active containers:" -ForegroundColor Yellow
            $containers | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
        } else {
            Write-Host " (No containers active)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host " FAIL — Verify Docker Desktop daemon is started." -ForegroundColor Red
    }
    Pause-Key
}

function Check-WSL {
    Write-Host ""
    Write-Host " [*] Registered WSL distributions:" -ForegroundColor Cyan
    wsl --list --verbose 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
    Write-Host ""
    Write-Host " [*] WSL project mount alignment:" -ForegroundColor Cyan
    $wslRoot = Get-WslRoot
    Write-Host "  Windows : $ProjectRoot" -ForegroundColor Yellow
    Write-Host "  WSL     : $wslRoot"     -ForegroundColor Green
    $exists = wsl -d Ubuntu bash -c "[ -d '$wslRoot' ] && echo 'OK' || echo 'MISSING'" 2>$null
    $color  = if ($exists -match "OK") { "Green" } else { "Red" }
    Write-Host "  Mount result: $exists" -ForegroundColor $color
    Pause-Key
}

function Open-UbuntuShell {
    Write-Host ""
    Write-Host " [*] Launching Ubuntu shell at project root..." -ForegroundColor Cyan
    $WslRoot = Get-WslRoot
    $BashCmd = "cd '$WslRoot' && exec bash"
    Open-UbuntuTerminal -BashCommand $BashCmd
    Start-Sleep -Milliseconds 500
}

function Show-EnvInfo {
    Write-Host ""
    Write-Host " Environment Details:" -ForegroundColor Cyan
    Write-Host "  ProjectRoot (Windows) : $ProjectRoot"                           -ForegroundColor Yellow
    Write-Host "  ProjectRoot (WSL)     : $(Get-WslRoot)"                        -ForegroundColor Green
    Write-Host "  PowerShell Version    : $($PSVersionTable.PSVersion)"          -ForegroundColor White
    Write-Host "  OS Version            : $([System.Environment]::OSVersion.VersionString)" -ForegroundColor White
    Write-Host "  Windows Terminal (wt) : $(if (Get-Command 'wt' -ErrorAction SilentlyContinue) { 'Yes' } else { 'No' })" -ForegroundColor White
    Pause-Key
}

function Fix-Database-Networking {
    Write-Host ""
    Write-Host " [*] Locating local LAN IP address..." -ForegroundColor Cyan -NoNewline

    $ipObj = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
             Where-Object { $_.InterfaceAlias -match "Wi-Fi|Ethernet|WLAN" } |
             Select-Object -First 1

    $ip = if ($null -ne $ipObj) { $ipObj.IPAddress } else { "127.0.0.1" }
    Write-Host " $ip" -ForegroundColor Green

    if (Confirm-Action "Update all backend .env files: DB_HOST -> $ip?") {
        $envFiles = Get-ChildItem -Path "$ProjectRoot\backend" -Filter ".env" -Recurse -ErrorAction SilentlyContinue
        $count = 0
        foreach ($f in $envFiles) {
            $content    = Get-Content $f.FullName -Raw
            $newContent = $content -replace "DB_HOST=localhost",    "DB_HOST=$ip" `
                                   -replace "DB_HOST=127\.0\.0\.1", "DB_HOST=$ip"
            if ($newContent -ne $content) {
                Set-Content -Path $f.FullName -Value $newContent -NoNewline
                Write-Host "  [OK] $($f.FullName)" -ForegroundColor Green
                $count++
            }
        }
        Write-Host ""
        if ($count -gt 0) {
            Write-Host " [OK] Updated $count .env file(s). Restart backend." -ForegroundColor Green
        } else {
            Write-Host " [INFO] All .env configurations aligned. No modifications required." -ForegroundColor Yellow
        }
    }
    Pause-Key
}

function Show-MainMenu {
    Show-Header
    Show-Separator "BACKEND (WSL)"
    Write-MenuItem "1" "Start System"     Green
    Write-MenuItem "2" "Stop System"      Yellow
    Write-MenuItem "3" "Reset Project"    Red
    Write-MenuItem "4" "Health Check"     Magenta
    Write-MenuItem "5" "System Logs"      Cyan
    Write-MenuItem "6" "Testing Suite"    White
    Write-MenuItem "7" "Seed Databases"   Magenta

    Write-Host ""
    Show-Separator "FRONTEND (PS)"
    Write-MenuItem "S" "Setup Environment" Green
    Write-MenuItem "R" "Run Dev Server"    Green
    Write-MenuItem "B" "Build Production"  Yellow
    Write-MenuItem "T" "Run Tests"         Yellow

    Write-Host ""
    Show-Separator "TOOLS"
    Write-MenuItem "U" "Troubleshooting"   Cyan
    Write-MenuItem "W" "Open Ubuntu Shell" DarkYellow

    Write-Host ""
    Show-Separator
    Write-MenuItem -IsQuit
    Write-Host ""
    Write-Host "  [?] Choice: " -NoNewline
}

try {
    while ($true) {
        Show-MainMenu
        $Choice = Get-Key

        if ($Choice -eq "0" -or $Choice -eq "q") { break }

        switch ($Choice) {
            "1" { Sub-Start }
            "2" { Sub-Stop }
            "3" { Sub-Reset }
            "4" { Run-WSL "health-check.sh" }
            "5" { Sub-Logs }
            "6" { Sub-Testing }
            "7" { Sub-Seeding }
            "s" { Run-Frontend "setup.ps1" }
            "r" { Run-Frontend "run.ps1" }
            "b" { Run-Frontend "build.ps1" }
            "t" { Run-Frontend "test.ps1" }
            "u" { Sub-Troubleshoot }
            "w" {
                Open-UbuntuTerminal -BashCommand "cd '$(Get-WslRoot)' && exec bash"
            }
        }
    }
}
finally {
    Set-Location $OriginalPath
    try { [Console]::Clear() } catch {}
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "  Manager session closed.                                               " -ForegroundColor Cyan -BackgroundColor DarkBlue
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host ""
}
