# Verifies the OpenAI code path is genuinely exercised (with a dummy key the
# call reaches api.openai.com, fails auth, and falls back gracefully).
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'saa-ai-live.log'
Remove-Item $out -Force -ErrorAction SilentlyContinue
function Log($m) { Write-Host $m; Add-Content -Path $out -Value $m }

Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Start the server with a dummy key via the environment.
$job = Start-Job -ScriptBlock {
    Set-Location $args[0]
    $env:OPENAI_API_KEY = 'sk-dummy-key-for-path-verification'
    $env:OPENAI_TIMEOUT_MS = '8000'
    npm start *>&1
} -ArgumentList (Join-Path $root 'server')
Start-Sleep -Seconds 6

try {
    Receive-Job $job | ForEach-Object { Log ('    ' + $_) }
    Log ''

    $login = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
    $h = @{ Authorization = 'Bearer ' + $login.token }

    Log 'GET /api/health -> ai block'
    Log ('    ' + ((Invoke-RestMethod 'http://localhost:3000/api/health').ai | ConvertTo-Json -Compress))

    Log ''
    Log 'GET /api/ai/status'
    Log ('    ' + ((Invoke-RestMethod 'http://localhost:3000/api/ai/status' -Headers $h) | ConvertTo-Json -Compress))

    Log ''
    Log 'POST /api/ai/assistant (with dummy key -> should attempt OpenAI then fall back)'
    $a = Invoke-RestMethod 'http://localhost:3000/api/ai/assistant' -Method Post -Headers $h -ContentType 'application/json' -Body '{"query":"hello"}'
    Log ('    provider: ' + $a.provider)

    Log ''
    Log '--- server log (expect an OpenAI HTTP 401 warning) ---'
    Receive-Job $job | ForEach-Object { Log ('    ' + $_) }

    Log ''
    Log 'LIVE-PATH TEST COMPLETED'
}
catch { Log ('FAILED: ' + $_.Exception.Message) }
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}