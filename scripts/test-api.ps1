# API smoke test: starts the server, exercises the key endpoints, then stops it.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot

$job = Start-Job -ScriptBlock {
    Set-Location $args[0]
    node server/index.js 2>&1
} -ArgumentList $root
Start-Sleep -Seconds 3

function ShowResponse($label, $result) {
    Write-Host "[$label]" -ForegroundColor Cyan
    $result | ConvertTo-Json -Depth 6 -Compress | Write-Host
    Write-Host ""
}

try {
    ShowResponse 'GET /api/health' (Invoke-RestMethod 'http://localhost:3000/api/health')

    $login = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
    ShowResponse 'POST /api/auth/login (bcrypt, admin)' @{ tokenPresent = [bool]$login.token }
    $token = $login.token
    $headers = @{ Authorization = "Bearer $token" }

    ShowResponse 'GET /api/auth/me' (Invoke-RestMethod 'http://localhost:3000/api/auth/me' -Headers $headers)

    $badStatus = 0
    try {
        Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"wrong"}'
    } catch {
        if ($_.Exception.Response.StatusCode.value__) {
            $badStatus = $_.Exception.Response.StatusCode.value__
        } else {
            $badStatus = $_.Exception.Response.StatusCode
        }
    }
    ShowResponse 'POST /api/auth/login (bad password)' @{ statusCode = $badStatus }

    $alumni = Invoke-RestMethod 'http://localhost:3000/api/alumni' -Headers $headers
    ShowResponse 'GET /api/alumni (count)' @{ total = $alumni.alumni.Count }

    ShowResponse 'POST /api/alumni (create, admin)' (
        Invoke-RestMethod 'http://localhost:3000/api/alumni' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"Test Graduate","batch":"2025","program":"BS Psychology","status":"Employed","company":"ACME Corp","title":"HR Associate"}'
    )

    ShowResponse 'GET /api/reports/summary' (Invoke-RestMethod 'http://localhost:3000/api/reports/summary' -Headers $headers)

    ShowResponse 'GET /api/reports/tracer-study (row count)' @{
        rows = (Invoke-RestMethod 'http://localhost:3000/api/reports/tracer-study' -Headers $headers).rows.Count
    }

    ShowResponse 'POST /api/notifications (log)' (
        Invoke-RestMethod 'http://localhost:3000/api/notifications' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"channel":"SMS","recipient":"Test Alumnus","subject":"Sweep reminder","message":"Please update your profile."}'
    )

    ShowResponse 'GET /api/notifications (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/notifications' -Headers $headers).notifications.Count
    }

    ShowResponse 'POST /api/events/1/rsvp' (
        Invoke-RestMethod 'http://localhost:3000/api/events/1/rsvp' -Method Post -Headers $headers
    )

    ShowResponse 'GET /api/transcripts (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/transcripts' -Headers $headers).requests.Count
    }

    ShowResponse 'PUT /api/transcripts/1/status' (
        Invoke-RestMethod 'http://localhost:3000/api/transcripts/1/status' -Method Put -Headers $headers -ContentType 'application/json' -Body '{"status":"Approved"}'
    )

    ShowResponse 'GET /api/reprints (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/reprints' -Headers $headers).reprints.Count
    }

    ShowResponse 'GET /api/reports/registrar' (Invoke-RestMethod 'http://localhost:3000/api/reports/registrar' -Headers $headers)

    ShowResponse 'GET /api/placements (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/placements' -Headers $headers).placements.Count
    }

    ShowResponse 'GET /api/tracking (summary)' (Invoke-RestMethod 'http://localhost:3000/api/tracking' -Headers $headers).summary

    ShowResponse 'GET /api/tracking/stale-profiles (count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/tracking/stale-profiles' -Headers $headers).staleProfiles.Count
    }

    ShowResponse 'POST /api/tracking/reminders/sweep' (Invoke-RestMethod 'http://localhost:3000/api/tracking/reminders/sweep' -Method Post -Headers $headers)

    ShowResponse 'GET /api/reports/tracer-study/download (CSV head)' (
        (Invoke-WebRequest 'http://localhost:3000/api/reports/tracer-study/download' -Headers $headers -UseBasicParsing).Content.Substring(0, 220)
    )

    Write-Host 'Total documented endpoints: auth(3) + alumni(5) + documents(8) + tracking(5) + engagement(11) + reports(4) + health(1) = 37.'
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}