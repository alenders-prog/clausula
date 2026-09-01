---
name: project-dashboard-spec
description: "Specificatie voor het analytics dashboard — KPI-kaarten, verbeterpunten per categorie, trendgrafiek, top issues, AI-aanbevelingen"
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-08-01T09:57:17.779Z
---

# Dashboard specificatie

Gebaseerd op screenshot van gebruiker (28-jul-2026).

## Bovenste balk — KPI-kaarten (5 stuks)
| Kaart | Waarde (voorbeeld) | Delta |
|---|---|---|
| Actieve dossiers | 24 | +3 t.o.v. vorige 30 dagen |
| Afgeronde dossiers | 87 | +18 t.o.v. vorige 30 dagen |
| Wacht op analyse | 9 | -2 t.o.v. vorige 30 dagen |
| Geanalyseerde documenten | 312 | Laatste 30 dagen |
| Gem. kwaliteitsscore | 82% | +6% t.o.v. vorige 30 dagen |

## Filterbar
- Periode: Vandaag / Laatste 30 dagen / Dit kwartaal / Dit jaar
- Document: checkbox Ouderschapsplan / Convenant
- Mediator: dropdown "Alle mediators"
- Laatste update timestamp + refresh-knop

## Linksonder — Verbeterpunten per categorie en ernst (gestapelde balk)
Categorieën (met emoji/icoon):
- Juridisch: Hoog 12 / Midden 34 / Laag 41 → Totaal 87
- Balans: 4 / 18 / 22 → 44
- Conflicten: 6 / 21 / 38 → 65
- Grammatica: 2 / 14 / 73 → 89
- MfN compatibiliteit: 3 / 11 / 29 → 43
- **Totaal: Hoog 27 / Midden 98 / Laag 203 → 328**

Kleuren: Hoog = rood, Midden = oranje, Laag = groen

## Middenonder — Trendgrafiek (lijndiagram)
- X-as: weken (bijv. 30 jun–6 jul, 7–13 jul, 14–20 jul, 21–27 jul)
- Y-as: aantal verbeterpunten (0–120)
- Lijnen per categorie: Juridisch, Balans, Conflicten, Grammatica, MfN compatibiliteit
- Naast grafiek: "Wat zien we?" tekstblok met automatische observaties:
  - ↓ Juridische fouten dalen 18% (groen)
  - = Grammaticale opmerkingen blijven stabiel (grijs)
  - ↑ Conflictrisico stijgt bij ouderschapsplannen (rood)
  - ↑ MfN-compatibiliteit verbetert (groen)

## Rechtsonder (3e kolom) — AI-aanbevelingen
Twee secties:
- **Prioriteit hoog** (rood label):
  - Verminder juridische inconsistenties in ouderschapsplannen
  - Extra controle op escalerende conflictformuleringen
  - Veel dossiers missen nog een convenantanalyse
- **Quick wins** (groen label, vinkjes):
  - 73% van de grammaticale opmerkingen zijn automatisch op te lossen
  - Hergebruik succesvolle clausules uit dossiers met >95% score
  - Analyseer eerst de 9 wachtende dossiers

## Linksonder (4e blok) — Top terugkerende issues (laatste 30 dagen)
Tabel: rang / omschrijving / aantal
1. Onvoldoende specifieke verdeling zorgtaken — 36
2. Onheldere communicatie over besluitvorming — 29
3. Tegenstrijdige afspraken over vakanties — 24
4. Ontbrekende beëindigings- of wijzigingsclausule — 21
5. Niet voldoen aan MfN-richtlijn informatieplicht — 18

## Rechts van top-issues — Donut grafiek totaal verbeterpunten
- Totaal: 328
- Hoog (8%): 27
- Midden (30%): 98
- Laag (62%): 203

## Technische aanpak
- Data komt uit Supabase (`screeningen`-tabel, `classificatie` jsonb)
- Nieuwe serverless API-route: `api/dashboard.js` — aggregeert per periode/mediator/doctype
- Frontend: aparte tab of sectie in `index.html`, of aparte pagina
- Grafiek: Chart.js of native Canvas (geen externe CDN → inline of bundled)
- AI-aanbevelingen: gegenereerd via Claude op basis van geaggregeerde statistieken

**Why:** Gebruiker wil inzicht in patronen over dossiers heen, niet alleen per dossier.
**How to apply:** Dashboard is een nieuwe feature, geen wijziging aan bestaande screening-flow. Bouwen als aparte view/tab zodat bestaande UX niet geraakt wordt.
