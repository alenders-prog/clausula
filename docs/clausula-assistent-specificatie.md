# Specificatie Clausula-assistent — intents, schema en promptsecties

Doel: de assistent herbouwen rond vier intents met één gedeeld structured-output-schema,
contextgevoelige vervolgchips, en een doorvraagregel die vraagmoeheid voorkomt.
Dit document is de bron van waarheid; wijkt code of prompt af, meld dat expliciet.

---

## 1. Ontwerpprincipes (niet onderhandelbaar)

1. **Antwoord eerst.** De assistent geeft áltijd een inhoudelijk antwoord, ook bij ontbrekende informatie. Ontbrekende informatie wordt opgevangen met expliciete aannames, nooit met een blokkerende wedervraag — tenzij de onbekende het antwoord fundamenteel omdraait (zie §5).
2. **Geen moduskeuze vooraf.** Het model detecteert de intent zelf. Uitzondering: de UI mag "Clausule opstellen" als optionele shortcut aanbieden, omdat dat het enige type is waarbij de gebruiker vooraf zeker weet wat hij wil.
3. **Eén schema, vier contracten.** Alle responses lopen via hetzelfde tool-use-schema (§3). Per intent gelden andere vul- en lengteregels (§4). Nooit JSON-als-tekst; altijd `tool_choice` (bekende bron van malformed responses).
4. **Signaleren, niet adviseren.** Perspectieven (juridisch, financieel, fiscaal, balans) zijn dimensies van het antwoord, geen modi. Relevante signalen worden proactief en compact gemeld. Toon en severity volgen de screening-conventies: neutraal-zakelijk, gericht aan de mediator, nooit advies aan partijen, altijd "aandachtspunt voor de mediator".
5. **Nooit dezelfde vraag twee keer.** Beantwoorde verduidelijkingsvragen en gecorrigeerde aannames worden vastgelegd als dossiervelden (of minimaal sessiestate) en bij elke volgende beurt in de context meegegeven.

---

## 2. Intentdetectie

Het model classificeert elke gebruikersvraag als één van:

| Intent | Herkenning |
|---|---|
| `kennisvraag` | Algemene rechtsvraag zonder casusfeiten ("wat geldt bij…", "hoe werkt…") |
| `casus` | Vraag met concrete feiten van partijen, of gesteld binnen een dossier |
| `opties` | Vraag naar keuzemogelijkheden voor cliënten, of expliciet verzoek om iets voor te leggen / een mail voor te bereiden |
| `clausule` | Verzoek om tekst voor OP of convenant, of activatie via chip/shortcut |

Twijfelregels:
- Casusfeiten aanwezig of dossier actief → `casus`, anders `kennisvraag`.
- Een chip-activatie (§7) zet de intent hard; het model volgt dan de chip, niet zijn eigen classificatie.
- De intent wordt teruggegeven in het schema zodat de UI de juiste chips en weergave kiest; de gebruiker hoeft de classificatie nooit te bevestigen.

---

## 3. Output-schema (tool_choice, verplicht bij elke beurt)

```json
{
  "name": "assistent_antwoord",
  "input_schema": {
    "type": "object",
    "required": ["intent", "antwoord", "vervolgacties"],
    "properties": {

      "intent": {
        "type": "string",
        "enum": ["kennisvraag", "casus", "opties", "clausule"]
      },

      "antwoord": {
        "type": "string",
        "description": "Kernantwoord. Richtlijn: max 60 woorden bij kennisvraag/casus; bij opties een korte inleiding van max 2 zinnen (de opties zelf staan in 'opties'); bij clausule max 2 zinnen context (de tekst zelf staat in 'clausule')."
      },

      "bronnen": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["verwijzing"],
          "properties": {
            "citation":  { "type": "string", "description": "Wetsartikel of norm, bijv. 'art. 1:400 lid 2 BW' of 'MfN-gedragsregel 5'" },
            "peildatum": { "type": "string", "description": "Alleen indien de regel per datum verschilt, bijv. 'huwelijken vanaf 1-1-2018'" }
          }
        }
      },

      "aannames": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Expliciete aannames waarop het antwoord rust, geformuleerd als 'Uitgaande van …'. Alleen aannames die het antwoord daadwerkelijk dragen."
      },

      "signalen": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["perspectief", "ernst", "tekst"],
          "properties": {
            "perspectief": { "type": "string", "enum": ["juridisch", "financieel", "fiscaal", "balans"] },
            "ernst": { "type": "string", "enum": ["hoog", "midden", "laag"] },
            "tekst": { "type": "string", "description": "Eén zin. Compact label-formaat, bijv. 'Bij keuze B mogelijk schenkbelasting boven de vrijstelling; laten toetsen door belastingadviseur.'" }
          }
        }
      },

      "onbekenden": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["veld", "blokkerend", "effect"],
          "properties": {
            "veld": {
              "type": "string",
              "enum": [
                "relatievorm", "huwelijksdatum", "huwelijkse_voorwaarden",
                "hv_stelsel", "peildatum_vermogen",
                "kinderen_minderjarig", "co_ouderschap",
                "eigen_woning", "woning_bestemming",
                "ondernemer", "pensioen", "pensioen_verevening",
                "lijfrente", "uitsluitingsclausule",
                "partneralimentatie", "internationaal_element",
                "overig"
              ],
              "description": "Moet mappen op een dossierveld. Volgorde van blokkerende prioriteit: relatievorm → huwelijksdatum → huwelijkse_voorwaarden → hv_stelsel → kinderen_minderjarig → co_ouderschap → eigen_woning. 'overig' alleen als geen enum past; beschrijf dan in 'effect' wat ontbreekt."
            },
            "blokkerend": { "type": "boolean", "description": "true alléén als het antwoord fundamenteel omslaat zonder dit gegeven" },
            "effect": { "type": "string", "description": "Eén zin: wat verandert er aan het antwoord als dit gegeven anders is dan aangenomen" }
          }
        }
      },

      "verduidelijkingsvraag": {
        "type": "object",
        "required": ["vraag", "veld"],
        "properties": {
          "vraag": { "type": "string" },
          "veld": { "type": "string", "description": "Het onbekenden.veld dat deze vraag oplost" },
          "antwoordopties": {
            "type": "array",
            "items": { "type": "string" },
            "description": "2–4 korte opties die de UI als knoppen rendert, bijv. ['Vóór 1-1-2018', 'Ná 1-1-2018', 'Weet ik niet']. Weglaten alleen als het antwoord niet in opties te vangen is (bijv. een bedrag)."
          }
        },
        "description": "Maximaal één per beurt. Alleen aanwezig als er een onbekende met blokkerend=true is die niet uit het dossier of de sessie kan worden ingevuld. Het antwoord-veld bevat óók dan een antwoord onder aannames."
      },

      "vervolgacties": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "toepassen_op_casus", "opties_voor_klanten", "clausule_opstellen",
            "klanttekst", "fiscale_check", "andere_stijl", "toets_aan_dossier"
          ]
        },
        "description": "1–3 acties die logisch volgen op dít antwoord. Het model selecteert; de UI bepaalt labels, iconen en volgorde."
      },

      "opties": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["titel", "kern", "afwegingen"],
          "properties": {
            "titel": { "type": "string", "description": "Max ~8 woorden, neutraal" },
            "kern": { "type": "string", "description": "2–3 zinnen wat de optie inhoudt" },
            "afwegingen": { "type": "string", "description": "2–4 zinnen trade-offs, symmetrisch geformuleerd voor beide partijen" }
          }
        },
        "description": "Alleen bij intent=opties. Maximaal 3 opties."
      },

      "mailconcept": {
        "type": "string",
        "description": "Alleen bij intent=opties én als de gebruiker om een mail/klanttekst vroeg of via chip 'klanttekst' activeerde. In de stem van de mediator die opties voorlegt; zie promptsectie Opties."
      },

      "clausule": {
        "type": "object",
        "required": ["stijl", "tekst"],
        "properties": {
          "stijl": { "type": "string", "enum": ["strikt", "juridisch_volledig", "begrijpelijke_taal"] },
          "tekst": { "type": "string" },
          "toelichting": { "type": "string", "description": "Max 3 zinnen voor de mediator: keuzes in de formulering en waar de tekst afwijkt van het wettelijk uitgangspunt" }
        },
        "description": "Alleen bij intent=clausule."
      }
    }
  }
}
```

Validatieregels server-side (niet aan het model overlaten):
- `verduidelijkingsvraag` aanwezig zonder `onbekenden[].blokkerend=true` → veld strippen vóór rendering.
- Meer dan 3 `vervolgacties` → afkappen op 3.
- `opties` met meer dan 3 items → afkappen.
- Woordlimieten zijn richtlijnen voor het model, geen harde validatie — modellen benaderen limieten; accepteer marge.

---

## 4. Promptsecties per intent

Gemeenschappelijke basis (staat vóór de intent-secties in de systemprompt, komt in het
cacheable statische deel):

> Je bent de assistent van Clausula en ondersteunt MfN-registermediators in
> familiezaken naar Nederlands recht. Je richt je uitsluitend tot de mediator,
> neutraal-zakelijk, zonder u-vorm. Je formuleert nooit juridisch advies aan
> partijen; risico's en afwijkingen zijn altijd "aandachtspunt voor de mediator".
> Je antwoordt áltijd eerst inhoudelijk, ook bij ontbrekende informatie: maak dan
> expliciete aannames en benoem per relevante onbekende wat er verandert als het
> anders ligt. Stel maximaal één verduidelijkingsvraag per beurt, en alleen als
> een onbekende het antwoord fundamenteel omdraait én niet uit het dossier of de
> sessie blijkt. Stel nooit een vraag die eerder in dit gesprek of in het dossier
> al beantwoord is. Signaleer proactief wanneer een juridisch, financieel,
> fiscaal of balans-aspect relevant is: compact, één zin per signaal, met
> severity kritiek / waarschuwing / info conform de screeningdefinities.

### 4.1 Intent: kennisvraag

- Antwoord in maximaal ~60 woorden; feitelijk, zonder casustoepassing.
- Altijd minimaal één bron in `bronnen`, met peildatum als de regel per datum verschilt (bijv. Wet beperking gemeenschap van goederen per 1-1-2018).
- Benoem structurele uitzonderingen op de hoofdregel als signaal (`perspectief` naar aard, meestal `juridisch`, ernst meestal `info` of `waarschuwing`).
- Geen aannames en geen verduidelijkingsvraag: een kennisvraag heeft geen casus, dus geen onbekenden.
- `vervolgacties`: kies uit `toepassen_op_casus`, `klanttekst`, `clausule_opstellen`.

### 4.2 Intent: casus

- Antwoord in maximaal ~60 woorden, direct toegespitst op de feiten.
- Elke dragende aanname expliciet in `aannames` ("Uitgaande van huwelijk ná 1-1-2018 zonder voorwaarden…").
- Elke relevante ontbrekende feit in `onbekenden`, met eerlijk `blokkerend`-oordeel. Blokkerend is zeldzaam; typische kandidaten: huwelijksdatum rond 1-1-2018, wel/geen huwelijkse voorwaarden, wel/geen onderneming, wel/geen eigen woning. Al het andere: aanname maken, labelen, doorgaan.
- Vul onbekenden éérst uit het meegeleverde dossier- en sessieblok; alleen wat daar niet in staat mag als onbekende terugkomen.
- Signaleer proactief fiscale, financiële en balansaspecten die de mediator kan missen (voorbeelden: schenkbelasting bij overbedeling, box 3-effect van verrekening, bijleenregeling, afwijking van wettelijke maatstaf zonder motivering → balans, ernst conform screeningcriteria).
- `vervolgacties`: kies uit `opties_voor_klanten`, `clausule_opstellen`, `fiscale_check`, `toets_aan_dossier`.

### 4.3 Intent: opties

- Maximaal 3 opties in `opties`; `antwoord` bevat alleen een inleiding van max 2 zinnen.
- **Meerpartijdigheid is hard:** iedere optie neutraal geformuleerd, afwegingen symmetrisch voor beide partijen, nooit "partij X doet er verstandig aan". Een optie die structureel één partij bevoordeelt krijgt een `balans`-signaal mee (signalerend, niet normerend — conform de Balans-screeningconventie).
- Per optie fiscale en financiële implicaties benoemen wanneer relevant, als signaal of in de afwegingen.
- `mailconcept` alleen genereren als daarom gevraagd is (direct of via chip): in de stem van de mediator die opties voorlegt ter bespreking, expliciet zonder voorkeur, eindigend met een uitnodiging om de opties in de volgende sessie te bespreken. Begrijpelijke taal, geen wetsartikelen.
- `vervolgacties`: kies uit `klanttekst`, `clausule_opstellen`.

### 4.4 Intent: clausule

- Stijl komt uit de instelling (praktijkniveau, overschrijfbaar per dossier, overschrijfbaar per beurt via chip `andere_stijl`) en wordt in de context meegegeven; nooit aan de gebruiker vragen.
- Stijldefinities:
  - **strikt** — alleen de afspraak zelf, imperatief, minimale tekst, geen toelichting in de clausule.
  - **juridisch_volledig** — met definities, wetsverwijzingen, randvoorwaarden en (waar relevant) expliciete afwijking van het wettelijk uitgangspunt inclusief bewustverklaring van partijen.
  - **begrijpelijke_taal** — B1-niveau, geen wetsartikelen, gevolgen in gewone woorden uitgelegd; juridisch dekkend maar leesbaar voor partijen.
- `toelichting` (max 3 zinnen, aan de mediator): welke formuleringskeuzes zijn gemaakt en waar de tekst afwijkt van het wettelijk uitgangspunt.
- Afwijking van dwingend recht: niet opnemen in de clausule; in plaats daarvan een `juridisch`-signaal met ernst `hoog` (zelfde criterium als de screeningcategorie Juridisch, bijv. afstand van kinderalimentatie, art. 1:400 lid 2 BW).
- Onbekenden die de clausuletekst raken (bedragen, data): invullen als duidelijk gemarkeerde placeholder `[BEDRAG]`, `[DATUM]` en opnemen in `onbekenden` (vrijwel nooit blokkerend — de tekst kan met placeholders geleverd worden).
- `vervolgacties`: kies uit `klanttekst`, `andere_stijl`.

---

## 5. Doorvraag- en stateregels

1. **Volgorde bij een ontbrekend gegeven:** dossierveld → sessiestate → aanname met label → (alleen bij blokkerend) verduidelijkingsvraag. Nooit een stap overslaan.
2. **Maximaal één verduidelijkingsvraag per beurt**, altijd naast een volwaardig antwoord onder aannames — nooit in plaats daarvan.
3. **Antwoorden worden state.** Wordt een verduidelijkingsvraag beantwoord (knop of vrije tekst) of een aanname gecorrigeerd, dan schrijft de applicatie het bijbehorende `veld` weg: binnen een dossier als dossierveld, daarbuiten als sessiestate. Dit blok wordt bij elke volgende beurt als context meegegeven met de instructie dat deze gegevens vaststaan.
4. **Dossierkoppeling:** velden die de screening al extraheert (huwelijksdatum, kinderen, eigen woning, …) worden bij een dossier-gebonden gesprek automatisch in het contextblok gezet, zodat de assistent er nooit naar vraagt.

---

## 6. UI-regels

**Weergave per antwoord (progressive disclosure):**

```
[antwoord — altijd zichtbaar]
[bronnen — klein, onder het antwoord]
▸ Aannames (2)    ⚠ Fiscaal · waarschuwing    ? Onbekend: huwelijksdatum
[verduidelijkingsvraag als knoppenrij, indien aanwezig]
[vervolgchips]
```

- `aannames`, `signalen` en `onbekenden` ingeklapt als compacte labels; uitklappen toont de volledige tekst c.q. het `effect`.
- Signaalkleuren en -iconen zijn identiek aan de screening-severity (hoog / midden / laag): één visuele taal door het product.
- `verduidelijkingsvraag.antwoordopties` renderen als knoppen; een knopklik gaat als gebruikersbericht terug én wordt als veld weggeschreven (§5.3). Zonder `antwoordopties`: klein invoerveld inline.

**Chip-labels per enum-waarde** (UI bepaalt label en icoon, model levert alleen de enum):

| Enum | Label |
|---|---|
| `toepassen_op_casus` | Toepassen op casus |
| `opties_voor_klanten` | Opties voor klanten |
| `clausule_opstellen` | Clausule opstellen |
| `klanttekst` | Klanttekst / mail |
| `fiscale_check` | Fiscale check |
| `andere_stijl` | Andere stijl |
| `toets_aan_dossier` | Toets aan dossier |

- Een chip-klik stuurt een voorgedefinieerde instructie mee die de intent hard zet (§2) en de relevante context (bijv. "maak een clausule van optie B") meegeeft.
- `andere_stijl` toont eerst de drie stijlen als sub-chips; de keuze geldt als beurt-override en past de dossierinstelling niet aan tenzij de gebruiker dat aanvinkt.
- Stijlinstelling: praktijkinstelling met dossier-override, als kleine persistente indicator in het assistent-paneel zichtbaar (bijv. "Stijl: begrijpelijke taal").
- Optionele shortcut "Clausule opstellen" boven het invoerveld (§1.2); verder geen modusbalk.

---

## 7. Consistentie met de screening

- Severity-niveaus, -kleuren en -criteria komen uit de screeningdefinities (hoog / midden / laag) en worden niet apart gedefinieerd voor de assistent.
- Balans-signalen volgen de screeningconventie: signalerend, nooit normerend.
- De voorrangsregel bij overlap van perspectieven volgt de screening-volgorde: juridisch vóór balans; één signaal per kwestie, niet dupliceren over perspectieven.
- Toon: identiek aan de screening-toelichtingen — professioneel Nederlands, neutraal-zakelijk, gericht aan de mediator.

---

## 8. Implementatievolgorde (suggestie)

1. Schema + server-side validatie (§3) en de vier promptsecties (§4) — de bestaande route kan hierop worden omgebouwd zonder UI-wijziging.
2. Progressive disclosure + chips in de UI (§6).
3. State: knop-antwoorden wegschrijven naar sessie/dossier + contextblok injecteren (§5).
4. Dossierkoppeling met de screening-extractie (§5.4).
5. Stijlinstelling op praktijk-/dossierniveau (§4.4, §6).

Stap 1 levert direct consistentere en kortere antwoorden op; 2 en 3 leveren de
grootste UX-winst; 4 en 5 zijn afronding.
