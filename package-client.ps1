# WINDOWSTELECOM - AtlasIQ Enterprise v4.0 Clean Client Packager (.NET Fast Zip)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutZip = Join-Path $RootDir "AtlasIQ-Enterprise-v4.0-Client.zip"
$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("atlasiq_v4_stage_" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $StageDir | Out-Null

$ClientItems = @(
    "manifest.json",
    "bg.js",
    "injected.js",
    "contentScript.js",
    "offscreen.html",
    "sidepanel.html",
    "dashboard.html",
    "popup.html",
    "index.html",
    "css",
    "js",
    "lib",
    "icons"
)

foreach ($item in $ClientItems) {
    $src = Join-Path $RootDir $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $StageDir $item) -Recurse -Force
    }
}

if (Test-Path $OutZip) {
    Remove-Item $OutZip -Force
}

$ZipArchive = [System.IO.Compression.ZipFile]::Open($OutZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $BaseLen = $StageDir.TrimEnd('\', '/').Length + 1
    Get-ChildItem -Path $StageDir -Recurse -File | ForEach-Object {
        $EntryName = $_.FullName.Substring($BaseLen).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($ZipArchive, $_.FullName, $EntryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $ZipArchive.Dispose()
}
Remove-Item -Path $StageDir -Recurse -Force

$SizeMB = [Math]::Round((Get-Item $OutZip).Length / 1MB, 2)
Write-Host "[OK] Paquete de cliente actualizado ($SizeMB MB): $OutZip" -ForegroundColor Green
