/**
 * AtlasIQ Enterprise v4.0 - Offscreen DOM, Schema.org JSON-LD, Web Health & Automation Friction Parser
 * Runs in an isolated Chrome MV3 Offscreen Document with full native DOMParser support.
 */
(function () {
    const BOOKING_PLATFORMS = [
        { name: "Calendly", pattern: /calendly\.com\/[^\s"'<>]+/i, commission: false },
        { name: "Cal.com", pattern: /cal\.com\/[^\s"'<>]+/i, commission: false },
        { name: "AgendaPro", pattern: /agendapro\.com\/[^\s"'<>]+/i, commission: false },
        { name: "Acuity", pattern: /acuityscheduling\.com\/[^\s"'<>]+/i, commission: false },
        { name: "SimplyBook", pattern: /simplybook\.[a-z.]+\/[^\s"'<>]+/i, commission: false },
        { name: "Doctoralia", pattern: /doctoralia\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "Booksy", pattern: /booksy\.com\/[^\s"'<>]+/i, commission: true },
        { name: "Fresha", pattern: /fresha\.com\/[^\s"'<>]+/i, commission: true },
        { name: "Treatwell", pattern: /treatwell\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "OpenTable", pattern: /opentable\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "TheFork", pattern: /thefork\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "UberEats", pattern: /ubereats\.com\/[^\s"'<>]+/i, commission: true },
        { name: "Rappi", pattern: /rappi\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "PedidosYa", pattern: /pedidosya\.[a-z.]+\/[^\s"'<>]+/i, commission: true },
        { name: "Glovo", pattern: /glovoapp\.com\/[^\s"'<>]+/i, commission: true },
        { name: "Booking.com", pattern: /booking\.com\/hotel\/[^\s"'<>]+/i, commission: true }
    ];

    // Tax ID patterns for Spain (CIF/NIF), Mexico (RFC), Venezuela (RIF), Colombia/Latam (NIT/RUC/RUT)
    const FISCAL_PATTERNS = [
        /\b(?:CIF|NIF|VAT)[:\s-]*([A-HJ-NP-SUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/i,
        /\b(?:RFC)[:\s-]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i,
        /\b(?:RIF)[:\s-]*([JVEGP]-\d{7,9}-?\d?)\b/i,
        /\b(?:NIT|RUC|RUT|CUIT)[:\s-]*(\d{7,11}-?\d?)\b/i
    ];

    const LEGAL_ENTITY_REGEX = /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s,&.-]{3,55}\s(?:S\.A\.S\.|S\.L\.U\.|S\.L\.|S\.A\. de C\.V\.|S\.A\.|C\.A\.|LLC|Inc\.|Ltda\.))\b/;
    const EXEC_ROLE_REGEX = /(?:CEO|Fundador(?:a)?|Director(?:a)?(?:\sGeneral|\sMédico|\sComercial)?|Gerente\sGeneral|Socio\sDirector|Founder|Owner)[:\s,-]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/;

    const PARKED_OR_BROKEN_PATTERNS = [
        /cgi-sys\/suspendedpage\.cgi/i,
        /account\s+suspended/i,
        /this\s+domain\s+is\s+for\s+sale/i,
        /este\s+dominio\s+est[áa]\s+en\s+venta/i,
        /sedoparking\.com/i,
        /hugedomains\.com/i,
        /parkingcrew\.net/i,
        /dan\.com\/buy-domain/i,
        /sitio\s+en\s+construcci[óo]n/i
    ];

    function flattenJsonLdNodes(json) {
        const list = [];
        function walk(node) {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(walk);
            } else if (typeof node === "object") {
                list.push(node);
                if (node["@graph"]) walk(node["@graph"]);
            }
        }
        walk(json);
        return list;
    }

    function parseHtmlDeepOsint(html) {
        const out = {
            schemaType: "",
            legalName: "",
            taxId: "",
            decisionMaker: "",
            priceRange: "",
            openingHours: "",
            bookingPlatform: "",
            bookingUrl: "",
            commissionBleed: false,
            hasViewport: true,
            copyrightYear: null,
            hasLeadForm: false,
            hasWhatsappCta: false,
            isParkedOrSuspended: false,
            jsonLdEmails: [],
            jsonLdPhones: [],
            jsonLdSocials: [],
            deobfuscatedEmails: [],
            titleTag: ""
        };

        if (!html || typeof html !== "string") return out;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            out.titleTag = (doc.querySelector("title")?.textContent || "").trim().substring(0, 140);
            out.hasViewport = Boolean(doc.querySelector('meta[name="viewport"]'));
            out.hasLeadForm = Boolean(doc.querySelector('form input[type="email"], form input[type="tel"], form textarea, iframe[src*="typeform"], iframe[src*="tally.so"], iframe[src*="leadconnectorhq"]'));
            out.hasWhatsappCta = /(?:wa\.me\/|api\.whatsapp\.com\/send|whatsapp:\/\/send|wa\.link\/)/i.test(html);
            out.isParkedOrSuspended = PARKED_OR_BROKEN_PATTERNS.some(rx => rx.test(html));

            // 1. Parse all Schema.org JSON-LD blocks
            const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
            ldScripts.forEach((scr) => {
                try {
                    const raw = scr.textContent.trim();
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    const nodes = flattenJsonLdNodes(parsed);

                    nodes.forEach((n) => {
                        if (n["@type"] && !out.schemaType) {
                            out.schemaType = Array.isArray(n["@type"]) ? n["@type"].join(", ") : String(n["@type"]);
                        }
                        if (n.legalName && !out.legalName) out.legalName = String(n.legalName).trim();
                        if ((n.taxID || n.vatID) && !out.taxId) out.taxId = String(n.taxID || n.vatID).trim();
                        if (n.priceRange && !out.priceRange) out.priceRange = String(n.priceRange).trim();
                        if (n.email) {
                            const ems = Array.isArray(n.email) ? n.email : [n.email];
                            ems.forEach(e => out.jsonLdEmails.push(String(e).replace(/^mailto:/i, "").trim().toLowerCase()));
                        }
                        if (n.telephone) {
                            const phs = Array.isArray(n.telephone) ? n.telephone : [n.telephone];
                            phs.forEach(p => out.jsonLdPhones.push(String(p).trim()));
                        }
                        if (n.founder || n.author || n.employee) {
                            const person = Array.isArray(n.founder) ? n.founder[0] : (n.founder || n.employee);
                            if (person) {
                                const pName = typeof person === "string" ? person : person.name;
                                if (pName && !out.decisionMaker) out.decisionMaker = String(pName).trim();
                            }
                        }
                        if (n.sameAs) {
                            const sames = Array.isArray(n.sameAs) ? n.sameAs : [n.sameAs];
                            sames.forEach(s => { if (typeof s === "string") out.jsonLdSocials.push(s); });
                        }
                        if (n.openingHours && !out.openingHours) {
                            out.openingHours = Array.isArray(n.openingHours) ? n.openingHours.join(" | ") : String(n.openingHours);
                        }
                    });
                } catch (e) {}
            });

            // 2. Visible text OSINT: Copyright Year, Deobfuscated Emails, Tax IDs, Legal Entities & Decision Makers
            const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ");

            // Detect footer copyright year for Web Redesign opportunity scoring
            const footerText = (doc.querySelector("footer")?.textContent || bodyText.slice(-1800)).replace(/\s+/g, " ");
            const copyMatches = Array.from(footerText.matchAll(/(?:©|\(c\)|copyright)\s*(?:20\d{2}\s*[-–/]\s*)?(20(?:0\d|1\d|2[0-7]))\b/gi));
            if (copyMatches.length > 0) {
                const years = copyMatches.map(m => parseInt(m[1], 10)).filter(y => y >= 2005 && y <= 2027);
                if (years.length > 0) out.copyrightYear = Math.max(...years);
            }

            // Deobfuscate "contacto [arroba/@/at] empresa [dot/punto] com"
            const obfRegex = /\b([A-Za-z0-9._%+-]{1,48})\s*(?:\[at\]|\(at\)|\[arroba\]|\s+arroba\s+)\s*([A-Za-z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\[punto\]|\.)\s*([A-Za-z]{2,12})\b/gi;
            for (const m of bodyText.matchAll(obfRegex)) {
                out.deobfuscatedEmails.push(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
            }

            if (!out.taxId) {
                for (const pat of FISCAL_PATTERNS) {
                    const fm = bodyText.match(pat);
                    if (fm && fm[0]) {
                        out.taxId = fm[0].trim();
                        break;
                    }
                }
            }

            if (!out.legalName) {
                const lm = bodyText.match(LEGAL_ENTITY_REGEX);
                if (lm && lm[1]) out.legalName = lm[1].trim();
            }

            if (!out.decisionMaker) {
                const em = bodyText.match(EXEC_ROLE_REGEX);
                if (em && em[0]) out.decisionMaker = em[0].trim().substring(0, 90);
            }

            // 3. Detect Booking / Delivery Platforms & Commission Bleed
            for (const bp of BOOKING_PLATFORMS) {
                const bm = html.match(bp.pattern);
                if (bm && bm[0]) {
                    out.bookingPlatform = bp.name;
                    out.bookingUrl = bm[0].startsWith("http") ? bm[0] : `https://${bm[0]}`;
                    out.commissionBleed = Boolean(bp.commission);
                    break;
                }
            }
        } catch (err) {}

        return out;
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.target === "offscreen" && msg.action === "parseOsintHtml") {
            const parsed = parseHtmlDeepOsint(msg.html || "");
            sendResponse(parsed);
            return false;
        }
    });
})();
