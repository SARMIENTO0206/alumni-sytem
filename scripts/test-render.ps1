# Headless render test for the React front-end (/) and the classic app (/classic).
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'saa-render.log'
Remove-Item $out -Force -ErrorAction SilentlyContinue
function Log($m) { Write-Host $m; Add-Content -Path $out -Value $m }

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { Log 'Edge not found - skipping render test.'; exit 0 }

$job = Start-Job -ScriptBlock { Set-Location $args[0]; node server/index.js 2>&1 } -ArgumentList $root
Start-Sleep -Seconds 3

function Render([string]$url, [string]$label) {
    $ud = Join-Path $env:TEMP ('saa-edge-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $ud | Out-Null
    $domFile = Join-Path $env:TEMP ('dom-' + [guid]::NewGuid().ToString('N') + '.html')
    $errFile = Join-Path $env:TEMP ('err-' + [guid]::NewGuid().ToString('N') + '.log')
    $args = @('--headless=new', '--disable-gpu', '--no-sandbox', ("--user-data-dir=" + $ud),
        '--virtual-time-budget=8000', '--dump-dom', $url)
    Start-Process -FilePath $edge -ArgumentList $args -Wait -NoNewWindow -RedirectStandardOutput $domFile -RedirectStandardError $errFile | Out-Null

    $dom = Get-Content $domFile -Raw -ErrorAction SilentlyContinue
    $errs = Get-Content $errFile -ErrorAction SilentlyContinue | Where-Object { $_ -match 'ReferenceError|TypeError|SyntaxError|Uncaught' }

    Log ("[" + $label + "] dom bytes: " + $dom.Length)
    Log ("[" + $label + "] react mounted: " + ($dom -match 'id="root"><div|auth-screen'))
    Log ("[" + $label + "] login heading: " + ($dom -match 'React Frontend|Sign In'))
    if ($errs) { Log ("[" + $label + "] JS ERRORS:"); $errs | Select-Object -First 5 | ForEach-Object { Log ('    ' + $_) } }
    else { Log ("[" + $label + "] no JS runtime errors") }
    Remove-Item $domFile, $errFile -Force -ErrorAction SilentlyContinue
}

try {
    Render 'http://localhost:3000/' 'React'
    Render 'http://localhost:3000/classic' 'Classic'
    Log ''
    Log 'RENDER TEST COMPLETED'
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}