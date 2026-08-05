# Consistentie-architectuur: juridische feiten + post-processing validatie

## Motivatie

Het systeem-prompt stuurt Claude's redenering, maar kan niet garanderen dat
aannames en signalen intern consistent zijn. In de praktijk bleek Claude:

1. Een correct aanname te maken ("koude uitsluiting → privébezit man")
2. Maar daarna een signaal te genereren dat dit tegenspreekt ("vrouw als mede-eigenaar")

Oorzaak: de meerpartijdigheidsregel (bedoeld voor intent=opties) lekte door naar
casus-signalen via het `balans`-perspectief. Losse prompt-patches per scenario
werken niet structureel — elke nieuwe edge case vereist een nieuwe patch.

## Oplossing: twee lagen in `api/ai-assistent.js`

Alle feiten-logica is geïsoleerd in `api/_feiten.js` (getest via `tests/feiten.test.mjs`).
`ai-assistent.js` importeert: `verrijkResolvedFields`, `bouwFeitenBlok`, `valideerConsistentie`.

### Laag 1a — `verrijkResolvedFields(resolvedFields, dossierContext)`

Extraheert HV-stelsel, relatievorm en woning_eigenaar uit de vrije dossiertekst als de
structuurvelden leeg zijn. Structuurvelden hebben altijd prioriteit.

### Laag 1b — `bouwFeitenBlok(rijkeFields)`

Deterministisch, vóór de Claude-call. Vertaalt verrijkte resolvedFields naar een
`[JURIDISCHE FEITEN]` + `[BELANG-ANALYSE]`-blok dat als harde feiten in de user-prompt
wordt ingevoegd (na `[BEKENDE GEGEVENS]`, vóór `[CLAUSULE-STIJL]`).

De [BELANG-ANALYSE] bevat een expliciete CONVENANT-CONCLUSIE (bijv. "hoort NIET in het
convenant") zodat de system-prompt beslisschema alleen de tijdshorizon hoeft te beoordelen.

Claude hoeft feiten niet af te leiden — ze staan er al als vaststaande constraints.

**Gedekte resolvedFields:**

| Veld | Wat wordt ingevoegd |
|---|---|
| `hv_stelsel = koude_uitsluiting` | Privébezit inbrenger; geen gezamenlijk eigendom als default; geen mede-aansprakelijkheid; balans-signalen op privévermogen foutief |
| `hv_stelsel = beperkte_gemeenschap` | Privévermogen vóór huwelijk en erfenissen blijven privé; schulden vóór huwelijk zijn privéschulden |
| `hv_stelsel = algehele_gemeenschap` | Alles gemeenschap tenzij uitdrukkelijk privé |
| `hv_stelsel` bevat "periodiek verrekening" | Stolp-jurisprudentie als nooit verrekend |
| `hv_stelsel` bevat "finaal verrekening" | Verrekening bij scheiding alsof gemeenschap |
| `relatievorm = samenwoners` | Geen WVPS, geen partneralimentatie, geen art. 1:88 |
| `relatievorm = geregistreerd_partnerschap` | Grotendeels gelijk aan gehuwd |
| `uitsluitingsclausule = ja` | Erfenis/schenking privébezit ontvanger, geen aanspraak andere partij |
| `pensioen_verevening = uitgesloten/nee/geen` | Geen verevening; genereer geen vereveningssignalen |
| `co_ouderschap = ja/true` | IACK/WKB splitsing; BRP-hoofdverblijf bij één ouder |

### Laag 2 — `valideerConsistentie(output, rijkeFields)`

Deterministisch, ná de Claude-call. Filtert signalen die aantoonbaar onjuist zijn
gegeven de vastgestelde feiten. Geeft een `console.warn` bij elke verwijdering.

**Filterregels:**

| Conditie | Verwijderd als signaal zegt |
|---|---|
| Koude uitsluiting (of aanname "privébezit") | Niet-eigenaar als mede-eigenaar / gerechtigde / aansprakelijke voor hypotheek (perspectief balans of financieel) |
| Relatievorm samenwoners | Pensioenverevening / WVPS / partneralimentatie (tenzij signaal expliciet zegt "geen recht op") |
| Pensioenverevening uitgesloten | Pensioenverevening zonder "uitgesloten" in de tekst |

## Wat de code-laag NIET dekt

- Verrekenbedingen (vereisen interpretatie HV-tekst)
- Onderneming + beleggingsleer (casusgericht)
- DGA rekening-courant
- Internationaal element / IPR
- Nieuw ontdekte contradictiepatronen

Deze gevallen blijven afhankelijk van systeem-prompt en kennisbank.

## Uitbreidingsinstructie

Bij een nieuwe ontdekte contradictie:
1. Identificeer welk `resolvedFields`-veld de fout veroorzaakt
2. Voeg een patroon toe in `api/_feiten.js` → `bouwFeitenBlok` (evt. ook `verrijkResolvedFields`)
3. Voeg een filterregel toe in `valideerConsistentie`
4. Voeg een test toe in `tests/feiten.test.mjs` en run `node tests/feiten.test.mjs`
5. Documenteer in de tabel hierboven
