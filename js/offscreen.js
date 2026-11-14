/**
 * AtlasIQ Enterprise v4.0 - Offscreen DOM, Schema.org JSON-LD & Fiscal OSINT Parser
 * Runs in an isolated Chrome MV3 Offscreen Document with full native DOMParser support.
 */
(function () {
    const BOOKING_PLATFORMS = [
        { name: "Calendly", pattern: /calendly\.com\/[^\s"'<>]+/i },
        { name: "Doctoralia", pattern: /doctoralia\.[a-z.]+\/[^\s"'<>]+/i },
        { name: "Booksy", pattern: /booksy\.com\/[^\s"'<>]+/i },
        { name: "OpenTable", pattern: /opentable\.[a-z.]+\/[^\s"'<>]+/i },
        { name: "UberEats", pattern: /ubereats\.com\/[^\s"'<>]+/i },
        { name: "Rappi", pattern: /rappi\.[a-z.]+\/[^\s"'<>]+/i },
        { name: "PedidosYa", pattern: /pedidosya\.[a-z.]+\/[^\s"'<>]+/i },
        { name: "Treatwell", pattern: /treatwell\.[a-z.]+\/[^\s"'<>]+/i },
        { name: "AgendaPro", pattern: /agendapro\.com\/[^\s"'<>]+/i }
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

            // 2. Visible text OSINT: Deobfuscate [at] emails, Tax IDs, Legal Entities & Decision Makers
            const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ");

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

            // 3. Detect Booking / Delivery Platforms
            for (const bp of BOOKING_PLATFORMS) {
                const bm = html.match(bp.pattern);
                if (bm && bm[0]) {
                    out.bookingPlatform = bp.name;
                    out.bookingUrl = bm[0].startsWith("http") ? bm[0] : `https://${bm[0]}`;
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
