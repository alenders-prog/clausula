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
2. Vul `.env` in met de drie variabelen (te vinden in Vercel dashboard → Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
3. `vercel dev` starten

Het `.env` bestand staat in `.gitignore` — nooit committen.

## Bestandsstructuur

| Bestand / map | Doel |
|---|---|
| `index.html` | Volledige frontend (upload, rapport, opgeslagen analyses) |
| `api/screen.js` | POST — document analyseren via Claude |
| `api/save.js` | POST — screening opslaan / bijwerken in Supabase |
| `api/screenings.js` | GET — lijst van opgeslagen analyses |
| `api/screening.js` | GET / DELETE — één screening ophalen of verwijderen |
| `api/export-docx.js` | POST — rapport exporteren als RTF-bestand |
| `vercel.json` | Vercel-configuratie (rewrites) |
| `.env` | Lokale API-sleutels (nooit committen) |

## Supabase-tabellen

- **`screeningen`** — opgeslagen analyses (`id`, `bestandsnaam`, `classificatie` jsonb, `rapport` jsonb, `created_at`, `updated_at`)
- **`situatie_kenmerken`** — taxonomie: `key`, `label`, `categorie`
- **`document_templates`** — verwachte secties per documenttype: `doc_type`, `section_name`, `required`, `applies_when`, `section_order`, `instructions`
- **`legal_chunks`** — wetsartikelen: `citation`, `content`, `topic_tags` (array, gebruikt `.overlaps()`)

## API-patroon

Alle endpoints gebruiken ES modules (`export default async function handler(req, res)`).  
Claude wordt aangeroepen via `askClaudeForJson()` in `screen.js` — altijd met een tool-definitie zodat de output gestructureerd JSON is.

## Git

Nooit automatisch pushen. Alleen pushen als de gebruiker dat expliciet vraagt.

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
| `index.html` — analyse-flow | `screening-categorien`, `document-model` |
| `index.html` — concept-flow | `concept-generatie` |

Update de skill alleen als de wijziging **non-obvieuze** kennis toevoegt of verandert
(veldnamen, algoritmen, valkuilen, designbeslissingen). Triviale fixes hoeven niet.

Als code en skill **afwijken**: meld dit altijd expliciet aan de gebruiker.

De PostToolUse hook in `.claude/settings.json` geeft een automatisch signaal bij edits
op de API-bestanden — reageer daarop door de skill te beoordelen.
