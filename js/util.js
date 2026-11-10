/**
 * AtlasIQ Enterprise - Core Utilities & Intelligence Engine
 * Grade: Silicon Valley Professional
 */

// Universal Helper: Extract Query Parameter
function getQueryString(name) {
    const reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
    const r = window.location.search.substring(1).match(reg);
    return r !== null ? decodeURIComponent(r[2]) : null;
}

// Clean and normalize URLs
function normalizeUrl(url) {
    if (!url) return "";
    let clean = url.trim();
    if (clean.startsWith("//")) clean = "https:" + clean;
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = "https://" + clean;
    try {
        const parsed = new URL(clean);
        return parsed.toString();
    } catch (e) {
        return clean;
    }
}

// Extract base domain from URL
function extractDomain(url) {
    if (!url) return "";
    try {
        const parsed = new URL(normalizeUrl(url));
        return parsed.hostname.replace(/^www\./, "");
    } catch (e) {
        return "";
    }
}

// Normalize Phone Number for International E.164 & WhatsApp
function formatPhone(phone, countryCodeHint = "") {
    if (!phone) return { clean: "", international: "", whatsappUrl: "" };
    const digitsOnly = phone.replace(/[^\d+]/g, "");
    let clean = digitsOnly.replace(/^00/, "+");
    let waDigits = clean.replace(/\+/g, "");
    
    // If not starting with '+' and a regional hint is available
    if (!clean.startsWith("+") && countryCodeHint && !waDigits.startsWith(countryCodeHint)) {
        waDigits = countryCodeHint + waDigits;
        clean = "+" + waDigits;
    }

    return {
        original: phone,
        clean: clean,
        whatsappUrl: waDigits && waDigits.length >= 8 ? `https://wa.me/${waDigits}` : ""
    };
}

/**
 * Lead Opportunity Scoring Engine (0 - 100)
 * Evaluates commercial opportunity & digital readiness for B2B sales agencies.
 */
function calculateLeadScore(lead) {
    let score = 50; // Base score
    const opportunities = [];

    // 1. Digital Presence Gaps (High Opportunity for Agencies)
    if (!lead.website || lead.website.trim() === "") {
        score += 25; // Massive opportunity to sell website design / development
        opportunities.push("Sin Sitio Web (Oportunidad Web)");
    } else {
        // Has website: check tech stack & social signals
        score += 5; // Verified digital presence
        
        if (lead.tech_stack) {
            const tech = lead.tech_stack.toLowerCase();
            if (tech.includes("wordpress") || tech.includes("wix")) {
                opportunities.push("CMS Tradicional (Oportunidad Rediseño)");
            }
            if (!tech.includes("pixel") && !tech.includes("tag manager")) {
                score += 10;
                opportunities.push("Sin Pixel de Conversión (Oportunidad Ads)");
            }
        }
    }

    // 2. Contactability
    if (lead.phone && lead.phone.length > 6) {
        score += 10;
    } else {
        opportunities.push("Teléfono no detectado");
    }

    if (lead.email && lead.email.includes("@")) {
        score += 15;
    } else {
        opportunities.push("Email pendiente");
    }

    // 3. Social Media Presence
    const hasSocial = Boolean(lead.instagram || lead.facebook || lead.linkedin || lead.twitter);
    if (!hasSocial && lead.website) {
        score += 10;
        opportunities.push("Baja Presencia en RRSS");
    }

    // 4. Google Reviews & Reputation Analysis
    const rating = parseFloat(lead.averageRating) || 0;
    const reviews = parseInt(lead.reviewCount) || 0;

    if (rating >= 4.5 && reviews < 25) {
        score += 10;
        opportunities.push("Excelente Calificación, Pocas Reseñas");
    } else if (rating < 4.0 && reviews > 10) {
        opportunities.push("Gestión de Reputación / Feedback");
    } else if (reviews > 100) {
        score += 10;
        opportunities.push("Negocio Consolidado / Alto Tráfico");
    }

    // Clamp score to 10 - 99
    score = Math.min(99, Math.max(15, score));

    // Priority Tier
    let priority = "Media";
    let priorityColor = "#f59e0b"; // amber
    if (score >= 75) {
        priority = "Alta";
        priorityColor = "#10b981"; // emerald
    } else if (score < 45) {
        priority = "Baja";
        priorityColor = "#94a3b8"; // slate
    }

    return {
        score: score,
        priority: priority,
        priorityColor: priorityColor,
        opportunities: opportunities
    };
}

/**
 * Cold Outreach Pitch Generator
 * Generates tailored Cold Email & WhatsApp pitches based on detected business gaps.
 */
function generateOutreachPitch(lead, channel = "whatsapp") {
    const name = lead.name || "Estimado equipo";
    const category = lead.category || "su negocio";
    const city = lead.address ? lead.address.split(",")[1] || lead.address.split(",")[0] : "su zona";
    const rating = lead.averageRating ? `${lead.averageRating}★` : "excelente reputación";
    
    let specificPitch = "";
    if (!lead.website) {
        specificPitch = `noté que actualmente no cuentan con un sitio web moderno adaptado a móviles para capturar clientes directamente en Google.`;
    } else if (!lead.instagram && !lead.facebook) {
        specificPitch = `estuve revisando su presencia digital y veo que tienen gran potencial para multiplicar reservas/ventas si optimizan sus canales de redes sociales y publicidad digital.`;
    } else {
        specificPitch = `veo que ya tienen un buen posicionamiento con ${rating}. Queremos presentarles un sistema para automatizar la captura de clientes y superar a sus competidores locales.`;
    }

    if (channel === "whatsapp") {
        return `Hola, un gusto saludarlos en *${name}* 👋\n\nEstuve revisando los mejores negocios de ${category} en ${city.trim()} y me llamó la atención su trabajo (${rating}).\n\nSin embargo, ${specificPitch}\n\n¿Quién es la persona encargada del área comercial o marketing con quien pueda compartirle una breve propuesta de 2 minutos sin compromiso?\n\n¡Muchas gracias!`;
    } else {
        // Cold Email
        return `Asunto: Oportunidad de captación digital para ${name}\n\nHola equipo de ${name},\n\nEspero que se encuentren muy bien. Los contacto porque analicé recientemente las empresas destacadas de ${category} en ${city.trim()} y su perfil resalta de forma positiva (${rating}).\n\nAnalizando su ecosistema comercial, ${specificPitch}\n\nDesarrollamos soluciones especializadas para el sector de ${category} que ayudan a incrementar la facturación entre un 25% y 40% mediante captación automatizada.\n\n¿Tendrían 5 minutos esta semana para una llamada breve o prefieren que les comparta un video explicativo de 2 minutos?\n\nSaludos cordiales,\nEquipo Comercial`;
    }
}

/**
 * Modern CSV Exporter with UTF-8 BOM
 * Ensures Excel correctly displays accents and Spanish characters (ñ, á, é, í, ó, ú).
 */
function exportToCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const separator = ",";
    const keys = Object.keys(rows[0]);
    
    const csvContent = [
        keys.map(k => `"${k.replace(/"/g, '""')}"`).join(separator),
        ...rows.map(row => 
            keys.map(k => {
                let cell = row[k] === null || row[k] === undefined ? "" : String(row[k]);
                return `"${cell.replace(/"/g, '""')}"`;
            }).join(separator)
        )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export to JSON
 */
function exportToJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export to vCard (.vcf)
 * Allows users to import hundreds of B2B leads directly into Android/iOS/Google Contacts in 1 click.
 */
function exportToVCard(filename, leads) {
    if (!leads || !leads.length) return;
    const vcfCards = leads.map(l => {
        const name = (l.name || "Lead").replace(/;/g, " ");
        const phone = l.phone || "";
        const email = l.email || "";
        const website = l.website || "";
        const address = (l.address || "").replace(/;/g, " ");
        const category = l.category || "";
        const note = `Score: ${l.lead_score || "N/A"} | Prioridad: ${l.priority || "Media"} | ${l.opportunities || ""}`;
        
        return [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${name}`,
            `ORG:${name}`,
            category ? `TITLE:${category}` : "",
            phone ? `TEL;TYPE=WORK,VOICE:${phone}` : "",
            email ? `EMAIL;TYPE=WORK:${email}` : "",
            website ? `URL:${website}` : "",
            address ? `ADR;TYPE=WORK:;;${address};;;;` : "",
            note ? `NOTE:${note}` : "",
            "END:VCARD"
        ].filter(Boolean).join("\r\n");
    }).join("\r\n");

    const blob = new Blob([vcfCards], { type: "text/vcard;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Webhook Dispatcher
 * Pushes leads directly to Zapier, Make, n8n, GoHighLevel, or HubSpot.
 */
async function sendLeadsToWebhook(webhookUrl, leadsData) {
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
        throw new Error("URL de Webhook inválida.");
    }
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            source: "AtlasIQ Enterprise",
            timestamp: new Date().toISOString(),
            total_leads: leadsData.length,
            leads: leadsData
        })
    });
    if (!response.ok) {
        throw new Error(`Error en Webhook: HTTP ${response.status}`);
    }
    return await response.text();
}

/**
 * Live Google Gemini AI Strategic Lead Audit
 * Calls Gemini 1.5/2.0 API directly with full context on the lead.
 */
async function callGeminiAnalysis(apiKey, lead) {
    if (!apiKey) {
        throw new Error("Por favor configura tu Gemini API Key en el menú de ⚙️ Ajustes.");
    }

    const prompt = `Actúa como el Director Comercial de una agencia digital de élite en Silicon Valley.
Analiza este prospecto B2B obtenido de Google Maps y genera un reporte estratégico de prospección:

DATOS DEL PROSPECTO:
- Nombre: ${lead.name || "N/A"}
- Rubro/Categoría: ${lead.category || "N/A"}
- Calificación: ${lead.averageRating || "N/A"} estrellas (${lead.reviewCount || 0} reseñas)
- Sitio Web: ${lead.website || "No tiene sitio web"}
- Redes Sociales: Instagram (${lead.instagram || "No"}), Facebook (${lead.facebook || "No"}), LinkedIn (${lead.linkedin || "No"})
- Tech Stack Detectado: ${lead.tech_stack || "Ninguno detectado"}
- Dirección / Zona: ${lead.address || "N/A"}

RESPONDE CON EL SIGUIENTE FORMATO CLARO Y DIRECTO EN ESPAÑOL:
1. 🎯 ICP FIT SCORE (1-100) y por qué este cliente vale la pena.
2. 🔍 DIAGNÓSTICO DE VULNERABILIDAD DIGITAL (¿Qué les falta y cuánto dinero están perdiendo por no tenerlo?).
3. 🎣 GANCHO COMERCIAL IRRESISTIBLE (Una frase de impacto para captar la atención del dueño o gerente en 5 segundos).
4. 💬 PITCH DE WHATSAPP ULTRA-CONVERTIDOR (Corto, humano, directo, sin sonar a spam corporativo).
5. 📞 GUIÓN RÁPIDO PARA LLAMADA FRÍA (Cold Calling de 30 segundos).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1200
            }
        })
    });

    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Error HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar la respuesta de IA.";
}

/**
 * Web Audio Synthesizer (Zero dependencies, pure browser audio)
 * Plays pleasant notification chimes for extraction completion or high-score discovery.
 */
function playAudioNotification(type = "success") {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        if (type === "success") {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = "sine";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.12);
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 0.5);
        }
    } catch (e) {}
}
