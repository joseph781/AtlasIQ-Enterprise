# WINDOWSTELECOM - AtlasIQ Enterprise v4.0 Cloudflare Pages Production Packager
# Genera el paquete completo listo para subir en Cloudflare Pages (Direct Upload -> https://atlasiq.windowstelecom.com/)
# Incluye: Portal Oficial + Dashboard Cloud CRM + Descarga Limpia de Extension + Boveda Oculta CEO Cifrada (AES-256-GCM).

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Primero regeneramos el ZIP limpio de la extension Chrome para que vaya actualizado dentro del portal Cloud
& (Join-Path $RootDir "package-client.ps1")

$OutCloudZip = Join-Path $RootDir "AtlasIQ-Cloudflare-Production-v4.0.zip"
$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("atlasiq_cf_prod_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $StageDir | Out-Null

# 2. Copiar aplicacion web Cloud (index.html, dashboard.html, librerias y assets)
$WebItems = @(
    "index.html",
    "dashboard.html",
    "guia.html",
    "help.html",
    "popup.html",
    "sidepanel.html",
    "css",
    "js",
    "lib",
    "icons",
    "AtlasIQ-Enterprise-v4.0-Client.zip"
)

foreach ($item in $WebItems) {
    $src = Join-Path $RootDir $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $StageDir $item) -Recurse -Force
    }
}

# 3. Inyectar la Boveda Privada CEO Cifrada (AES-256-GCM) leyendo la ruta secreta local desde admin-server/vault-slug.txt
$VaultSlug = ([System.IO.File]::ReadAllText((Join-Path $RootDir "admin-server\vault-slug.txt"))).Trim()
$VaultDir = Join-Path $StageDir $VaultSlug
New-Item -ItemType Directory -Path $VaultDir | Out-Null
Copy-Item -Path (Join-Path $RootDir "admin-server\cloud-vault-keygen.html") -Destination (Join-Path $VaultDir "index.html") -Force

# 4. Crear archivo nativo _headers de Cloudflare Pages (Seguridad + Anti-Indexacion en Google/Bots para la boveda)
$HeadersContent = @"
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

/$VaultSlug/*
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
  Referrer-Policy: no-referrer
  Cache-Control: no-store, no-cache, must-revalidate, max-age=0
  X-Frame-Options: DENY
"@
[System.IO.File]::WriteAllText((Join-Path $StageDir "_headers"), $HeadersContent, [System.Text.UTF8Encoding]::new($false))

if (Test-Path $OutCloudZip) {
    Remove-Item $OutCloudZip -Force
}

$ZipArchive = [System.IO.Compression.ZipFile]::Open($OutCloudZip, [System.IO.Compression.ZipArchiveMode]::Create)
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

$SizeMB = [Math]::Round((Get-Item $OutCloudZip).Length / 1MB, 2)
Write-Host "🚀 Paquete de Produccion Cloudflare generado exitosamente ($SizeMB MB): $OutCloudZip" -ForegroundColor Cyan
