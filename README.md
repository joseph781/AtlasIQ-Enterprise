# 🌐 AtlasIQ Enterprise v4.0 — Autonomous Geo-Revenue OS
### Motor Autónomo de Barrido Geo-Grid RPC, Enriquecimiento Deep OSINT, IA Híbrida & CRM Ejecutivo para Google Maps
*Creado por **Joseph Castillo (CEO)** para **WINDOWSTELECOM** · Arquitectura Silicon Valley Principal Grade*

---

## 🚀 Qué hay de nuevo en v4.0 ("Autonomous Geo-Revenue OS")

AtlasIQ salta de un raspador tradicional a un **Sistema Operativo de Ingresos Geoespaciales B2B** adaptado a las plataformas tecnológicas de 2026, manteniendo instalación directa **Zero-Build (`Load unpacked`)** en Google Chrome:

1. **Barrido Autónomo por Matriz Geo-Grid (`Simple`, `2x2`, `3x3`, `4x4`)**: Rompe el techo duro de ~120 resultados de Google Maps subdividiendo automáticamente la ciudad o zona actual en hasta **16 sub-cuadrantes geodésicos** y deduplicando por `Place ID` / `CID`.
2. **Deep RPC & Protobuf Harvester (20+ Campos)**: Intercepta en mundo `MAIN` (`injected.js`) paquetes `search_feed`, `place_detail` y `listugcposts` para detectar **Fichas No Reclamadas (`unclaimed`)**, rango de precios, estado de apertura, plataformas de reservas/delivery (Calendly, Doctoralia, Booksy, OpenTable, Rappi, PedidosYa, UberEats) y dolores recurrentes en reseñas negativas.
3. **Motor Offscreen DOMParser + OSINT Fiscal (`offscreen.html` + `js/mybg.js`)**: Procesa HTML real y grafos `Schema.org` (`application/ld+json`) con semáforo de concurrencia y caché persistente de 7 días para extraer **Razón Social (`legalName`), ID Fiscal (`CIF/NIF/RFC/RIF/NIT/RUC/CUIT`), Decisores/Fundadores**, 26+ firmas de Tech Stack y **gasto publicitario activo** (`Meta Pixel`, `Google Ads`, `TikTok Pixel`, `LinkedIn Insight`).
4. **Chrome Native Side Panel Copilot (`sidepanel.html`)**: Panel lateral nativo de Chrome junto a Google Maps con KPIs en tiempo real, disparo remoto de Geo-Grid y tarjetas de WhatsApp en 1 clic.
5. **AtlasDB IndexedDB + ECharts BI + Spatial Index $O(N)$ (`js/db.js`, `js/dashboard.js`)**: Escalabilidad para **100,000+ prospectos**, índice espacial por celdas $O(N)$, 4 vistas analíticas (incluyendo **Inteligencia BI & Mercado con Apache ECharts**), auditoría **Google PageSpeed Insights v5 Móvil** en vivo y verificación cibernética **Cloudflare DoH (MX + SPF + DMARC)**.
6. **IA Híbrida 2026 (`gemini-2.5-flash` + Chrome Built-in Gemini Nano `$0`)**: Secuenciador omnicanal de 5 pestañas (`WA Toque 1`, `Seguimiento 48h`, `Email Frío`, `Llamada 30s` y `Gemini 2.5 IA` con cabecera segura `x-goog-api-key` y fallback local gratuito en Chrome).
7. **Licenciamiento Criptográfico Asimétrico Zero-Knowledge (`ECDSA P-256`) + Micrositios con Tracking**: Cero secretos privados en el cliente (`js/license.js` solo contiene la clave pública JWK). El generador privado y el Cloudflare Worker (`admin-server/`) permiten emitir licencias `ATQ4.`, revocar asientos en vivo y publicar **Micrositios B2B Marca Blanca con tracking de lectura**.
8. **Servidor Nativo MCP (`mcp-server/atlasiq-mcp.mjs`)**: Conecta los prospectos de AtlasIQ directamente con **Antigravity, Claude Desktop, Cursor o Windsurf**.

---

## 📁 Estructura del Proyecto (Separación Estricta Cliente vs Admin)

```text
AtlasIQ-Enterprise-v2.5/
├── manifest.json                 # Chrome Manifest V3 v4.0.0 (CSP estricto script-src 'self')
├── injected.js                   # Interceptor MAIN world (search_feed, place_detail, reviews)
├── contentScript.js              # Deep Harvester + Geo-Grid Sweeper (1x1..4x4) + Dock flotante
├── offscreen.html / js/offscreen.js # Parser DOMParser nativo MV3 para JSON-LD Schema.org y OSINT
├── sidepanel.html / js/sidepanel.js # Copiloto lateral nativo en vivo junto a Google Maps
├── dashboard.html / js/dashboard.js # CRM 4 vistas: Tabla OSINT, Mapa Calor, Kanban y ECharts BI
├── popup.html / js/popup.js      # Lanzador ejecutivo rápido en barra de Chrome
├── js/
│   ├── db.js                     # Motor IndexedDB AtlasDB (100k+ prospectos + caché de dominios)
│   ├── mybg.js                   # Service Worker con semáforo 4x, OSINT y 26+ firmas Tech/Pixels
│   ├── util.js                   # Scoring v4.0, Gemini 2.5/Nano, PageSpeed v5, DoH MX/SPF/DMARC, PDF
│   ├── license.js                # Verificador público ECDSA P-256 (0 secretos expuestos)
│   └── theme-init.js / guide-ui.js # Preloaders de tema compatibles con CSP MV3
├── admin-server/                 # 🔒 PRIVADO (NUNCA ENVIAR AL CLIENTE)
│   ├── keygen.html               # Panel visual offline ECDSA P-256 para emitir licencias ATQ4.
│   ├── keygen.js                 # Generador CLI Node.js de licencias firmadas
│   └── cloudflare-license-worker.js # Worker Edge: control de asientos KV + Micrositios con tracking
├── mcp-server/
│   └── atlasiq-mcp.mjs           # Servidor MCP stdio sin dependencias para agentes de IA
└── package-client.ps1            # Empaquetador limpio -> AtlasIQ-Enterprise-v4.0-Client.zip
```

---

## 🛠️ Instalación Rápida en Google Chrome

1. Abre `chrome://extensions/` en Google Chrome.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona esta carpeta (o el contenido de `AtlasIQ-Enterprise-v4.0-Client.zip`).
4. Abre **Google Maps**, busca cualquier nicho (ej. `"Clínicas dentales en Madrid"`), elige el modo de barrido (`Simple`, `2x2`, `3x3` o `4x4`) en el dock flotante o en el **Side Panel Copilot** y pulsa **Iniciar**.

---

## 🔐 Emisión de Licencias ECDSA P-256 (Uso Exclusivo WINDOWSTELECOM)

Para generar una licencia vinculada al hardware de un cliente (`ATQ-DEV-XXXX-XXXX-XXXX`) o una llave corporativa multi-equipo (`ANY-ENTERPRISE-SEAT`):

- **Opción Visual (Navegador):** Abre `admin-server/keygen.html` en tu navegador.
- **Opción Terminal (Node.js):**
  ```powershell
  node admin-server/keygen.js "ATQ-DEV-7F82-93A1-C4E2" "Agencia Cliente" 365
  ```

## 📦 Generar ZIP Limpio para Clientes

Ejecuta en PowerShell:
```powershell
.\package-client.ps1
```
Esto crea `AtlasIQ-Enterprise-v4.0-Client.zip` excluyendo automáticamente `admin-server/`, `mcp-server/` y cualquier archivo privado.

---

## 👨‍💻 Autoría
- **Creador y Arquitecto:** Joseph Castillo (CEO)
- **Respaldo Corporativo:** WINDOWSTELECOM
