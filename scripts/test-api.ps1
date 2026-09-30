# API smoke test: starts the server, exercises the key endpoints, then stops it.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # hide Invoke-WebRequest progress noise
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
    $alumniLogin = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"alumni","password":"alumni123"}'
    $alumniHeaders = @{ Authorization = "Bearer $($alumniLogin.token)" }
    $registrarLogin = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"registrar","password":"registrar123"}'
    $registrarHeaders = @{ Authorization = "Bearer $($registrarLogin.token)" }

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

    # The Registrar owns alumni records; Admin has oversight only. Unique name avoids 409 on re-runs.
    $qaStamp = Get-Date -Format 'MMddHHmmss'
    $created = Invoke-RestMethod 'http://localhost:3000/api/alumni' -Method Post -Headers $registrarHeaders -ContentType 'application/json' -Body (@{ name = "Test Graduate $qaStamp"; batch = '2025'; program = 'SHS'; status = 'Employed'; company = 'ACME Corp'; title = 'HR Associate' } | ConvertTo-Json -Compress)
    $newAlumniId = $created.alumni.id
    ShowResponse 'POST /api/alumni (create, Registrar)' @{ id = $newAlumniId; name = $created.alumni.name; verificationStatus = $created.alumni.verificationStatus }

    ShowResponse 'GET /api/reports/summary' (Invoke-RestMethod 'http://localhost:3000/api/reports/summary' -Headers $headers)

    ShowResponse 'GET /api/reports/operational' (Invoke-RestMethod 'http://localhost:3000/api/reports/operational' -Headers $headers)

    ShowResponse 'POST /api/notifications (log)' (
        Invoke-RestMethod 'http://localhost:3000/api/notifications' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"channel":"SMS","recipient":"Test Alumnus","subject":"Sweep reminder","message":"Please update your profile."}'
    )

    ShowResponse 'GET /api/notifications (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/notifications' -Headers $headers).notifications.Count
    }

    # Events start empty (no demo seed), so create one and RSVP against its real id.
    $event = Invoke-RestMethod 'http://localhost:3000/api/events' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"API Test Event","date":"2026-01-10","location":"SAA Gym"}'
    $eventId = $event.event.id
    ShowResponse "POST /api/events/$eventId/rsvp" (
        Invoke-RestMethod "http://localhost:3000/api/events/$eventId/rsvp" -Method Post -Headers $headers
    )

    ShowResponse 'GET /api/transcripts (list count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/transcripts' -Headers $headers).requests.Count
    }

    # Document requests are free: alumni submit and Registrar staff review them.
    $transcript = Invoke-RestMethod 'http://localhost:3000/api/transcripts' -Method Post -Headers $alumniHeaders -ContentType 'application/json' -Body '{"purpose":"Employment","type":"Transcript of Records","delivery":"Pick-up at Registrar Window","copies":1}'
    $transcriptId = $transcript.request.id
    ShowResponse 'POST /api/transcripts (create)' @{ id = $transcriptId; status = $transcript.request.status }

    $approved = Invoke-RestMethod "http://localhost:3000/api/transcripts/$transcriptId/status" -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Approved"}'
    ShowResponse 'PUT /api/transcripts/:id/status (Registrar review)' @{ id = $approved.request.id; status = $approved.request.status }

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

    ShowResponse 'GET /api/alumni?recordStatus=Pending Verification (count)' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/alumni?recordStatus=Pending%20Verification' -Headers $headers).alumni.Count
    }

    ShowResponse 'GET /api/alumni/:id' @{
        status = (Invoke-WebRequest ("http://localhost:3000/api/alumni/$newAlumniId") -Headers $headers -UseBasicParsing).StatusCode
    }

    ShowResponse 'PUT /api/alumni/:id (Registrar)' (
        Invoke-RestMethod ("http://localhost:3000/api/alumni/$newAlumniId") -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Unemployed"}'
    )

    # A record is archived first; only then can the Admin delete it permanently.
    ShowResponse 'POST /api/alumni/:id/archive (admin)' @{
        verificationStatus = (Invoke-RestMethod ("http://localhost:3000/api/alumni/$newAlumniId/archive") -Method Post -Headers $headers).alumni.verificationStatus
    }

    ShowResponse 'DELETE /api/alumni/:id (admin, archived record)' @{
        status = (Invoke-WebRequest ("http://localhost:3000/api/alumni/$newAlumniId") -Method Delete -Headers $headers -UseBasicParsing).StatusCode
    }

    ShowResponse 'GET /api/events' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/events' -Headers $headers).events.Count
    }

    ShowResponse 'POST /api/events (admin)' (
        Invoke-RestMethod 'http://localhost:3000/api/events' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"API Test Event","date":"2026-01-10","location":"SAA Gym"}'
    )

    # Document requests are free of charge: the Alumni submits, the Registrar works the status board.
    $reprint = Invoke-RestMethod 'http://localhost:3000/api/reprints' -Method Post -Headers $alumniHeaders -ContentType 'application/json' -Body '{"type":"Diploma Reprint","reason":"Lost","copies":1}'
    $reprintId = $reprint.reprint.id
    ShowResponse 'POST /api/reprints (alumni, free of charge)' @{ id = $reprintId; status = $reprint.reprint.status }

    $reprintApproved = Invoke-RestMethod "http://localhost:3000/api/reprints/$reprintId/status" -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Approved"}'
    $reprintProcessing = Invoke-RestMethod "http://localhost:3000/api/reprints/$reprintId/status" -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Processing"}'
    $reprintReady = Invoke-RestMethod "http://localhost:3000/api/reprints/$reprintId/status" -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Ready for Release"}'
    $reprintCompleted = Invoke-RestMethod "http://localhost:3000/api/reprints/$reprintId/status" -Method Put -Headers $registrarHeaders -ContentType 'application/json' -Body '{"status":"Completed"}'
    ShowResponse 'PUT /api/reprints/:id/status (Registrar workflow)' @{
        approved   = $reprintApproved.reprint.status
        processing = $reprintProcessing.reprint.status
        ready      = $reprintReady.reprint.status
        completed  = $reprintCompleted.reprint.status
    }

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
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/newsletters' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"API Test Newsletter","subject":"API Test Newsletter","body":"Verification body"}')
    }

    # Feedback is an Alumni submission; the Registrar and Admin process it afterwards.
    ShowResponse 'GET/POST /api/feedback' @{
        total = (Invoke-RestMethod 'http://localhost:3000/api/feedback' -Headers $headers).feedback.Count
        created = [bool](Invoke-RestMethod 'http://localhost:3000/api/feedback' -Method Post -Headers $alumniHeaders -ContentType 'application/json' -Body '{"rating":5,"recommendationRating":9,"category":"Alumni Portal","message":"API verification","improvement":"Faster document processing"}')
    }

    # Self-registration is open to Senior High School graduates; the account is removed again.
    $qaUsername = "qa$((Get-Random -Minimum 1000 -Maximum 9999))"
    $qaRegistration = Invoke-RestMethod 'http://localhost:3000/api/auth/register' -Method Post -ContentType 'application/json' -Body (@{
        username       = $qaUsername
        password       = 'secret123'
        name           = 'QA Registrant'
        batch          = '2026'
        email          = "$qaUsername@stagnes.edu.ph"
        contact        = '09171234567'
        educationLevel = 'SHS'
        track          = 'Academic'
        strand         = 'STEM'
        consent        = $true
    } | ConvertTo-Json -Compress)
    ShowResponse 'POST /api/auth/register (SHS self-registration)' @{
        level               = $qaRegistration.user.educationLevel
        track               = $qaRegistration.user.track
        strand              = $qaRegistration.user.strand
        pendingVerification = $qaRegistration.pendingVerification
    }
    ShowResponse 'DELETE /api/users/:id (cleanup self-registration)' @{
        status = (Invoke-WebRequest ("http://localhost:3000/api/users/$($qaRegistration.user.id)") -Method Delete -Headers $headers -UseBasicParsing).StatusCode
    }

    Write-Host 'Smoke test covers health, auth, alumni records, documents and reprints, placements, tracking, reports, notifications, events, reunions, donations, newsletters, feedback and users.'
    Write-Host 'AI endpoints are covered in detail by scripts/test-ai.ps1.'
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}