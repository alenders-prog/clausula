---
name: project-pdf-aanbevelingen
description: Openstaande aanbevelingen voor PDF-generatie — bewuste keuzes en mogelijke toekomstige verbeteringen
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
---

## Huidige aanpak: `window.print()`

Gekozen na vergelijking met pdfMake (afgewezen) en Gotenberg. Levert vector-PDF, ondersteunt alle CSS/SVG volledig, AVG-veilig. **Niet terugzetten naar pdfMake** — dit is een bewuste keuze.

Implementatie: `downloadPdfBtn` roept `window.print()` aan. `@media print` CSS verbergt alles behalve `#analysePanel` (split-header en document-kolom worden verborgen).

**Enige beperking**: print-dialoog (gebruiker moet "Opslaan als PDF" kiezen in Chrome).

---

## Openstaand punt: Gotenberg voor echte download-knop

**Aanbeveling**: Gotenberg (open source, Docker) op een **zelf beheerde EU-VPS** (Hetzner / Scaleway / OVH).

**Waarom:** Enige optie die zowel kwaliteit als AVG-conformiteit combineert.

**Why:** Client-side libraries (jsPDF + html2canvas) produceren bitmap-PDF — tekst niet doorzoekbaar, slechte SVG-rendering. `window.print()` vereist print-dialoog. Gotenberg gebruikt Chromium server-side → identieke kwaliteit, directe download-knop.

**How to apply:**
- Gotenberg kan NIET op Vercel draaien (serverless, geen Docker).
- Gotenberg op dezelfde Vercel-instantie = onmogelijk → altijd extra verwerker → DPA vereist.
- Zelf beheerde EU-VPS = geen externe verwerker, geen DPA nodig, AVG-eenvoudig.
- Vercel vervangen door eigen VPS lost het ook op maar verlies je Vercel-beheergemak.

**Implementatiestappen (als het moment komt):**
1. EU-VPS opzetten (Hetzner €4/mnd, 1 vCPU, 2 GB RAM volstaat)
2. `docker run gotenberg/gotenberg:8` op die VPS
3. Nieuw Vercel-endpoint `api/genereer-pdf.js` — ontvangt rapport-HTML, stuurt naar Gotenberg, streamt PDF terug
4. `GOTENBERG_URL` toevoegen als Vercel env-variabele
5. Losse server-side HTML-template bouwen (JSON-data in → HTML-string uit), onafhankelijk van DOM
6. Download-knop in frontend: POST naar `/api/genereer-pdf`, ontvang blob, trigger download
7. Logging uitschakelen op Gotenberg-server (request-bodies bevatten persoonsgegevens)
8. Verwerkingsregister bijwerken (Gotenberg-VPS als verwerker)
