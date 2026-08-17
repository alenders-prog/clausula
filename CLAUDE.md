# CLAUDE.md

Guidance voor Claude Code bij dit project.

## Stack & Deployment

- **Frontend**: Één `index.html` — vanilla HTML/CSS/JS, geen build step.
- **Backend**: Vercel serverless functies in `/api/` (Node.js, ES modules).
- **Database**: Supabase (tabellen: `screeningen`, `situatie_kenmerken`, `document_templates`, `legal_chunks`).
- **AI**: Claude via Anthropic API (`claude-sonnet-4-6`), tool-use voor gestructureerde JSON-output.

## Lokaal draaien

```bash
vercel dev
```

Open daarna: http://localhost:3000

`vercel dev` emuleert de serverless omgeving lokaal en leest de `.env` voor de API-sleutels.

**Eerste keer opzetten:**
1. `vercel link` — project koppelen aan Vercel account
2. Vul `.env` in met de variabelen (te vinden in Vercel dashboard → Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` — JWT-format publieke key (voor server-side JWT-verificatie via `/auth/v1/user`)
   - `ANTHROPIC_API_KEY`
   - `NAAM_ENCRYPTION_KEY` — exact 64 hex-tekens (AES-256-GCM voor namen_map-versleuteling)
   - `RESEND_API_KEY` — voor uitnodigings-e-mails via `api/uitnodigen.js`
   - `ADOBE_CLIENT_ID` — voor PDF→DOCX conversie via Adobe PDF Services
   - `ADOBE_CLIENT_SECRET`
3. `vercel dev` starten

Het `.env` bestand staat in `.gitignore` — nooit committen.

## Bestandsstructuur

| Bestand / map | Doel |
|---|---|
| `index.html` | Volledige frontend (upload, rapport, opgeslagen analyses, concepten) |
| `api/analyseer.js` | POST — document analyseren via Claude, SSE-streaming |
| `api/claude-edge.js` | POST — Claude proxy (concept-generatie, vraag-antwoord), SSE |
| `api/adobe-start.js` | POST — PDF uploaden naar Adobe PDF Services, start export-job |
| `api/adobe-result.js` | POST — Adobe export-job status opvragen / DOCX ophalen |
| `api/naam-encrypt.js` | POST — namen versleutelen (AES-256-GCM) voor namen_map opslag |
| `api/naam-decrypt.js` | POST — namen ontsleutelen voor weergave / export |
| `api/uitnodigen.js` | POST — uitnodigingsmail sturen via Resend |
| `api/registreer.js` | POST — nieuwe gebruiker registreren (geen JWT vereist) |
| `api/_crypto.js` | Helper — AES-256-GCM encrypt/decrypt (gebruikt door naam-encrypt/decrypt) |
| `config.js` | Publieke Supabase-URL en anon key (ingeladen door `index.html`) |
| `vercel.json` | Vercel-configuratie (rewrites, maxDuration) |
| `.env` | Lokale API-sleutels (nooit committen) |

## Supabase-tabellen

- **`screeningen`** — opgeslagen analyses (`id`, `bestandsnaam`, `classificatie` jsonb, `rapport` jsonb, `namen_map` text (encrypted), `dossier_id` uuid, `versie_nr` integer, `versie_label` text, `created_at`, `updated_at`)
- **`situatie_kenmerken`** — taxonomie: `key`, `label`, `categorie`
- **`document_templates`** — verwachte secties per documenttype: `doc_type`, `section_name`, `required`, `applies_when`, `section_order`, `instructions`
- **`legal_chunks`** — wetsartikelen: `citation`, `content`, `topic_tags` (array, gebruikt `.overlaps()`)

## API-patroon

Alle endpoints gebruiken ES modules (`export default async function handler(req, res)`).  
Alle endpoints behalve `api/registreer.js` vereisen een Supabase JWT via `Authorization: Bearer <token>` — gevalideerd via `GET /auth/v1/user`.  
Claude wordt aangeroepen via `askClaude()` in `api/analyseer.js` (tool-use, gestructureerde JSON) en via streaming in `api/claude-edge.js` (concept-generatie, SSE).

## Git

Nooit automatisch pushen. Alleen pushen als de gebruiker dat expliciet vraagt.

## Kennisbank (`legal_chunks`) wijzigen

**Na elke wijziging of toevoeging van chunks — ook via het Supabase-dashboard —
`node scripts/kennisbank-check.mjs` draaien.**

De selectie in `api/analyseer.js` matcht `topic_tags` tegen `situatie_kenmerken.key`,
en die keys gebruiken **underscores**. Een chunk die je tagt met `koude-uitsluiting`
in plaats van `koude_uitsluiting` matcht daardoor nooit: hij staat in de database,
wordt nooit opgehaald, en er verschijnt nergens een foutmelding. In augustus 2026
stonden er zo zes tags in twee schrijfwijzen, waaronder tien chunks onder
`huwelijkse-voorwaarden` die buiten elke analyse vielen.

Let op: niet élk streepje is fout — `art-1:94-bw`, `pre-2012` en `hr-2006` horen zo.
Het gaat om tags die een tegenhanger met underscore hebben. De controle signaleert
precies dat onderscheid.

Een PostToolUse-hook draait deze controle automatisch bij het bewerken van bestanden
met `legal_chunk`, `wettekst` of `kennisbank` in de naam. Wijzigingen die je
rechtstreeks in het dashboard doet laten geen bestand achter, dus die vangt de hook
niet — daarvoor geldt de regel hierboven.

## Skills bijhouden

Skills in `.claude/skills/` leggen non-obvieuze kennis vast die niet direct uit de code
af te lezen is. Ze worden **niet automatisch bijgewerkt** — dit moet expliciet gebeuren.

**Bijwerkregel (verplicht toepassen):**
Na elke wijziging aan de bestanden hieronder — controleer of de bijbehorende skill(s)
bijgewerkt moeten worden en doe dat **in dezelfde sessie, vóór de commit**:

| Gewijzigd bestand | Betrokken skill(s) |
|---|---|
| `api/analyseer.js` | `screening-categorien`, `document-model` |
| `api/genereer-concept.js` | `concept-generatie` |
| `api/export-docx.js` | `concept-generatie` |
| `api/ai-assistent.js` | `clausula-assistent` |
| `index.html` — analyse-flow | `screening-categorien`, `document-model` |
| `index.html` — concept-flow | `concept-generatie` |
| `index.html` — assistent-flow | `clausula-assistent` |

Update de skill alleen als de wijziging **non-obvieuze** kennis toevoegt of verandert
(veldnamen, algoritmen, valkuilen, designbeslissingen). Triviale fixes hoeven niet.

Als code en skill **afwijken**: meld dit altijd expliciet aan de gebruiker.

De PostToolUse hook in `.claude/settings.json` geeft een automatisch signaal bij edits
op de API-bestanden — reageer daarop door de skill te beoordelen.
