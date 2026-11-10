# 🌐 AtlasIQ Enterprise v2.5.0
### Motor de Inteligencia Comercial B2B, Scraping RPC y CRM Predictivo para Google Maps
*Desarrollado con arquitectura de grado Silicon Valley por **Joseph Castillo (CEO)** para **WINDOWSTELECOM***

---

## 🚀 Resumen Ejecutivo

**AtlasIQ Enterprise** es una solución profesional para agencias, empresas de software, consultores y equipos comerciales B2B que transforma Google Maps en un canal automatizado de adquisición de clientes y prospección calificada.

A diferencia de los raspadores tradicionales que se rompen con cada cambio de diseño de Google Maps o que realizan llamadas lentas al DOM, AtlasIQ incorpora una **arquitectura de doble motor con intercepción nativa en capa de red (RPC/Protobuf en mundo MAIN)**, capaz de procesar cientos de prospectos por minuto con máxima velocidad, tasa de error cero y enriquecimiento técnico multicanal.

---

## 🌟 Capacidades de Grado Silicon Valley

### 1. Dual-Engine Interception (Red RPC + Fallback Semántico)
- **Intercepción de Red en Tiempo Real (`injected.js` en MAIN world)**: Escucha y deserializa directamente los paquetes Protobuf y JSON que Google Maps intercambia con sus servidores (`/search`, `/maps/rpc`, `batchexecute`).
- **Eliminación de Latencia y Fragilidad**: Obtiene identificadores oficiales como Place ID (`!1s...`), CID (`0x...`), coordenadas geográficas exactas, categorías oficiales, reseñas y horarios sin depender de nombres de clase ofuscados (`.Nv2PK`, `.qBF1Pd`).
- **Resilient DOM Fallback**: Algoritmo de respaldo con selectores semánticos que asegura el funcionamiento ininterrumpido en cualquier resolución o idioma.
- **Anti-Ban Smart Human Scrolling**: Desplazamiento orgánico con fluctuaciones temporales aleatorias (*jitter*) para evitar bloqueos y patrones robóticos.

### 2. Deep Enrichment & Multi-Channel Intelligence (`js/mybg.js`)
- **Detección y Decodificación de Emails Corporativos**:
  - Decodificación automática de correos protegidos por **Cloudflare** (`data-cfemail`).
  - Extracción de enlaces `mailto:` y expresiones regulares RFC 5322 con filtrado de falsos positivos (`.png`, `.jpg`, `.svg`, Sentry, Wix, etc.).
  - Priorización inteligente de correos con dominio propio (ej. `contacto@empresa.com` sobre `@gmail.com`).
  - Rastreo automático en páginas secundarias clave: `/contacto`, `/about`, `/aviso-legal` y `/politica-de-privacidad` (donde las empresas registran legalmente sus datos fiscales y de contacto).
- **Extracción de Ecosistema en Redes Sociales**:
  - Instagram, Facebook, LinkedIn (empresas y perfiles), X (Twitter), YouTube y TikTok.
- **Detección de Tech Stack y Pixeles**:
  - Identifica si el cliente utiliza WordPress, WooCommerce, Shopify, Wix, Squarespace, Webflow o PrestaShop.
  - Detecta la presencia o ausencia de **Meta Pixel (Facebook Ads)**, **Google Analytics 4 (GA4)**, **Google Tag Manager** y **TikTok Pixel**.
  - *Ángulo comercial inmediato*: Permite identificar clientes que tienen un alto volumen de ventas pero no tienen pixel de conversión o tienen sitios lentos.

### 3. Motor de Scoring Comercial Predictivo y Generador de Pitches (`js/util.js`)
- **Algoritmo de Oportunidad Comercial (0 a 100)**:
  - Evalúa la madurez digital del prospecto, reputación en Google (estrellas vs. número de opiniones) y canales de contacto activos.
  - Clasifica en Prioridad Alta (Score >= 75), Media o Baja.
  - Etiqueta automáticamente la necesidad: *"Sin Sitio Web (Oportunidad Web)"*, *"Sin Pixel (Oportunidad Ads)"*, *"Alta Demanda, Pocas Reseñas (Reputación)"*.
- **Generador de Propuestas en 1 Clic (WhatsApp y Email Frío)**:
  - Redacta propuestas comerciales hiperpersonalizadas usando el nombre de la empresa, su rubro, su calificación y el problema específico detectado.
  - Enlace directo a WhatsApp Web (`https://wa.me/...`) con el mensaje pre-cargado listo para enviar.

### 4. CRM Analítico de Alto Rendimiento (`dashboard.html` / `js/dashboard.js`)
- **KPI Metrics Grid**: Métricas ejecutivas en vivo con total de prospectos, porcentaje de correos verificados, teléfonos activos y promedio de satisfacción.
- **Buscador Universal y Filtros Reactivos**:
  - Búsqueda instantánea multitermino.
  - Chips de filtrado rápido: *Score Alto (75+)*, *Con Email*, *Con Teléfono*, *Con Web*, *Sin Web*.
- **Cajón Lateral de Inspección (Slide-over Drawer)**:
  - Vista completa 360° del prospecto con redes sociales, tecnología detectada, scoring y generador de mensajes.
- **Suite de Exportación y Automatización**:
  - **Exportar CSV con BOM UTF-8**: Compatible al 100% con Microsoft Excel (sin errores de tildes o caracteres especiales).
  - **Exportar XLSX**: Libro de Excel con formato nativo.
  - **Exportar JSON**: Estructura limpia para programadores o bases de datos NoSQL.
  - **Sincronización Webhook en 1 Clic**: Envía prospectos filtrados o completos a **Zapier**, **Make.com**, **n8n**, **HubSpot** o **GoHighLevel**.

---

## 📁 Arquitectura del Código

```
AtlasIQ/
├── manifest.json             # Manifiesto Chrome MV3 con MAIN world RPC hooks
├── injected.js               # Interceptor en contexto MAIN de peticiones RPC y fetch
├── contentScript.js          # Dock flotante, orquestador de scroll y deduplicación
├── bg.js                     # ImportScript hacia el worker principal
├── js/
│   ├── mybg.js               # Service Worker: extractor profundo, decodificador CF y tech stack
│   ├── dashboard.js          # Controlador del CRM, Tabulator, KPIs, filtros y cajón lateral
│   ├── util.js               # Motor de scoring comercial, pitches IA, exports UTF-8 y webhooks
│   └── popup.js              # Controlador del popup de extensión con accesos rápidos
├── css/
│   ├── contentScript.css     # Dock flotante con diseño moderno en Google Maps
│   └── dashboard.css         # Interfaz de CRM grado Silicon Valley (Tailwind/Linear inspired)
├── dashboard.html            # Panel principal de gestión de prospectos
├── popup.html                # Menú desplegable de la barra de Chrome
└── lib/                      # Dependencias locales (Tabulator, XLSX, jQuery)
```

---

## 🛠️ Instalación en Google Chrome

1. Abre Google Chrome y escribe en la barra de navegación:
   ```
   chrome://extensions/
   ```
2. Activa el interruptor **Modo de desarrollador** en la esquina superior derecha.
3. Haz clic en el botón **Cargar descomprimida** (Load unpacked).
4. Selecciona esta carpeta: `c:\Users\windo\Desktop\AtlasIQ`.
5. ¡Listo! Abre Google Maps, realiza cualquier búsqueda (ej. *"Restaurantes en Guadalajara"* o *"Clínicas en Madrid"*) y utiliza el dock flotante de **AtlasIQ**.

---

## 👨‍💻 Créditos y Autoría
- **Creador / CEO:** Joseph Castillo
- **Empresa:** WINDOWSTELECOM
- **Documento y Manual Oficial:** [Abrir Guía Interactiva en index.html](index.html)


