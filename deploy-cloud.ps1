param(
    [string]$CommitMessage = "release(v4.0): AtlasIQ Enterprise Extreme + CRM Cloud & Georadar",
    [switch]$SkipGitHub,
    [switch]$SkipCloudflare
)

# ==============================================================================
# WINDOWSTELECOM — AtlasIQ Enterprise v4.0 Direct Cloud & GitHub Deployer
# Publica desde tu PC directo a:
#   1. GitHub (https://github.com/joseph781/AtlasIQ-Enterprise - código limpio sin llaves)
#   2. Cloudflare Pages (atlasiq-crm -> https://atlasiq.windowstelecom.com/ + Bóveda Cifrada)
# ==============================================================================

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " 🚀 WINDOWSTELECOM — DESPLIEGUE AUTOMATICO CLOUD & GITHUB" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 1. Empaquetar ZIPs actualizados (Cliente Chrome + Backup Producción Cloudflare)
Write-Host "[1/4] Generando paquetes ZIP actualizados..." -ForegroundColor Yellow
& (Join-Path $RootDir "package-cloudflare.ps1")

# 2. Escaneo de seguridad antes de tocar GitHub
if (-not $SkipGitHub) {
    Write-Host "`n[2/4] Ejecutando auditoría de seguridad anti-fugas para GitHub..." -ForegroundColor Yellow
    git add -A

    $StagedFiles = git diff --cached --name-only
    foreach ($f in $StagedFiles) {
        if ($f -like "admin-server/*" -or $f -like "wt-vault-*") {
            git reset | Out-Null
            throw "ALERTA DE SEGURIDAD: Se bloqueó el archivo sensible '$f' antes de subir a GitHub."
        }
        if ((Test-Path $f -PathType Leaf) -and ($f -ne "deploy-cloud.ps1")) {
            $raw = [System.IO.File]::ReadAllText((Join-Path $RootDir $f))
            if ($raw -match '"d"\s*:\s*"[A-Za-z0-9_-]{40,}"' -or $raw.Contains("PRIVATE_JWK")) {
                git reset | Out-Null
                throw "ALERTA DE SEGURIDAD: Se detectó una llave privada ECDSA en '$f'. Subida cancelada."
            }
        }
    }
    Write-Host "✅ Auditoría aprobada: Cero llaves privadas o rutas secretas en GitHub." -ForegroundColor Green

    # 3. Commit & Push a GitHub (joseph781/AtlasIQ-Enterprise)
    Write-Host "`n[3/4] Sincronizando repositorio con GitHub (rama main)..." -ForegroundColor Yellow
    if ($StagedFiles) {
        git commit -m $CommitMessage
    } else {
        Write-Host "ℹ️ No hay cambios nuevos pendientes de commit." -ForegroundColor DarkGray
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Error al hacer git push origin main."
    }
    Write-Host "✅ Código respaldado en GitHub: https://github.com/joseph781/AtlasIQ-Enterprise" -ForegroundColor Green
}

# 4. Despliegue Directo a Cloudflare Pages (atlasiq-crm -> https://atlasiq.windowstelecom.com/)
if (-not $SkipCloudflare) {
    Write-Host "`n[4/4] Publicando en vivo hacia Cloudflare Pages (atlasiq-crm)..." -ForegroundColor Yellow
    $StageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("atlasiq_wrangler_live_" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $StageDir | Out-Null

    try {
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

        # Inyectar Bóveda Privada CEO Cifrada (solo en Cloudflare Edge, invisible en GitHub público)
        $VaultSlug = ([System.IO.File]::ReadAllText((Join-Path $RootDir "admin-server\vault-slug.txt"))).Trim()
        $VaultDir = Join-Path $StageDir $VaultSlug
        New-Item -ItemType Directory -Path $VaultDir | Out-Null
        Copy-Item -Path (Join-Path $RootDir "admin-server\cloud-vault-keygen.html") -Destination (Join-Path $VaultDir "index.html") -Force

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

        npx --no-install wrangler pages deploy $StageDir --project-name atlasiq-crm --branch main --commit-dirty=true
        if ($LASTEXITCODE -ne 0) {
            throw "Error durante wrangler pages deploy."
        }

        Write-Host "`n🎉 ¡PRODUCCIÓN EN VIVO ACTUALIZADA CON ÉXITO!" -ForegroundColor Green
        Write-Host "   🌐 Portal Oficial:   https://atlasiq.windowstelecom.com/" -ForegroundColor White
        Write-Host "   📊 Dashboard CRM:    https://atlasiq.windowstelecom.com/dashboard.html" -ForegroundColor White
        Write-Host "   🔐 Bóveda Secreta:   (Ver admin-server\CLOUD_VAULT_ACCESS.txt)`n" -ForegroundColor Yellow
    } finally {
        if (Test-Path $StageDir) {
            Remove-Item -Path $StageDir -Recurse -Force
        }
    }
}
