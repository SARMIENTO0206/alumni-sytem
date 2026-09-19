# Verifies the two front-ends served by the Express server:
#   /         -> React front-end (client/dist)
#   /classic  -> original vanilla HTML/CSS/JS app
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:TEMP 'saa-frontends.log'
Remove-Item $log -Force -ErrorAction SilentlyContinue

function Log($msg) { Write-Host $msg; Add-Content -Path $log -Value $msg }

$job = Start-Job -ScriptBlock { Set-Location $args[0]; node server/index.js 2>&1 } -ArgumentList $root
Start-Sleep -Seconds 3

try {
    Log '--- GET / (expect React build) ---'
    $rootHtml = (Invoke-WebRequest 'http://localhost:3000/' -UseBasicParsing).Content
    Log ('root div:       ' + ($rootHtml -match 'id="root"'))
    Log ('react bundle:   ' + ($rootHtml -match 'assets/index-.*\.js'))
    Log ('react css:      ' + ($rootHtml -match 'assets/index-.*\.css'))

    Log ''
    Log '--- GET /classic (expect vanilla app) ---'
    $classic = (Invoke-WebRequest 'http://localhost:3000/classic' -UseBasicParsing).Content
    Log ('loginForm:      ' + ($classic -match 'id="loginForm"'))
    Log ('js modules:     ' + ($classic -match 'js/config\.js'))

    Log ''
    Log '--- classic assets pass through ---'
    try {
        $css = Invoke-WebRequest 'http://localhost:3000/classic/style.css' -UseBasicParsing
        Log ('style.css:      ' + $css.StatusCode)
    } catch { Log 'style.css:      FAIL' }

    Log ''
    Log '--- source folders must NOT be exposed via /classic ---'
    foreach ($p in @('/classic/server/data/saa.db', '/classic/server/index.js', '/classic/client/package.json')) {
        try {
            $r = Invoke-WebRequest ('http://localhost:3000' + $p) -UseBasicParsing -ErrorAction Stop
            Log ($p + ' -> ' + $r.StatusCode + '  <-- LEAK!')
        } catch {
            Log ($p + ' -> blocked (expected)')
        }
    }

    Log ''
    Log '--- API used by the React client ---'
    Log ('health:         ' + (Invoke-RestMethod 'http://localhost:3000/api/health').ok)

    $login = Invoke-RestMethod 'http://localhost:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
    $h = @{ Authorization = 'Bearer ' + $login.token }
    Log ('login token:    ' + [bool]$login.token)
    Log ('reports/summary: ' + [bool](Invoke-RestMethod 'http://localhost:3000/api/reports/summary' -Headers $h).alumni)
    Log ('alumni list:     ' + (Invoke-RestMethod 'http://localhost:3000/api/alumni' -Headers $h).alumni.Count + ' rows')
    Log ('tracking:        ' + [bool](Invoke-RestMethod 'http://localhost:3000/api/tracking' -Headers $h).summary)
    Log ('transcripts:     ' + (Invoke-RestMethod 'http://localhost:3000/api/transcripts' -Headers $h).requests.Count + ' rows')
    Log ('events:          ' + (Invoke-RestMethod 'http://localhost:3000/api/events' -Headers $h).events.Count + ' rows')

    $csv = (Invoke-WebRequest 'http://localhost:3000/api/reports/tracer-study/download' -Headers $h -UseBasicParsing).Content
    Log ('tracer CSV head: ' + $csv.Substring(0, 60).Replace("`r", ' ').Replace("`n", ' '))
    Log ''
    Log 'ALL FRONT-END CHECKS COMPLETED'
}
finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}