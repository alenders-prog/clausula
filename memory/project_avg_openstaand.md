---
name: project-avg-openstaand
description: Openstaande AVG/GDPR-actiepunten — verwerkersovereenkomsten en compliance-taken
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-20T13:41:30.361Z
---

## Openstaand: verwerkersovereenkomsten (DPA's) met servicepartijen

Het systeem verwerkt gevoelige persoonsgegevens (namen, geboortedatums, financiële afspraken van scheidende partijen). De volgende servicepartijen verwerken deze data namens de organisatie en vereisen elk een **verwerkersovereenkomst**:

| Partij | Wat ze verwerken | Status DPA |
|--------|-----------------|-----------|
| **Vercel** | Serverless functies — alle API-calls inclusief documenten en rapportdata | ⏳ Nog te regelen |
| **Supabase** | Database met screeningen, namen_map (encrypted), dossiers | ✅ Geregeld (2026-07-20) |
| **Anthropic** | Documenten worden naar Claude-API gestuurd voor analyse | ✅ Geregeld — DPA automatisch onderdeel van Commercial Terms (geaccepteerd bij accountaanmaak); ZDR nog aanvragen via support |
| **Resend** | E-mailadressen voor uitnodigings-e-mails | ⏳ Nog te regelen |
| **Adobe PDF Services** | PDF-documenten voor conversie (PDF→DOCX) | ⏳ Nog te regelen |

**Why:** Zonder DPA is verwerking door deze partijen niet AVG-conform, ook al beveiligen ze data technisch goed. DPA is een wettelijke verplichting (AVG art. 28).

**How to apply:**
- Bij Vercel, Supabase, Resend en Adobe zijn DPA's beschikbaar in hun dashboard/instellingen — dit is een administratieve actie, geen technische.
- Anthropic: controleer of hun Data Processing Agreement de EU-standaard dekt (SCCs / adequaatheidsbesluit) — bijzonder relevant omdat documenten met persoonsgegevens naar de API gaan.
- Overweeg of persoonsgegevens uit documenten geminimaliseerd kunnen worden vóór ze naar de Anthropic API gaan (namen vervangen door placeholders, na analyse terugplaatsen).
- Verwerkingsregister bijwerken met alle bovenstaande partijen.

**Zie ook:** [[project-pdf-aanbevelingen]] voor Gotenberg-DPA-overwegingen bij toekomstige PDF-download-implementatie.

---

## Overweging: originele PDF opslaan in Supabase Storage (voor DOCX-export)

**Aanleiding:** voor de "Download als Word" functie (concept-review) is de originele PDF nodig als basis voor Adobe PDF→DOCX-conversie. Na het navigeren weg van de uploadpagina is de PDF niet meer beschikbaar in de browser (alleen de geëxtraheerde tekst staat in Supabase). Op een ander apparaat is de PDF nooit beschikbaar.

**Technisch:** als de PDF bij het eerste concept wordt opgeslagen in Supabase Storage (beveiligd met RLS, alleen eigen user), kan hij in elke sessie / elk apparaat worden opgehaald als basis voor de DOCX-export.

**AVG-onduidelijkheid:**
- De PDF bevat onverkorte persoonsgegevens (namen, adressen, IBAN's, kindgegevens)
- Supabase DPA nog niet geregeld (zie tabel boven) — opslag nu AVG-non-conform
- Vraag: valt PDF-opslag onder dezelfde grondslag als de al opgeslagen tekst + namen_map, of vereist dit een aparte afweging?
- Alternatief: alleen de Adobe-geconverteerde DOCX opslaan (derivative, zelfde data, zelfde vraag)

**Huidige tijdelijke oplossing:** IndexedDB-cache in de browser (lokaal apparaat, geen server, geen AVG-bezwaar). Werkt prima bij gebruik op één apparaat.

**Actie:** beoordelen zodra Supabase DPA geregeld is en grondslag voor PDF-opslag duidelijk is.
