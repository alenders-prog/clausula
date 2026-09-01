---
name: project-token-architectuur
description: "Architectuuroverwegingen rondom token-limieten in Claude-calls — geanalyseerd, geïmplementeerd en openstaande verbeteringen voor technische documentatie"
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-21T10:28:08.588Z
---

# Token-architectuur: overwegingen en beslissingen

Uitgebreid besproken in sessie 2026-07-21. Moet worden verwerkt in de volgende update van `docs/technisch-document.html`.

---

## Aanleiding

Bij een analyse van Convenant + Ouderschapsplan werd de melding "tokenbudget bereikt" getoond.
De `bevindingen`-call (juridisch + grammatica + conflicten gecombineerd) haalde de harde grens van
9.000 output tokens voordat de tool-call compleet was. Convenant-bevindingen zijn inherent uitgebreider
dan OP-bevindingen — complexe juridische issues met IBAN-nummers, cross-doc redeneringen en
rekenkundige chains genereren 600–1.050 tekens per bevinding.

---

## Geïmplementeerd (2026-07-21)

### Optie 1 — MAX_OUTPUT_TOKENS constante
`api/analyseer.js` regel 37: `const MAX_OUTPUT_TOKENS = 32000;`
Bevindingen-call start nu direct op 32.000 tokens (was 9.000 → 16.000 tussenstap).
**Kosten zijn per gebruikt token, niet per max_tokens-plafond** — instelling hoger zetten kost niets extra.

### Optie 4 — Automatische herpoging bij overschrijding
Wanneer `stop_reason === 'max_tokens'` en `_herpoging === false`:
- Retry met `Math.min(maxTokens * 2, MAX_OUTPUT_TOKENS)`
- Bij tweede treffer: echte fout + gebruikersmelding
- Catch structuur-calls die onverwacht het 6.000-plafond raken (zeldzaam)

---

## Kostenschatting (typische analyse Convenant + OP)

| Post | Tokens | Kosten |
|---|---|---|
| Non-cached input | ~38.500 | $0,116 |
| Cache writes (wetsartikelen etc.) | ~11.600 | $0,044 |
| Cache reads | ~23.200 | $0,007 |
| Output (werkelijk gebruikt) | ~17.000 | $0,255 |
| Haiku classificatie | ~4.400 | $0,005 |
| **Totaal** | | **~$0,43** |

Output tokens zijn ~60% van de kosten. Verdere outputreductie heeft direct effect op prijs.

**Why:** output-kosten domineren → architectuurkeuzes die output reduceren zijn financieel relevant.

---

## Openstaande architectuurverbeteringen (nog niet geïmplementeerd)

### Selectieve veldlimieten (aanbevolen quick win)
Alleen `onderwerp` (max 70 tekens) en `aanbeveling` (max 250 tekens) begrenzen.
`bevinding` vrij laten — dit is waar de juridische kwaliteit zit.
**Besparing: ~10–15% output tokens. Kwaliteitsverlies: geen.**

Gevalideerd op drie concrete issues:
- IBAN rekeninghouder (HOOG, cross-doc): bevinding 750 tekens — selectieve limiet raakt dit niet
- Rekenkundige inconsistentie (MIDDEN, per-doc): bevinding 425 tekens — fits easily
- Zorgkorting verblijfsverdeling (MIDDEN, cross-doc): bevinding 1.030 tekens — selectieve limiet raakt dit niet

Conclusie: uniforme bevindinglimieten kapt precies de complexe cross-doc issues af die het meest waardevol zijn.

### Kern + toelichting structuur (grotere refactor, hogere waarde)
Bevinding splitsen in twee subvelden:
- `kern`: max 120 tekens — de essentie in één zin (altijd aanwezig, scanbaar in kaartweergave)
- `toelichting`: onbegrensd — bewijs, redenering, specifieke getallen (optioneel, zichtbaar bij uitklappen)

**Besparing: ~35–59% output tokens bij complexe issues. Kwaliteitsverlies: geen.**
**Bijkomend voordeel: kern is direct leesbaar zonder kaart te openen → betere UI-scanbaarheid.**

Vereist:
1. Tool-schema uitbreiden met `kern` en `toelichting` velden (vervangt `bevinding`)
2. UI aanpassen: `kern` tonen in samengevouwen kaart, `toelichting` bij uitklappen
3. Deduplicatielogica update (Pass 4 Jaccard werkt nu op `bevinding`, moet op `kern` of gecombineerd)

### Analyse architectuur (indien verder schalen nodig)
Huidige bevindingen-call bundelt 4 dimensies (juridisch + balans + grammatica + conflicten).
Alternatief: 3 gerichte calls per document:
- `structuur` (volledigheid + MfN) — 5.000 tokens
- `juridisch` (juridisch + conflicten) — 8.000 tokens
- `taal` (grammatica + balans) — 4.000 tokens
Elke call heeft afgebakende scope → output voorspelbaarder. 7 gelijktijdige calls bij 2 docs.

---

## Bevindinglengte-patroon

Cross-doc issues zijn structureel langer dan per-doc issues, ongeacht ernst:
- Cross-doc HOOG: ~750 tekens (IBAN chain + naamsmismatch over 2 docs)
- Cross-doc MIDDEN: ~1.030 tekens (zorgkorting + verblijfsverdeling verband uitleggen)
- Per-doc MIDDEN: ~425 tekens (rekenkundige inconsistentie met getallen)

**How to apply:** Bij toekomstige architectuurkeuzes voor outputbegrenzing: behandel cross-doc issues altijd als speciale categorie met ruimere limieten.
