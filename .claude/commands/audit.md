Je bent een senior software auditor. Voer een complete, diepgaande audit uit van dit project. Voer NIETS uit en wijzig GEEN code totdat de volledige analyse klaar is — eerst rapport, daarna pas (na mijn akkoord) fixes.

## Fase 0 — Inventarisatie

1. Breng de projectstructuur in kaart: mappen, entry points, API-routes, database-laag, externe services.
2. Identificeer de tech stack en versies (package.json, lockfile, config files, env-template).
3. Lees CLAUDE.md en alle skills in `.claude/skills/` (en `\~/.claude/skills/` indien relevant).
4. Noteer wat het project functioneel doet, zodat je juistheid kunt toetsen aan de bedoeling.

## Fase 1 — Juistheid (correctness)

* Loop de kernlogica regel voor regel na: klopt de implementatie met de bedoelde functionaliteit?
* Zoek naar: off-by-one fouten, verkeerde vergelijkingen, race conditions, niet-afgehandelde edge cases (lege input, null/undefined, unicode, grote bestanden).
* Controleer foutafhandeling: worden errors gevangen, gelogd én zinvol teruggegeven aan de gebruiker? Zijn er silent failures?
* Controleer datavalidatie aan de serverkant (nooit alleen client-side vertrouwen).
* Bij API-integraties (Anthropic Messages API, Voyage, Supabase): klopt het request/response-contract? Wordt `tool\_choice` correct gebruikt? Worden alle content blocks verwerkt (niet alleen het eerste text block)? Is er retry/backoff bij 429/529?
* Bij asynchrone code: ontbrekende `await`s, unhandled promise rejections, parallelisatie waar dat kan (`Promise.all`).

## Fase 2 — Snelheid \& optimalisatie

* Identificeer de duurste operaties (API-calls, database queries, embeddings, file processing).
* Database: N+1 queries, ontbrekende indexen, onnodige `select \*`, RLS-policies die per rij zware subqueries draaien, pgvector index-configuratie passend bij tabelgrootte.
* LLM-calls: wordt prompt caching optimaal benut (statische delen vooraan, cache breakpoints goed geplaatst)? Kan `max\_tokens` strakker? Kunnen calls parallel? Is het gekozen model per taak passend (niet zwaarder dan nodig)?
* Serverless (Vercel): cold start-gevoeligheid, bundle size, timeouts, streaming waar zinvol, zware dependencies die client-side kunnen.
* Frontend: onnodige re-renders, ontbrekende memoization waar het meetbaar uitmaakt, bundlegrootte, lazy loading.
* Geef per bevinding een inschatting van de winst (bijv. "bespaart \~40% tokens per screening" of "reduceert query van O(n²) naar O(n)").

## Fase 3 — Effectiviteit \& architectuur

* Is de oplossing niet onnodig complex? Kan hetzelfde met minder code, minder dependencies, minder abstractielagen?
* Dode code, ongebruikte exports, dubbele logica die naar een gedeelde functie kan.
* Consistentie: naamgeving, foutafhandeling, response-formaten over alle endpoints heen.
* Schaalbaarheid: wat breekt er bij 10x meer gebruikers/dossiers/documenten? Multi-tenancy waterdicht (RLS getest, geen tenant-lekkage via joins of storage paths)?
* Configuratie: hardcoded waarden die naar env of config moeten (prijzen, limieten, modelnamen).

## Fase 4 — Security \& privacy

* Secrets: geen API keys in code of client bundle; env-variabelen alleen server-side waar nodig.
* Supabase: RLS op ALLE tabellen aan? Service role key nooit client-side? Storage buckets afgeschermd?
* Input sanitization, SQL-injectie (ook via RPC), XSS bij weergave van gebruikerscontent, prompt injection via geüploade documenten.
* AVG/GDPR: wordt persoonsdata geminimaliseerd, niet onnodig gelogd, en client-side verwerkt waar dat kan?
* Auth: magic links / sessies correct gevalideerd op elke beschermde route (niet alleen in de UI verborgen)?

## Fase 5 — Skills-audit (`.claude/skills/`)

Controleer elke skill afzonderlijk:

1. **Juistheid**: klopt de inhoud nog met de huidige codebase? Verwijzen paden, bestandsnamen, functienamen en schema's naar dingen die nog bestaan?
2. **Actualiteit**: staan er verouderde modelnamen, API-versies, dependencies of werkwijzen in die inmiddels anders zijn in de code? Markeer elke discrepantie tussen skill en werkelijkheid.
3. **Triggering**: is de `description` in de frontmatter zo geschreven dat de skill betrouwbaar geactiveerd wordt bij relevante taken (concrete triggers, ook impliciete)? Te vaag = wordt gemist; te breed = vervuilt context.
4. **Overlap \& conflicten**: spreken skills elkaar tegen? Staat dezelfde informatie op meerdere plekken (single source of truth)?
5. **Volledigheid**: ontbreken er skills voor terugkerende taken die nu telkens opnieuw uitgelegd moeten worden?
6. **Omvang**: is de SKILL.md compact (kerninstructies) met details in aparte referentiebestanden, of één onhanteerbaar document?

Geef per skill: status (✅ actueel / ⚠️ deels verouderd / ❌ klopt niet meer), concrete afwijkingen, en een voorgestelde correctie.

## Fase 6 — Rapport

Lever één gestructureerd rapport op in dit formaat:

```
# Audit-rapport \[projectnaam] — \[datum]

## Samenvatting
(3–5 zinnen: algehele staat, grootste risico's, grootste kansen)

## Bevindingen
Per bevinding:
- ID: \[F-001]
- Categorie: Juistheid / Performance / Architectuur / Security / Skills
- Ernst: 🔴 Kritiek / 🟠 Hoog / 🟡 Middel / 🟢 Laag
- Locatie: bestand + regelnummer
- Probleem: wat is er mis en waarom
- Impact: wat gebeurt er als dit blijft staan
- Oplossing: concreet voorstel, waar zinvol met code-diff

## Quick wins
(fixes < 30 min met duidelijke winst, gesorteerd op rendement)

## Structurele verbeteringen
(grotere refactors met inschatting van inspanning en opbrengst)

## Skills-status
(tabel: skill | status | belangrijkste afwijking | actie)

## Voorgestelde volgorde van aanpak
(genummerd plan: eerst kritieke fixes, dan quick wins, dan structureel)
```

## Spelregels

* Wees kritisch en concreet. "Kan beter" is geen bevinding; "regel 142: query in loop, verplaats naar batch-select" wel.
* Onderbouw performance-claims: leg uit wáárom iets sneller wordt.
* Geen aannames over intentie: als iets bewust zo lijkt gebouwd, benoem het als vraag in plaats van fout.
* Als het project te groot is voor één analyse, stel dan eerst een scope-volgorde voor en werk die per deel af.
* Na het rapport: wacht op mijn akkoord voordat je fixes doorvoert. Voer fixes daarna één voor één door, per bevinding-ID, met een korte verificatie na elke fix.



