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

    $created = Invoke-RestMethod 'http://localhost:3000/api/alumni' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"Test Graduate","batch":"2025","program":"BS Psychology","status":"Employed","company":"ACME Corp","title":"HR Associate"}'
    $newAlumniId = $created.alumni.id
    ShowResponse 'POST /api/alumni (create, admin)' @{ id = $newAlumniId; name = $created.alumni.name }

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

    ShowResponse 'GET /api/alumni/:id' @{
        status = (Invoke-WebRequest ("http://localhost:3000/api/alumni/$newAlumniId") -Headers $headers -UseBasicParsing).StatusCode
    }

    ShowResponse 'PUT /api/alumni/:id (admin)' (
        Invoke-RestMethod ("http://localhost:3000/api/alumni/$newAlumniId") -Method Put -Headers $headers -ContentType 'application/json' -Body '{"status":"Unemployed"}'
    )

    ShowResponse 'DELETE /api/alumni/:id (admin)' @{
        status = (Invoke-WebRequest ("http://localhost:3000/api/alumni/$newAlumniId") -Method Delete -Headers $headers -UseBasicParsing).StatusCode
    }

    ShowResponse 'GET /api/events' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/events' -Headers $headers).events.Count
    }

    ShowResponse 'POST /api/events (admin)' (
        Invoke-RestMethod 'http://localhost:3000/api/events' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"API Test Event","date":"2026-01-10","location":"SAA Gym"}'
    )

    ShowResponse 'POST /api/reprints' (
        Invoke-RestMethod 'http://localhost:3000/api/reprints' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"Test Graduate","type":"Diploma Copy"}'
    )

    ShowResponse 'PUT /api/reprints/1/status' (
        Invoke-RestMethod 'http://localhost:3000/api/reprints/1/status' -Method Put -Headers $headers -ContentType 'application/json' -Body '{"status":"Approved"}'
    )

    ShowResponse 'POST /api/placements (admin)' (
        Invoke-RestMethod 'http://localhost:3000/api/placements' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"alumni":"Test Graduate","company":"ACME Corp","title":"HR Associate"}'
    )

    ShowResponse 'GET/POST /api/reunions' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/reunions' -Headers $headers).reunions.Count
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/reunions' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"batch":"Batch Test","date":"2026-02-01","venue":"SAA Hall","coordinators":"QA"}')
    }

    ShowResponse 'GET/POST /api/donations' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/donations' -Headers $headers).donations.Count
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/donations' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"campaign":"API Test Fund","donor":"QA","amount":1000}')
    }

    ShowResponse 'GET/POST /api/newsletters' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/newsletters' -Headers $headers).newsletters.Count
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/newsletters' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"subject":"API Test Newsletter","body":"Verification body"}')
    }

    ShowResponse 'GET/POST /api/feedback' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/feedback' -Headers $headers).feedback.Count
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/feedback' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"QA","rating":5,"category":"Systems","message":"API verification"}')
    }

    ShowResponse 'POST /api/auth/register (self-registration)' (
        Invoke-RestMethod 'http://localhost:3000/api/auth/register' -Method Post -ContentType 'application/json' -Body ("{""username"":""qa" + (Get-Random -Minimum 1000 -Maximum 9999) + """,""password"":""secret123"",""name"":""QA Registrant"",""batch"":""2026""}")
    )

    Write-Host 'Total API endpoints: ai(6) + alumni(5) + auth(4) + documents(8) + engagement(13) + reports(4) + tracking(4) + health(1) = 45.'
    Write-Host 'AI endpoints are covered in detail by scripts/test-ai.ps1.'
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}