---
name: concept-generatie
description: Architectuur, veldnamen, prompt-regels en valkuilen voor de concept-generatie feature van Clausula (de "Genereer concept" + "Bekijk concept" flow met accept/afwijs workflow en DOCX-export). Gebruik deze skill bij het aanpassen van de conceptknop-handler, markeerWijzigingenInDom, toonConceptReview, de DOCX-patcher, of de prompt-regels voor zoek_tekst/vervang_door.
---

# Concept-generatie feature

## Twee code-paden — NIET verwisselen

Er zijn twee afzonderlijke implementaties die op elkaar lijken maar fundamenteel anders werken:

### Pad A — Client-side (actief in gebruik)
Bestand: `index.html`, handler van `genereerConceptBtn` (~regel 6008).

- Roept `askClaudeForJson()` **direct vanuit de browser** aan.
- Tool: `registreer_concept` met velden **`zoek_tekst`** / **`vervang_door`**.
- Na ontvangst normaliseert de code deze naar `originele_tekst` / `aangepaste_tekst` (regel ~6244).
- Past vervangingen client-side toe op de documenttekst via regex-matching.
- Sla output op in `rapport._concepts[docType]`.

### Pad B — Server-side (beschikbaar maar niet de primaire flow)
Bestand: `api/genereer-concept.js`.

- Tool: `document_wijzigingen` met velden **`originele_tekst`** / **`invoeg_na`** / **`aangepaste_tekst`**.
- Ondersteunt ook **invoeging** (nieuw artikel): `invoeg_na` niet-leeg + `originele_tekst` leeg.
- Batch-verwerking: max 5 verbeterpunten per Claude-call, parallel via `Promise.all`.
- Robuustere server-side deduplicatie en overlap-detectie.

> **Valkuil**: als je de prompt van `registreer_concept` aanpast, verander dan NIET automatisch ook `document_wijzigingen` mee — het zijn twee aparte tools voor twee aparte flows.

---

## Veldnamen door de hele flow

| Fase | Veldnaam bij Claude | Veldnaam na normalisatie | Opgeslagen als |
|------|---------------------|--------------------------|----------------|
| Client-tool response | `zoek_tekst` | `originele_tekst` | `originele_tekst` |
| Client-tool response | `vervang_door` | `aangepaste_tekst` | `aangepaste_tekst` |
| Server-tool response | `originele_tekst` | — | `originele_tekst` |
| Server-tool response | `aangepaste_tekst` | — | `aangepaste_tekst` |
| Server-tool response | `invoeg_na` | — | `invoeg_na` |

`artikel`, `item_nr`, `wat_gewijzigd` komen in beide tools voor en hebben dezelfde betekenis.

`ook_aangepast: string[]` — informatief; lijst artikelen die logisch geraakt worden.
**De patcher doet hier niets mee.** Niet in de prompt aanmoedigen om hier extra wijzigingen te doen.

---

## Prompt-regels voor zoek_tekst (client-side tool)

Deze regels staan in de systeemprompt van de `genereerConceptBtn` handler:

1. **Maximaal 1–2 aaneengesloten zinnen uit DEZELFDE alinea.** Nooit een alinea-grens overschrijden.
2. **Combineer overlappende wijzigingen.** Als twee verbeterpunten dezelfde passage raken: één `zoek_tekst` + één `vervang_door`.
3. **Nooit tekst weglaten** uit `zoek_tekst` die ongewijzigd blijft in `vervang_door`.
   - ✗ FOUT: `zoek_tekst="Zin A. Zin B. Zin C."`, `vervang_door="Zin A. Zin C."` — Zin B verdwijnt!
   - ✓ GOED: `zoek_tekst="Zin B."`, `vervang_door="Zin B verbeterd."`
4. **Nooit ongewijzigde zinnen als buffer in `zoek_tekst` opnemen.** Als alleen Zin B verandert, mag `zoek_tekst` niet ook Zin A (voor) of Zin C (na) bevatten — ook als ze in `vervang_door` letterlijk worden herhaald. De track-changes-weergave markeert de hele `zoek_tekst` als `<del>`, waardoor ongewijzigde zinnen ten onrechte als doorgestreept verschijnen.
5. **Bij een toevoeging (nieuwe zin invoegen):** gebruik als `zoek_tekst` uitsluitend de zin waarvóór of waarna ingevoegd wordt.
   - ✗ FOUT: `zoek_tekst="[Zin A]. [Zin B]."`, `vervang_door="[Zin A]. [NIEUW]. [Zin B]."`
   - ✓ GOED: `zoek_tekst="[Zin B]."`, `vervang_door="[NIEUW]. [Zin B]."` (invoegen vóór Zin B)
6. Sectietitels en artikelnummers alleen in `zoek_tekst` als die zelf de fout bevatten.
7. `vervang_door=""` (lege string) als een zin verwijderd moet worden.
8. **KRITIEK — alinea met meerdere zinnen, slechts één bedrag/getal/datum wijzigt:**
   `zoek_tekst` = uitsluitend de zin MET dat bedrag/getal. NOOIT de omliggende zinnen meenemen.
   - ✗ FOUT: `zoek_tekst="Zin A €462,-. Zin B. Zin C."`, `vervang_door="Zin A €463,-."` → Zin B en C verdwijnen!
   - ✓ GOED: `zoek_tekst="Zin A €462,-."`, `vervang_door="Zin A €463,-."` — prompt heeft dit expliciet als ABSOLUTE VERBODEN.

---

## Vangnet: wijzigingenSanitized (code-level)

Na ontvangst van `wijzigingenRaw` van Claude, vóór toepassing, loopt er een sanitatie-stap
(`wijzigingenSanitized`) die het "te veel weggehaald"-patroon automatisch herstelt:

```
zoek.length >= vervang.length * 1.4 + 40  AND  zinnen.length >= 2
→ zoek_tekst getrimd tot de zin waarvan de eerste 7 woorden overeenkomen met vervang_door
```

**Wanneer triggered**: Claude levert `zoek_tekst` = volledige alinea (3+ zinnen), `vervang_door` = 1 zin.  
**Wat het doet**: zoek_tekst → alleen de gewijzigde zin; vervang_door blijft ongewijzigd.  
**Wanneer NIET ingrijpen**: als geen zin in zoek_tekst overeenkomt (eerste 7 woorden) met vervang_door.  
**Let op**: `wijzigingenSanitized` wordt doorgegeven aan `wijzigingenGefilterd` (zie hieronder) — de
"Origineel"-tab toont de gecorrigeerde (kortere) originele_tekst.

## Cross-document filter: wijzigingenGefilterd (code-level)

Na `wijzigingenSanitized` loopt een **cross-document filter** die wijzigingen verwijdert waarvan
`zoek_tekst` niet letterlijk terugkomt in `snapOrigineel` (het huidige document).

**Probleem dat dit oplost**: bij multi-doc analyse (convenant + ouderschapsplan) geeft Claude
soms `zoek_tekst` met tekst die ALLEEN in het referentiedocument staat. Die wijziging
kan niet worden toegepast → orange "niet-toegepast" badge, verwarrend voor de gebruiker.

**Werking**:
```
// _normDoc = GEANONIMISEERDE snapOrigineel (met nep-namen — zelfde "taal" als zoek_tekst)
anker = normZoek.slice(0, 40)  (eerste 40 chars, normalized)
new RegExp(anker.replace(/ /g, '\\s+')).test(_normDoc)
→ false: verwijder wijziging + console.warn
```

**Valkuil (opgelost 2025-07)**: `_normDoc` moet de GEANONIMISEERDE versie van `snapOrigineel`
zijn (`anonimiseerTekst(snapOrigineel, snapNaarAnon)`). Als `_normDoc` echte namen bevat maar
`zoek_tekst` nep-namen, matcht de anker nooit — legitieme wijzigingen met een persoonsnaam
aan het begin worden dan onterecht gefilterd. De fix zit in het concept-generatie-blok in `index.html`.

**Volgorde volledige pipeline**:
`wijzigingenRaw` → `wijzigingenSanitized` (te-veel-weggehaald trim) → `wijzigingenGefilterd` (cross-doc filter) → `wijzigingenGenorm` (veldnamen normaliseren) → `wijzigingenEcht` (de-anonimiseren) → display/opslag

## Pseudonimisering round-trip

Issue-teksten bevatten echte namen (al de-pseudonimiseerd). Vóór verzending naar Claude
worden ze opnieuw gepseudonimiseerd via `anonimiseerTekst(t, snapNaarAnon)`.

Claude's output (`wijzigingenRaw`) wordt daarna ge-de-pseudonimiseerd via
`herstelAnonObj(wijzigingenGenorm, snapNaarEcht)` **vóórdat** het concept wordt opgeslagen.

**Nep-namen ipv placeholders (vanaf 2025-07):**
- Persoonsnamen worden als nep-namen verstuurd (bijv. "Thomas Bergman") — niet als `[PERSOON_A]`.
- `snapNaarEcht` bevat `"Thomas Bergman" → "Martijn Jasperse"` én legacy `"[PERSOON_A]" → "Martijn Jasperse"`.
- `herstelAnonObj` herkent nep-namen (case-insensitief regex) én legacy bracket-placeholders (exact + fuzzy).

> **Valkuil**: als de de-pseudonimisering wordt overgeslagen, bevatten opgeslagen wijzigingen
> nep-namen (bijv. "Thomas Bergman") in plaats van echte namen.

`snapAndere` (het andere document, nu NIET meer gebruikt in analyse) wordt ook niet
de-pseudonimiseerd — als het toch wordt meegegeven, bevat het nep-namen.

---

## Snapshots bij generatie-start

Alle context wordt vastgelegd op het moment van klikken (de gebruiker kan daarna wisselen):

```
snapId          — huidigeId (screeningen UUID)
snapRapport     — huidigRapport (volledig object)
snapDocType     — actief documenttype op tabblad
snapAangevinkt  — aangevinkte issues
snapOrigineel   — documenttekst van dit doctype (via haalDocTypeTekst)
snapAndere      — andere hoofddocumenten als referentiecontext (max 4000 tekens elk)
snapBestand     — PDF File-object voor DOCX-conversie
snapNaarAnon    — pseudonimiseringsmap (echte naam → placeholder)
snapNaarEcht    — de-pseudonimiseringsmap (placeholder → echte naam)
```

---

## Fire-and-forget met chip-tracking

De generatie draait in een `(async () => { ... })()` zonder outer `await` — de gebruiker
wordt niet geblokkeerd. Status wordt bijgehouden in `_generaties: Map<genId, entry>`:

- Status: `'bezig'` → `'klaar'` of `'fout'`
- Chips worden gerenderd door `renderConceptChips()`
- Als de gebruiker nog op dezelfde screening is bij voltooiing (`huidigeId === snapId`),
  opent `toonConceptReview()` automatisch

---

## Concept-opslagschema in huidigRapport

```json
rapport._concepts[docType] = {
  "document_tekst":  "...",     // aangepaste tekst (na toepassen wijzigingen)
  "origineel_tekst": "...",     // snapshot van het origineel (voor diff/weergave)
  "wijzigingen": [
    {
      "item_nr": 1,
      "artikel": "...",
      "wat_gewijzigd": "...",
      "originele_tekst": "...", // te vervangen passage (verbatim uit origineel)
      "aangepaste_tekst": "...",
      "ook_aangepast": [],      // informatief — niet functioneel
      "invoeg_na": ""           // alleen server-side pad
    }
  ],
  "gegenereerd_op": "2026-07-10T..."
}
```

**Legacy**: `rapport._concept` (enkelvoudige structuur, zelfde velden).
Opzoekpatroon — altijd dit gebruiken:
```js
rapport._concepts?.[docType]
  || (docType === classificatie?.doc_type ? rapport._concept : null)
```

---

## Accept/afwijs workflow

- State: `_wijzigingAcceptatie: Map<origIdx, 'geaccepteerd'|'afgewezen'>`
- `origIdx` = index in de **originele** `_conceptWijzigingen` array (vóór sortering)
- Sortering in `toonConceptReview()` gebruikt `origIdx` als referentie naar de Map — nooit
  de gesorteerde positie gebruiken als Map-sleutel
- `_alleWijzigingenBeantwoord()` → true als elke index ofwel 'geaccepteerd' of 'afgewezen' is
- Download-knop krijgt klasse `.download-pending` zolang niet alles beantwoord is;
  de `.download-pending::after` CSS toont een hover-tooltip (geen inline tekst meer)
- Gesorteerde volgorde: `zoek_tekst || invoeg_na || artikel` als zoeksleutel in brontext

---

## markeerWijzigingenInDom() — track-changes in document-viewer

Zoekt `originele_tekst` (na normalisatie) in individuele DOM-elementen
(`p, li, h1–h6, td, th`). Altijd **inline** vervanging:

```js
el.innerHTML =
  escH(raw.slice(0, pos))
  + `<del class="cdoc-del">${escH(raw.slice(pos, pos + zoek.length))}</del>`
  + `<ins class="cdoc-ins">${escH(vervang)}</ins>`
  + escH(raw.slice(pos + zoek.length));
```

Zoekstrategie (candidates): volledige tekst → eerste 60 tekens → eerste 40 → eerste 20.
Stopt bij eerste treffer (`break outer`). Nooit meer dan één element per wijziging markeren.

> **Valkuil**: als `originele_tekst` een alinea-grens overschrijdt, vindt de DOM-zoeking
> geen enkel element dat de volledige tekst bevat. De fallback (60/40/20 tekens) markeert
> dan alleen het begin van de eerste alinea. Prompt-regel 1 (max 1–2 zinnen, geen
> alinea-grens) voorkomt dit.

---

## DOCX-export: twee patcher-functies

| Functie | Doel | Output |
|---------|------|--------|
| `pasWijzigingenToeInDocx()` | Track-changes voor weergave en download | OOXML met `<w:del>`/`<w:ins>` |
| `vervangInDocxXmlSchoon()` | Schone vervanging voor heranalyse | Gewone tekst, geen markup |

### Valkuil in `vervangInDocxXml` — "te veel weggehaald"

`vervangInDocxXml` heeft een conditie die de **volledige OOXML-alinea (`<w:p>`)** als `<w:del>` markeert
wanneer de match aan het begin staat en er tekst na volgt:

```js
// VOOR (bug):
if (!txtVoor.trim() && txtNa.trim()) { txtOud = txt; txtNa = ''; }

// NA (fix):
if (!txtVoor.trim() && txtNa.trim() && zoekNorm.length < oudNorm.length) {
  txtOud = txt; txtNa = '';
}
```

**Wanneer dit probleem optreedt**: `zoek_tekst` = eerste zin van een alinea met 3 zinnen.
- De match staat aan het begin (`idx=0`), de andere 2 zinnen volgen in `txtNa`
- Vóór de fix: conditie vuurt → alle 3 zinnen in `<w:del>` (ook zinnen B en C verdwijnen!)
- Na de fix: conditie vuurt ALLEEN als `zoekNorm` ingekort was (multi-alinea-geval)

**Twee code paths** voor track-changes weergave:
1. `markeerWijzigingenInDom` (HTML viewer) — had dit probleem NIET (werkt op DOM-niveau)
2. `vervangInDocxXml` (DOCX viewer/download) — had dit probleem WEL (OOXML-niveau)

De schone variant mag **nooit** `<w:del>`/`<w:ins>` bevatten — Claude ziet die anders als
letterlijke tekst bij heranalyse.

`cleanupDocxArtefacten()` verwijdert Adobe-voettekst-artefacten ("paraaf man: paraaf vrouw:",
paginanummers "n/m") vóórdat de DOCX naar Claude wordt gestuurd.

---

## Ongematchte wijzigingen — badge-systeem

Na DOCX-rendering worden twee Sets gevuld (side-channel van `vervangInDocxXml`):
- `_toegepasteWijzigingIdx` — wijzigingen die succesvol gematcht zijn
- `_alVerwerktWijzigingIdx` — wijzigingen waarvan de originele tekst al verwerkt is door een eerdere wijziging

`markeerNietToegepasteKaarten()` voegt badges toe:
- `.change-niet-toegepast` + waarschuwingstekst: originele tekst niet gevonden
- `.change-al-verwerkt` + infotekst: al meegenomen door een eerdere wijziging
