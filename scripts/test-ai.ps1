# Exercises the five /api/ai endpoints (works with or without OPENAI_API_KEY).
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'saa-ai-test.log'
Remove-Item $out -Force -ErrorAction SilentlyContinue
function Log($m) { Write-Host $m; Add-Content -Path $out -Value $m }

Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

$job = Start-Job -ScriptBlock { Set-Location $args[0]; npm start *>&1 } -ArgumentList (Join-Path $root 'server')
Start-Sleep -Seconds 6

try {
    Receive-Job $job | ForEach-Object { Log ('    ' + $_) }
    Log ''

    $login = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
    $h = @{ Authorization = 'Bearer ' + $login.token }
    Log ('auth: token issued = ' + [bool]$login.token)
    Log ''

    Log '[1] GET /api/ai/status'
    Log ((Invoke-RestMethod 'http://localhost:3000/api/ai/status' -Headers $h) | ConvertTo-Json -Compress)

    Log ''
    Log '[2] POST /api/ai/assistant'
    $a = Invoke-RestMethod 'http://localhost:3000/api/ai/assistant' -Method Post -Headers $h -ContentType 'application/json' -Body '{"query":"How do I request my transcript?"}'
    Log ('    provider: ' + $a.provider)
    Log ('    response: ' + $a.response.Substring(0, [Math]::Min(140, $a.response.Length)))

    Log ''
    Log '[3] POST /api/ai/compose-announcement'
    $c = Invoke-RestMethod 'http://localhost:3000/api/ai/compose-announcement' -Method Post -Headers $h -ContentType 'application/json' -Body '{"topic":"Alumni Homecoming 2026","channel":"SMS"}'
    Log ('    provider: ' + $c.provider)
    Log ('    subject:  ' + $c.subject)
    Log ('    content:  ' + $c.content.Substring(0, [Math]::Min(120, $c.content.Length)))

    Log ''
    Log '[4] POST /api/ai/gmail-auto-reply'
    $g = Invoke-RestMethod 'http://localhost:3000/api/ai/gmail-auto-reply' -Method Post -Headers $h -ContentType 'application/json' -Body '{"from":"maria.santos@example.com","subject":"Transcript requirements","body":"Good day, what are the requirements to request my transcript? Thank you."}'
    Log ('    provider: ' + $g.provider + '   logged: ' + $g.logged)
    Log ('    reply:    ' + (($g.reply -split "`n")[0..2] -join ' / '))

    Log ''
    Log '[5] POST /api/ai/summarize-survey'
    $s = Invoke-RestMethod 'http://localhost:3000/api/ai/summarize-survey' -Method Post -Headers $h -ContentType 'application/json' -Body '{}'
    Log ('    provider: ' + $s.provider + '   responses: ' + $s.responses + '   avg: ' + $s.averageRating)
    Log ('    summary:  ' + (($s.summary -split "`n")[0..1] -join ' / '))

    Log ''
    Log '[6] POST /api/ai/dashboard-insights'
    $d = Invoke-RestMethod 'http://localhost:3000/api/ai/dashboard-insights' -Method Post -Headers $h -ContentType 'application/json' -Body '{}'
    Log ('    provider: ' + $d.provider)
    Log ('    metrics:  ' + ($d.metrics | ConvertTo-Json -Compress))
    Log ('    insight:  ' + (($d.insights -split "`n")[0..1] -join ' / '))

    Log ''
    Log '[7] auth guard: AI endpoint without token'
    try {
        Invoke-RestMethod 'http://localhost:3000/api/ai/assistant' -Method Post -ContentType 'application/json' -Body '{"query":"hi"}' | Out-Null
        Log '    UNEXPECTED: allowed without token'
    } catch { Log '    401 as expected' }

    Log ''
    Log 'AI TEST COMPLETED'
}
catch { Log ('FAILED: ' + $_.Exception.Message) }
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}