# Automatisch testen + zelfcorrectie in Claude Code

Drie lagen, van binnen naar buiten:

1. **Testsuite** — Vitest (unit/integratie) + golden-file tests voor LLM-output
2. **Hooks** — draaien tests automatisch na elke wijziging; bij falen krijgt Claude de fout terug en fixt zelf
3. **CI (GitHub Actions)** — vangnet vóór elke Vercel-deploy

---

## Stap 1 — Setup-prompt voor Claude Code

Kopieer dit in Claude Code om de testinfrastructuur te laten bouwen:

---

Zet een complete testinfrastructuur op voor dit project. Werkwijze:

**A. Testframework**
1. Installeer en configureer Vitest (met `@vitest/coverage-v8`). Voeg scripts toe aan package.json: `test`, `test:watch`, `test:related`, `test:coverage`.
2. Maak een `tests/` structuur die de src-structuur spiegelt: `tests/unit/`, `tests/integration/`, `tests/golden/`.

**B. Unit- en integratietests**
3. Schrijf eerst tests voor de kernlogica: berekeningen, validaties, parsers, transformaties. Elke functie met businesslogica krijgt minimaal: happy path, edge cases (leeg, null, extreme waarden), en foutpad.
4. Voor API-routes: integratietests die request → response valideren, inclusief foutstatussen (400/401/500). Mock externe services (Anthropic API, Voyage, Supabase) met vitest `vi.mock` of MSW — tests mogen NOOIT echte API-calls doen of echte data raken.
5. Voor Supabase-logica: test RLS-verwachtingen expliciet (tenant A mag data van tenant B niet zien) tegen een lokale Supabase-instantie of met een mock die het policy-gedrag simuleert.

**C. Golden-file tests voor LLM-output (screening)**
6. Maak 3–5 vaste testdossiers in `tests/golden/fixtures/` (geanonimiseerde convenant-fragmenten met bekende fouten per categorie).
7. Schrijf voor elk fixture een verwachtingsbestand: welke bevindingen MOETEN gevonden worden (categorie + severity), welke NIET mogen voorkomen (false positives).
8. Test in twee lagen:
   - **Deterministisch (draait altijd, gratis):** valideer de tool-use output tegen het JSON-schema — verplichte velden, geldige categorie-enum, geldige severity-waarden, geen lege bevindingen.
   - **Semantisch (draait op verzoek via `npm run test:eval`, kost API-calls):** stuur fixtures door de echte screening-pipeline en check of de verwachte bevindingen (op categorie+severity-niveau, niet op exacte tekst) aanwezig zijn. Rapporteer recall en false positives per categorie.
9. De semantische eval hoort NIET in de standaard testsuite of hooks (te traag, te duur, niet-deterministisch) — alleen handmatig of in CI bij wijzigingen aan prompts/skills.

**D. Regressiebescherming**
10. Bepaal na de eerste run een baseline. Elke toekomstige wijziging aan screening-prompts of skills moet de eval opnieuw draaien en mag de baseline niet verslechteren.

Rapporteer na afloop: welke tests er zijn, wat de coverage is van de kernlogica, en welke delen nog onbeschermd zijn.

---

## Stap 2 — Hooks-configuratie (zelfcorrigerende loop)

Plaats in `.claude/settings.json` (project-root, kan in git zodat het overal geldt):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'file=\"$CLAUDE_TOOL_INPUT_FILE_PATH\"; if [[ \"$file\" == *.ts || \"$file\" == *.tsx || \"$file\" == *.js ]]; then npx vitest related \"$file\" --run --passWithNoTests --reporter=dot 2>&1 | tail -15; fi; exit 0'"
          },
          {
            "type": "command",
            "command": "bash -c 'file=\"$CLAUDE_TOOL_INPUT_FILE_PATH\"; if [[ \"$file\" == *.ts || \"$file\" == *.tsx ]]; then npx tsc --noEmit --pretty 2>&1 | head -20; fi; exit 0'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npx vitest run --reporter=dot 2>&1 | tail -10"
          }
        ]
      }
    ]
  }
}
```

Hoe de zelfcorrectie werkt:

- **PostToolUse** draait na elke bestandswijziging alleen de *gerelateerde* tests + typecheck. Faalt er iets, dan ziet Claude de foutmelding direct in zijn context en herstelt het meteen — terwijl de wijziging nog vers is.
- **Stop** draait de volledige suite zodra Claude klaar is met een taak. Zo glipt er niets doorheen dat alleen bij samenhang tussen bestanden breekt.
- `exit 0` op de PostToolUse-hooks: falende tests geven feedback maar blokkeren de sessie niet.
- Wil je hard afdwingen dat Claude niet "klaar" mag zijn met falende tests, vervang de Stop-hook door een script dat bij falen `{"decision": "block", "reason": "<testoutput>"}` naar stdout schrijft — Claude wordt dan gedwongen door te werken tot de tests groen zijn. Let op: check dan het `stop_hook_active`-veld in de stdin-JSON en exit 0 als dat true is, anders krijg je een oneindige loop.

Vuistregels:
- Houd hooks snel (< 10s); volledige suites horen bij Stop, niet bij PostToolUse.
- Hooks draaien synchroon — een trage hook vertraagt élke edit.
- Semantische LLM-evals nooit in hooks (traag, duur, flaky). Die draaien handmatig of in CI.
- Laat een hook nooit zelf een agent/LLM aanroepen — recursiegevaar.
- Test elk hook-commando eerst los in de terminal voordat je het in de config zet.

## Stap 3 — CI als vangnet (GitHub Actions)

`.github/workflows/test.yml`:

```yaml
name: Tests
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
```

Koppel in Vercel de deploy aan een groene check ("Require status checks" op de main-branch in GitHub), zodat een falende suite nooit live gaat.

Optioneel: een tweede workflow die alleen draait als `prompts/` of `.claude/skills/` wijzigt en dan de semantische eval uitvoert (met `ANTHROPIC_API_KEY` als repository secret). Zo bewaak je automatisch dat prompt- of skill-wijzigingen de screeningkwaliteit niet verslechteren.

## Aanbevolen volgorde

1. Laat Claude Code eerst de testsuite bouwen (stap 1) — hooks zonder tests doen niets.
2. Voeg daarna alleen de Stop-hook toe en werk er een week mee.
3. Voeg vervolgens de PostToolUse-hooks toe als de suite snel genoeg is.
4. CI als laatste — dat is het vangnet, niet de feedbackloop.
