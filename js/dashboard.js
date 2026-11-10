/**
 * AtlasIQ Enterprise CRM - Dashboard Controller
 * Grade: Silicon Valley Professional
 */

let allLeads = [];
let currentFilter = "all";
let activeLeadForDrawer = null;
let currentPitchChannel = "whatsapp";

// Tabulator Instance
let table = null;

function initTable() {
    table = new Tabulator("#example-table", {
        layout: "fitColumns",
        placeholder: "No se encontraron prospectos. Inicia una búsqueda en Google Maps con AtlasIQ.",
        selectable: true,
        pagination: "local",
        paginationSize: 25,
        paginationSizeSelector: [10, 25, 50, 100, 500],
        columns: [
            {
                title: "Empresa",
                field: "name",
                widthGrow: 2.2,
                formatter: (cell) => {
                    const row = cell.getRow().getData();
                    const name = cell.getValue() || "Sin nombre";
                    const mapLink = row.mapsUrl ? `<a href="${row.mapsUrl}" target="_blank" title="Ver en Google Maps" style="margin-left: 6px; text-decoration: none;">📍</a>` : "";
                    return `<strong style="color: #0f172a;">${name}</strong>${mapLink}`;
                }
            },
            {
                title: "Calificación",
                field: "averageRating",
                width: 120,
                hozAlign: "center",
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const rev = row.reviewCount ? `(${row.reviewCount})` : "";
                    return `<span class="tl-rating-pill">★ ${val} <small style="color: #64748b;">${rev}</small></span>`;
                }
            },
            {
                title: "Score IA",
                field: "lead_score",
                width: 100,
                hozAlign: "center",
                sorter: "number",
                formatter: (cell) => {
                    const score = parseInt(cell.getValue()) || 50;
                    let cls = "tl-score-med";
                    if (score >= 75) cls = "tl-score-high";
                    else if (score < 45) cls = "tl-score-low";
                    return `<span class="tl-badge-score ${cls}">${score}</span>`;
                }
            },
            {
                title: "Teléfono",
                field: "phone",
                widthGrow: 1.5,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const pInfo = formatPhone(val);
                    const waBtn = pInfo.whatsappUrl ? 
                        `<a href="${pInfo.whatsappUrl}" target="_blank" style="margin-left: 6px; text-decoration: none;" title="Abrir WhatsApp">💬</a>` : "";
                    return `<span>${val}</span>${waBtn}`;
                }
            },
            {
                title: "Email Verificado",
                field: "email",
                widthGrow: 1.8,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<a href="mailto:${val}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${val}</a>`;
                }
            },
            {
                title: "Sitio Web",
                field: "website",
                widthGrow: 1.6,
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #ef4444; font-size: 11px; font-weight: 600;">Sin Web</span>';
                    const domain = extractDomain(val);
                    let techBadge = "";
                    if (row.tech_stack) {
                        if (row.tech_stack.includes("Shopify")) techBadge = ' <span style="background: #e0f2fe; color: #0284c7; padding: 1px 4px; border-radius: 4px; font-size: 10px;">Shopify</span>';
                        else if (row.tech_stack.includes("WordPress")) techBadge = ' <span style="background: #e2e8f0; color: #334155; padding: 1px 4px; border-radius: 4px; font-size: 10px;">WP</span>';
                    }
                    return `<a href="${val}" target="_blank" style="color: #0f172a; text-decoration: underline;">${domain}</a>${techBadge}`;
                }
            },
            {
                title: "Rubro / Categoría",
                field: "category",
                widthGrow: 1.4,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<span style="color: #475569; font-size: 12px;">${val}</span>`;
                }
            },
            {
                title: "Acción",
                width: 110,
                hozAlign: "center",
                formatter: () => {
                    return `<button class="tl-btn tl-btn-primary" style="height: 26px; font-size: 11px; padding: 0 8px;">Detalle ↗</button>`;
                },
                cellClick: (e, cell) => {
                    openLeadDrawer(cell.getRow().getData());
                }
            }
        ],
        rowClick: (e, row) => {
            // Open drawer on row click unless clicked on specific link
            if (e.target.tagName !== "A" && e.target.tagName !== "BUTTON") {
                openLeadDrawer(row.getData());
            }
        }
    });
}

// Load and Render Leads
function loadDashboardData() {
    chrome.storage.local.get(["leads", "tl_webhook_url", "tl_gemini_key"], (data) => {
        allLeads = data.leads || [];

        // Precalculate scores if missing
        allLeads.forEach(lead => {
            if (!lead.lead_score) {
                const s = calculateLeadScore(lead);
                lead.lead_score = s.score;
                lead.priority = s.priority;
                lead.opportunities = s.opportunities.join(", ");
            }
        });

        updateKpiMetrics(allLeads);
        applyFilters();

        if (data.tl_webhook_url) {
            document.getElementById("setting-webhook-url").value = data.tl_webhook_url;
        }
        if (data.tl_gemini_key) {
            document.getElementById("setting-gemini-key").value = data.tl_gemini_key;
        }
    });
}

// Compute KPI Metrics
function updateKpiMetrics(leads) {
    const total = leads.length;
    const withEmail = leads.filter(l => l.email && l.email.includes("@")).length;
    const withPhone = leads.filter(l => l.phone && l.phone.length > 5).length;
    const highScore = leads.filter(l => (parseInt(l.lead_score) || 0) >= 75).length;

    let ratingSum = 0;
    let ratingCount = 0;
    let reviewSum = 0;

    leads.forEach(l => {
        const r = parseFloat(l.averageRating);
        const rev = parseInt(l.reviewCount);
        if (r && !isNaN(r)) {
            ratingSum += r;
            ratingCount++;
        }
        if (rev && !isNaN(rev)) {
            reviewSum += rev;
        }
    });

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "0.0";
    const avgReviews = ratingCount > 0 ? Math.round(reviewSum / ratingCount) : 0;

    document.getElementById("kpi-total-leads").textContent = total.toLocaleString();
    document.getElementById("kpi-total-emails").textContent = withEmail.toLocaleString();
    document.getElementById("kpi-email-pct").textContent = total > 0 ? `${Math.round((withEmail / total) * 100)}% del total` : "0% del total";
    document.getElementById("kpi-total-phones").textContent = withPhone.toLocaleString();
    document.getElementById("kpi-phone-pct").textContent = total > 0 ? `${Math.round((withPhone / total) * 100)}% con contacto` : "0%";
    document.getElementById("kpi-high-score").textContent = highScore.toLocaleString();
    document.getElementById("kpi-avg-rating").textContent = `${avgRating}★`;
    document.getElementById("kpi-avg-reviews").textContent = `${avgReviews} reseñas prom.`;
}

// Filter System
function applyFilters() {
    const searchVal = (document.getElementById("filter-search").value || "").toLowerCase().trim();

    const filtered = allLeads.filter(lead => {
        // 1. Text search match
        if (searchVal) {
            const haystack = [
                lead.name, lead.phone, lead.email, lead.address, 
                lead.category, lead.website, lead.opportunities, lead.tech_stack
            ].join(" ").toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }

        // 2. Chip Filter Match
        if (currentFilter === "high-score") {
            return (parseInt(lead.lead_score) || 0) >= 75;
        }
        if (currentFilter === "has-email") {
            return Boolean(lead.email && lead.email.includes("@"));
        }
        if (currentFilter === "has-phone") {
            return Boolean(lead.phone && lead.phone.length > 5);
        }
        if (currentFilter === "has-website") {
            return Boolean(lead.website && lead.website.trim().length > 0);
        }
        if (currentFilter === "no-website") {
            return !lead.website || lead.website.trim().length === 0;
        }

        return true;
    });

    if (table) {
        table.setData(filtered);
    }
}

// Lead Detail Drawer Controller
function openLeadDrawer(lead) {
    activeLeadForDrawer = lead;
    const overlay = document.getElementById("lead-drawer-overlay");

    document.getElementById("drawer-lead-name").textContent = lead.name || "Sin nombre";
    document.getElementById("drawer-lead-rating").textContent = lead.averageRating ? 
        `★ ${lead.averageRating} (${lead.reviewCount || 0} reseñas)` : "Sin calificación";

    // AI Score & Priority
    const score = parseInt(lead.lead_score) || 50;
    const scoreEl = document.getElementById("drawer-ai-score");
    scoreEl.textContent = score;
    scoreEl.className = "tl-badge-score " + (score >= 75 ? "tl-score-high" : (score < 45 ? "tl-score-low" : "tl-score-med"));

    document.getElementById("drawer-ai-priority").textContent = lead.priority || "Media";

    // Opportunities tags
    const oppsContainer = document.getElementById("drawer-ai-opps");
    oppsContainer.innerHTML = "";
    const oppList = (lead.opportunities || "").split(",").map(o => o.trim()).filter(Boolean);
    if (oppList.length > 0) {
        oppList.forEach(opp => {
            const span = document.createElement("span");
            span.className = "tl-opp-tag";
            span.textContent = opp;
            oppsContainer.appendChild(span);
        });
    } else {
        oppsContainer.innerHTML = '<span style="color: #94a3b8; font-size: 12px;">Perfil estándar</span>';
    }

    // Contact Details
    document.getElementById("drawer-lead-phone").textContent = lead.phone || "No detectado";
    
    const waBtnContainer = document.getElementById("drawer-whatsapp-btn");
    const pInfo = formatPhone(lead.phone);
    if (pInfo.whatsappUrl) {
        waBtnContainer.innerHTML = `<a href="${pInfo.whatsappUrl}" target="_blank" class="tl-btn tl-btn-success" style="height: 24px; font-size: 11px; padding: 0 8px;">Abrir Chat</a>`;
    } else {
        waBtnContainer.innerHTML = `<span style="color: #94a3b8;">No disponible</span>`;
    }

    document.getElementById("drawer-lead-email").innerHTML = lead.email ? 
        `<a href="mailto:${lead.email}" style="color: #2563eb;">${lead.email}</a>` : "No detectado";

    document.getElementById("drawer-lead-web").innerHTML = lead.website ? 
        `<a href="${lead.website}" target="_blank" style="color: #2563eb;">${lead.website}</a>` : "Sin sitio web";

    document.getElementById("drawer-lead-address").textContent = lead.address || "No especificada";

    // Tech Stack & Social
    document.getElementById("drawer-lead-tech").textContent = lead.tech_stack || "No detectado / Sitio básico";

    const socialContainer = document.getElementById("drawer-social-icons");
    socialContainer.innerHTML = "";
    const socials = [
        { name: "Instagram", url: lead.instagram, icon: "📸" },
        { name: "Facebook", url: lead.facebook, icon: "📘" },
        { name: "LinkedIn", url: lead.linkedin, icon: "💼" },
        { name: "Twitter/X", url: lead.twitter, icon: "🐦" },
        { name: "YouTube", url: lead.youtube, icon: "▶️" },
        { name: "TikTok", url: lead.tiktok, icon: "🎵" }
    ];
    let hasAnySocial = false;
    socials.forEach(s => {
        if (s.url) {
            hasAnySocial = true;
            const a = document.createElement("a");
            a.href = s.url;
            a.target = "_blank";
            a.title = s.name;
            a.style.cssText = "text-decoration:none;font-size:16px;padding:4px 6px;background:#f1f5f9;border-radius:6px;";
            a.textContent = s.icon;
            socialContainer.appendChild(a);
        }
    });
    if (!hasAnySocial) {
        socialContainer.innerHTML = '<span style="color: #94a3b8; font-size: 12px;">Sin redes detectadas</span>';
    }

    // Outreach Pitch
    updatePitchPreview();

    overlay.classList.add("open");
}

function updatePitchPreview() {
    if (!activeLeadForDrawer) return;
    const pitch = generateOutreachPitch(activeLeadForDrawer, currentPitchChannel);
    document.getElementById("drawer-pitch-text").textContent = pitch;

    const pInfo = formatPhone(activeLeadForDrawer.phone);
    const waLink = document.getElementById("btn-send-wa");
    if (pInfo.whatsappUrl && currentPitchChannel === "whatsapp") {
        waLink.href = `${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}`;
        waLink.style.display = "inline-flex";
    } else {
        waLink.style.display = "none";
    }
}

function closeLeadDrawer() {
    document.getElementById("lead-drawer-overlay").classList.remove("open");
    activeLeadForDrawer = null;
}

// Event Listeners Initialization
$(document).ready(() => {
    initTable();
    loadDashboardData();

    // Search bar
    document.getElementById("filter-search").addEventListener("input", () => {
        applyFilters();
    });

    // Filter Chips
    document.querySelectorAll(".tl-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".tl-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentFilter = chip.getAttribute("data-filter");
            applyFilters();
        });
    });

    // Drawer Close
    document.getElementById("drawer-close-btn").addEventListener("click", closeLeadDrawer);
    document.getElementById("lead-drawer-overlay").addEventListener("click", (e) => {
        if (e.target.id === "lead-drawer-overlay") closeLeadDrawer();
    });

    // Pitch Channel Tabs
    const tabWa = document.getElementById("tab-pitch-wa");
    const tabEmail = document.getElementById("tab-pitch-email");
    const tabGemini = document.getElementById("tab-pitch-gemini");
    const geminiControls = document.getElementById("gemini-controls");
    const standardPitchActions = document.getElementById("standard-pitch-actions");

    tabWa.addEventListener("click", () => {
        tabWa.classList.add("active");
        tabEmail.classList.remove("active");
        if (tabGemini) tabGemini.classList.remove("active");
        if (geminiControls) geminiControls.style.display = "none";
        if (standardPitchActions) standardPitchActions.style.display = "flex";
        currentPitchChannel = "whatsapp";
        updatePitchPreview();
    });

    tabEmail.addEventListener("click", () => {
        tabEmail.classList.add("active");
        tabWa.classList.remove("active");
        if (tabGemini) tabGemini.classList.remove("active");
        if (geminiControls) geminiControls.style.display = "none";
        if (standardPitchActions) standardPitchActions.style.display = "flex";
        currentPitchChannel = "email";
        updatePitchPreview();
    });

    if (tabGemini) {
        tabGemini.addEventListener("click", () => {
            tabGemini.classList.add("active");
            tabWa.classList.remove("active");
            tabEmail.classList.remove("active");
            if (geminiControls) geminiControls.style.display = "block";
            if (standardPitchActions) standardPitchActions.style.display = "flex";
            currentPitchChannel = "gemini";
            const pitchEl = document.getElementById("drawer-pitch-text");
            pitchEl.textContent = "Haz clic en el botón de abajo para que Gemini IA realice una auditoría estratégica en vivo y genere el diagnóstico comercial de este negocio.";
            document.getElementById("btn-send-wa").style.display = "none";
        });
    }

    // Live Gemini AI Execution
    const btnRunGemini = document.getElementById("btn-run-gemini");
    if (btnRunGemini) {
        btnRunGemini.addEventListener("click", async () => {
            if (!activeLeadForDrawer) return;
            chrome.storage.local.get(["tl_gemini_key"], async (res) => {
                const apiKey = res.tl_gemini_key;
                if (!apiKey) {
                    alert("Por favor ingresa tu Gemini API Key en el menú de ⚙️ Ajustes (es gratis en Google AI Studio).");
                    document.getElementById("settings-modal").classList.add("open");
                    return;
                }

                const pitchEl = document.getElementById("drawer-pitch-text");
                pitchEl.textContent = "✨ Conectando con Google Gemini 1.5/2.0 Flash...\nAnalizando presencia digital, reputación y stack tecnológico...";
                btnRunGemini.disabled = true;
                btnRunGemini.textContent = "⏳ Analizando con Gemini IA...";

                try {
                    const result = await callGeminiAnalysis(apiKey, activeLeadForDrawer);
                    pitchEl.textContent = result;
                    playAudioNotification("success");
                } catch (err) {
                    pitchEl.textContent = "❌ Error al consultar Gemini IA: " + err.message + "\n\nVerifica que tu API Key sea válida.";
                } finally {
                    btnRunGemini.disabled = false;
                    btnRunGemini.textContent = "✨ Generar Auditoría y Guión con Gemini";
                }
            });
        });
    }

    // Copy Pitch Button
    document.getElementById("btn-copy-pitch").addEventListener("click", () => {
        const text = document.getElementById("drawer-pitch-text").textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById("btn-copy-pitch");
            btn.textContent = "✅ ¡Copiado!";
            setTimeout(() => { btn.textContent = "📋 Copiar Mensaje"; }, 2000);
        });
    });

    // EXPORTS
    document.getElementById("btn-export-csv").addEventListener("click", () => {
        const data = table ? table.getData() : allLeads;
        exportToCsv("atlasiq_leads.csv", data);
    });

    document.getElementById("btn-export-xlsx").addEventListener("click", () => {
        if (table) {
            table.download("xlsx", "atlasiq_leads.xlsx", { sheetName: "Leads" });
        }
    });

    document.getElementById("btn-export-json").addEventListener("click", () => {
        const data = table ? table.getData() : allLeads;
        exportToJson("atlasiq_leads.json", data);
    });

    // WEBHOOK SYNC
    document.getElementById("btn-sync-webhook").addEventListener("click", async () => {
        chrome.storage.local.get(["tl_webhook_url"], async (data) => {
            const webhookUrl = data.tl_webhook_url;
            if (!webhookUrl) {
                alert("Por favor configura primero la URL de tu Webhook en el botón ⚙️ Ajustes.");
                document.getElementById("settings-modal").classList.add("open");
                return;
            }

            const leadsToSync = table ? table.getData() : allLeads;
            if (!leadsToSync.length) {
                alert("No hay prospectos para sincronizar.");
                return;
            }

            const btn = document.getElementById("btn-sync-webhook");
            btn.textContent = "⏳ Sincronizando...";
            btn.disabled = true;

            try {
                await sendLeadsToWebhook(webhookUrl, leadsToSync);
                btn.textContent = "✅ ¡Sincronizado!";
                playAudioNotification("success");
                setTimeout(() => {
                    btn.textContent = "🚀 Sincronizar CRM / Webhook";
                    btn.disabled = false;
                }, 2500);
            } catch (err) {
                alert("Error al sincronizar con Webhook: " + err.message);
                btn.textContent = "🚀 Sincronizar CRM / Webhook";
                btn.disabled = false;
            }
        });
    });

    // SETTINGS MODAL
    document.getElementById("btn-settings").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.add("open");
    });
    document.getElementById("btn-modal-cancel").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.remove("open");
    });
    document.getElementById("btn-modal-save").addEventListener("click", () => {
        const url = document.getElementById("setting-webhook-url").value.trim();
        const geminiKey = document.getElementById("setting-gemini-key").value.trim();
        chrome.storage.local.set({ tl_webhook_url: url, tl_gemini_key: geminiKey }, () => {
            alert("Ajustes guardados correctamente.");
            document.getElementById("settings-modal").classList.remove("open");
        });
    });

    // CLEAR DATA
    document.getElementById("btn-clear-data").addEventListener("click", () => {
        if (confirm("¿Estás seguro de que deseas eliminar todos los prospectos guardados? Esta acción es irreversible.")) {
            chrome.storage.local.remove(["leads"], () => {
                allLeads = [];
                table.setData([]);
                updateKpiMetrics([]);
            });
        }
    });
});
