# Verifies the documented run steps end-to-end (server + built React UI + login).
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'saa-run-check.log'
Remove-Item $out -Force -ErrorAction SilentlyContinue
function Log($m) { Write-Host $m; Add-Content -Path $out -Value $m }

Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$job = Start-Job -ScriptBlock {
    Set-Location $args[0]
    npm start *>&1
} -ArgumentList (Join-Path $root 'server')
Start-Sleep -Seconds 6

try {
    Log '--- server startup output (npm start) ---'
    Receive-Job $job | ForEach-Object { Log ('    ' + $_) }

    Log ''
    Log '--- live checks ---'
    $homePage = Invoke-WebRequest 'http://localhost:3000/' -UseBasicParsing
    Log ('GET  /              -> ' + $homePage.StatusCode + ' (' + $homePage.RawContentLength + ' bytes)')
    Log ('     react bundle    -> ' + ($homePage.Content -match 'assets/index-.*\.js'))

    Log ('GET  /api/health     -> ' + (Invoke-RestMethod 'http://localhost:3000/api/health').ok)

    $login = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
    Log ('POST /api/auth/login -> token issued: ' + [bool]$login.token + ', role: ' + $login.user.role)

    $h = @{ Authorization = 'Bearer ' + $login.token }
    Log ('GET  /api/alumni     -> ' + (Invoke-RestMethod 'http://localhost:3000/api/alumni' -Headers $h).alumni.Count + ' records')

    Write-Host ''
    Log 'RUN CHECK PASSED'
}
catch {
    Log ('FAILED: ' + $_.Exception.Message)
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}