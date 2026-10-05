$ErrorActionPreference = 'Stop'
$tcRoot = [IO.Path]::GetFullPath($PSScriptRoot)
if ((Get-Item -LiteralPath $tcRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point root not allowed' }
$tcManifest = Get-Content -LiteralPath (Join-Path $tcRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($tcManifest.schema -ne 'tc301-lab-bundle-v1') { throw 'Unknown lab manifest' }
$tcPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $tcManifest.files) {
    if ($entry.path -match '(^/|\\|(^|/)\.\.(/|$)|:)') { throw 'Unsafe manifest path' }
    if (-not $tcPaths.Add($entry.path)) { throw 'Duplicate manifest path' }
    $target = [IO.Path]::GetFullPath((Join-Path $tcRoot $entry.path))
    if (-not $target.StartsWith($tcRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside bundle' }
    $cursor = Get-Item -LiteralPath $target -Force
    if ($cursor.PSIsContainer) { throw 'Expected regular file' }
    $length = $cursor.Length
    while ($null -ne $cursor -and $cursor.FullName -ne $tcRoot) {
        if ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point not allowed' }
        if ($cursor -is [IO.FileInfo]) { $cursor = $cursor.Directory } else { $cursor = $cursor.Parent }
    }
    $target = Join-Path $tcRoot $entry.path
    if ($length -ne $entry.bytes -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        throw ('Integrity failure: ' + $entry.path)
    }
}
$tcEntries = Get-ChildItem -LiteralPath $tcRoot -Recurse -Force
if ($tcEntries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Unexpected reparse point' }
if (@($tcEntries | Where-Object { -not $_.PSIsContainer }).Count -ne ($tcPaths.Count + 1)) { throw 'Unexpected files in bundle' }
Write-Output ('Verified ' + $tcManifest.files.Count + ' files; source commit ' + $tcManifest.source_commit)
Write-Output 'Integrity only: use the authenticated GitHub run to establish provenance. Nothing was executed or installed.'
