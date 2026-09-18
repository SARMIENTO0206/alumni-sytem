# Splits the monolithic <script> block inside index.html into 8 modular JS files under js/.
# Ranges are 1-indexed inclusive line numbers of the ORIGINAL index.html.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $root 'index.html'
$lines = Get-Content -LiteralPath $htmlPath -Encoding UTF8

function Get-Range([int]$from, [int]$to) {
    return $lines[($from - 1)..($to - 1)]
}

function Write-Module([string]$file, [string]$header, [object[]]$ranges) {
    $out = New-Object System.Collections.Generic.List[string]
    $out.Add($header)
    foreach ($range in $ranges) {
        $out.Add('')
        $out.Add('/* ------------------------------------------------------------------------- */')
        $out.Add("/* Source: index.html lines $($range[0])-$($range[1]) */")
        $out.Add('/* ------------------------------------------------------------------------- */')
        $chunk = Get-Range $range[0] $range[1]
        foreach ($line in $chunk) { $out.Add($line) }
    }
    [System.IO.File]::WriteAllLines(
        (Join-Path (Join-Path $root 'js') $file),
        $out,
        (New-Object System.Text.UTF8Encoding($false))
    )
    Write-Host "Wrote js/$file ($($out.Count) lines)"
}

# 1. config.js - global state, seed data and demo accounts (lines 2990-3087)
Write-Module 'config.js' '/* config.js - Global application state, seed data and demo accounts (loaded first). */' @(
    ,@(2990,3087)
)

# 2. utils.js - toast system + localStorage sync helpers (lines 3088-3116)
Write-Module 'utils.js' '/* utils.js - Shared UI helpers: toasts, storage sync, DOM formatters. */' @(
    ,@(3088,3116)
)

# 3. auth.js - accounts, login/register, roles, session restore (lines 3117-3336)
Write-Module 'auth.js' '/* auth.js - Authentication, self-registration, role permissions and session handling. */' @(
    ,@(3117,3336)
)

# 4. navigation.js - view controller, digital ID, profile + page-level navigation (3337-3612, 5565-5624)
Write-Module 'navigation.js' '/* navigation.js - View routing (switchView), counters, digital ID, profile and page navigation. */' @(
    ,@(3337,3612)
    ,@(5565,5624)
)

# 5. records.js - alumni, transcripts, reprints, placements, academic records (3613-4017, 5139-5210)
Write-Module 'records.js' '/* records.js - Alumni database, document requests, transcripts, reprints, placements and academic records. */' @(
    ,@(3613,4017)
    ,@(5139,5210)
)

# 6. engagement.js - events, reunions, donations, resume, notifications engine, newsletter,
#    feedback and chatbot (4018-4710, 5054-5137, 5212-5227, 5477-5564)
Write-Module 'engagement.js' '/* engagement.js - Events, reunions, donations, resume, notifications, newsletter, feedback and assistant chat. */' @(
    ,@(4018,4710)
    ,@(5054,5137)
    ,@(5212,5227)
    ,@(5477,5564)
)

# 7. reports.js - tracking engine, stale profiles, SMS reminders, verification, registrar workflow,
#    charts and initialization (4712-5052, 5229-5374, 5376-5476, 5625-5650)
Write-Module 'reports.js' '/* reports.js - Graduate tracking, CHED tracer study, charts, registrar workflow and app initialization. */' @(
    ,@(4712,5052)
    ,@(5229,5374)
    ,@(5376,5476)
    ,@(5625,5650)
)

# Rebuild index.html: everything before the <script> block, then the 8 module tags, then the tail.
$scriptStart = 2989   # line number of "<script>"
$scriptEnd   = 5651   # line number of "</script>"

$head = Get-Range 1 ($scriptStart - 1)
$tail = Get-Range ($scriptEnd + 1) $lines.Count

$new = New-Object System.Collections.Generic.List[string]
foreach ($line in $head) { $new.Add($line) }
$new.Add('')
$new.Add('    <!-- Modular JavaScript (split from the original monolith) -->')
$new.Add('    <script src="js/config.js"></script>')
$new.Add('    <script src="js/api.js"></script>')
$new.Add('    <script src="js/utils.js"></script>')
$new.Add('    <script src="js/auth.js"></script>')
$new.Add('    <script src="js/navigation.js"></script>')
$new.Add('    <script src="js/records.js"></script>')
$new.Add('    <script src="js/engagement.js"></script>')
$new.Add('    <script src="js/reports.js"></script>')
foreach ($line in $tail) { $new.Add($line) }

[System.IO.File]::WriteAllLines($htmlPath, $new, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Rebuilt index.html ($($new.Count) lines)"
