# Extracts plain text from a .docx file (word/document.xml) to stdout/console.
param([Parameter(Mandatory = $true)][string]$Path)

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $Path)) { Write-Error "File not found: $Path"; exit 1 }

$zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
    if (-not $entry) { Write-Error 'No word/document.xml in archive.'; exit 2 }
    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    $xml = $reader.ReadToEnd()
    $reader.Close()

    # Turn paragraph/table-cell ends into newlines, then strip all tags.
    $xml = $xml -replace '</w:p>', "`n" -replace '</w:tr>', "`n" -replace '</w:tc>', "`t"
    $text = [System.Text.RegularExpressions.Regex]::Replace($xml, '<[^>]+>', '')
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    return $text
}
finally {
    $zip.Dispose()
}