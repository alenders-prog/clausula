---
name: analyse-ontwerpbesluiten
description: De gemeten ontwerpbesluiten achter de analysepijplijn van Clausula, elk met zijn meting en de voorwaarde om hem terug te draaien. Gebruik vóór élke wijziging aan de structuur van de analyse — het aantal of de indeling van Claude-aanroepen, de prompt-cache, tokenplafonds, dimensiegrenzen, tijdslimieten, of een voorstel om iets samen te voegen, op te splitsen of parallel te doen. Ook bij vragen over waarom een analyse traag of duur is.
---

# Ontwerpbesluiten

Waaróm de analysepijplijn is zoals hij is. Eén besluit per kop, met de meting die
eronder ligt en de voorwaarde waaronder je hem mag terugdraaien.

> **Dit bestand stond tot 5 september 2026 in `docs/ontwerpbesluiten.md`.** Daar werd het
> alleen gelezen als de instructie in CLAUDE.md werd opgevolgd. Als skill biedt de
> `description` hierboven zichzelf aan zodra iemand aan de analysestructuur komt. Er is
> bewust geen kopie achtergebleven: twee plekken lopen uiteen, en van de vijf bestaande
> skills liepen er op de dag van deze verhuizing drie achter op de code die ze beschrijven.

Dit bestand is er omdat de meeste van deze besluiten *tegenintuïtief* zijn. Wie ze niet
kent, draait ze met de beste bedoelingen terug — en de metingen die ze onderbouwen kosten
elk een halfuur en een paar euro aan API-verkeer.

**Regel bij het lezen:** een besluit zonder meting eronder is een vermoeden, en dat staat
hier dan ook zo. Voeg je een besluit toe, zet er dan bij hoe het gemeten is.

---

## De twee wetten van deze pijplijn

Alles hieronder volgt uit twee gemeten verbanden. Ken je die, dan volgen de meeste
besluiten vanzelf.

### 1. Tijd is uitvoer. Invoer is gratis in tijd.

Over 53 aanroepen:

```
duur ≈ 6,3 s vast + 16,6 ms per uitvoertoken     (R² = 0,94)
```

Correlatie van de duur met het aantal uitvoertokens: **+0,97**. Met de invoergrootte:
**−0,62**. Meer context meesturen kost geld, geen tijd. Meer láten schrijven kost allebei.

Gevolg: de wandklok van een analyse is de *langste* aanroep, en die wordt bepaald door
hoeveel die aanroep schrijft. Bij ongeveer 228 tokens per bevinding kost elke bevinding
zo'n 4,6 seconden.

### 2. Kosten zijn invoer.

Bij een gemeten analyse van twee documenten (1 september 2026, $0,97): invoer 71%,
uitvoer 29%. De invoer is groot omdat hetzelfde materiaal per aanroep opnieuw meegaat —
het gedeelde blok vijfmaal, de wetsartikelen driemaal.

**Deze twee wijzen naar verschillende plekken.** Wie op tijd optimaliseert kijkt naar
uitvoer; wie op kosten optimaliseert kijkt naar invoer. Een maatregel die het ene
verbetert maakt het andere meestal slechter.

---

## Besluit: de prompt-cache staat uit

**Sinds 1 september 2026.** Zie `src/api/prompt-cache.js` voor de schakelaar.

Gemeten over een echte analyse: **153.284 tokens aangelegd, nul gelezen.** Aanleggen kost
1,25× de invoerprijs, lezen 0,1× — dus dat was $0,115 premie per analyse voor een
voorraad die niemand aansprak: 54% van de rekening.

Er is ook geen route waarlangs hij hier wél gelezen wordt:

1. **De tooldefinitie hoort bij het cache-voorvoegsel.** Gemeten: zelfde tool met een
   ander system-vervolg leest de cache (4.931 gelezen); een ándere tool met exact
   hetzelfde gedeelde blok leest niets en legt opnieuw aan (4.927). Elke fase heeft hier
   een eigen tool, dus tussen fasen valt principieel niets te delen — hóé je de
   promptblokken ook ordent.
2. **De aanroepen starten gelijktijdig.** Een cache wordt pas geschreven als een verzoek
   klaar is; vier aanroepen die tegelijk beginnen missen allemaal.

> **Wanneer je hem weer aan zet.** De cache verdient zich terug vanaf de éérste keer dat
> hij gelezen wordt (aanleggen + één keer lezen is 1,35 tegen 2,0). Zet hem dus aan zodra
> aan alle drie is voldaan: twee of meer aanroepen delen dezelfde tool, hun system prompt
> begint met een identiek blok, én ze starten niet tegelijk koud.
>
> Dat laatste is op te lossen met **voorverwarmen**, en dat is gemeten: één aanroep met
> `max_tokens: 1` legde 26.200 tokens aan in 2,8 s, waarna **zes van de zes** gelijktijdig
> gestarte aanroepen het volledig teruglazen — 69% minder eenheden.
>
> Toets het daarna altijd: `cache_lees_tokens` in `api_verbruik` hoort op te lopen. Nul
> gelezen betekent dat je alleen de premie betaalt.

---

## Besluit: het tokenplafond staat ruim

`max_tokens` is een grens, geen verbruiksmeter — je betaalt alleen voor wat er
daadwerkelijk geschreven wordt. Stond op 6.000 voor `structuur`; bij documenten met veel
bevindingen liep die vol, waarna `askClaude` de **hele aanroep opnieuw** deed met 12.000.
Dubbele tijd, dubbele kosten, en in de logs alleen zichtbaar als een regel
`max_tokens bij 6000 → herpoging`.

Nu overal `MAX_OUTPUT_TOKENS`. Een uitloper wordt niet door het plafond begrensd maar
door de wandklokgrens per aanroep (`src/tijdsbudget.js`), en dat is de juiste grens: die
telt de tijd die het echt kost.

Effect: de eval ging van 631 s naar 434 s (−31%) en van drie naar nul herpogingen.

---

## Besluit: de dimensiegrens tussen balans en conflicten staat expliciet in de prompt

**Sinds 1 september 2026**, in `api/_prompts/bevindingen.js`, in béíde secties.

De dimensie `balans` stond op nul: geen enkele keer in 65 bevindingen over vijf
documenten. Op het dashboard bleef die kaart leeg.

De bevindingen wérden gevonden — een auto van € 11.500 zonder compensatie, een schuld van
€ 8.900 volledig bij één partij — maar kwamen binnen als `conflicten`. De grens tussen de
twee stond nergens beschreven, en de balans-sectie was één regel terwijl conflicten
concrete categorieën met voorbeelden had.

De grens is scherp te formuleren, en dát was de hele reparatie:

> Een tegenstrijdigheid is dat twee plaatsen elkaar **tegenspreken**. Een balanskwestie is
> dat het document consistent is maar de afspraak **eenzijdig** uitpakt.

| | vóór | ná |
|---|---|---|
| bevindingen met dimensie balans | 1,0 per ronde | 2,3 per ronde |
| schuld volledig bij één partij | 1/3 | 3/3 |
| totaal aantal bevindingen | 14,7 | 14,3 |

Geen inflatie: het labelt anders, het produceert niet méér. En apart nagegaan of de nieuwe
`GEEN CONFLICT`-regel de andere dimensie wegdrukt — vier gecontroleerde runs, mét en
zonder die regel: `conflicten` komt in alle vier op 2 uit.

---

## Besluit: `bevindingen` blijft één aanroep voor vier dimensies

**Overwogen en gemeten op 1 september 2026. Niet gedaan.**

`bevindingen` draagt juridisch, balans, grammatica en conflicten, en is met 116 van de
139 seconden de langste aanroep. Splitsen lag voor de hand. Gemeten, drie rondes, zelfde
document en prompt, alleen een slotregel die zegt welke dimensies gemeld mogen worden:

| | duur | uitvoer | bevindingen |
|---|---|---|---|
| één aanroep | 92,1 s | 5.005 | 15,3 |
| helft: juridisch + balans | 89,2 s | 4.741 | 11,7 |
| helft: grammatica + conflicten | 42,0 s | 2.367 | 8,0 |
| **gesplitst totaal** | **89,2 s** | **7.108** | **19,7** |

**3% tijdwinst voor 42% meer uitvoer.** Twee oorzaken: de helften zijn ongelijk (juridisch
en balans is twee derde van het werk), en — belangrijker — de totale uitvoer is **geen
vaste taart**. De overlap tussen de helften was 0 tot 2 titels, dus het zijn geen
duplicaten; een smallere opdracht levert simpelweg diepere uitwerking op.

> **Let op bij elke toekomstige splitsing:** de aanname dat herverdelen de totale uitvoer
> gelijk laat, is gemeten en klopt niet. Reken een splitsing dus nooit door alsof de
> uitvoer een vast getal is dat je over meer aanroepen verdeelt.

---

## Besluit: MfN blijft in de `structuur`-aanroep

**Overwogen op 31 augustus 2026, gebouwd, en teruggedraaid.**

MfN kost gemeten **22,3 seconden en 1.471 uitvoertokens** binnen de structuur-aanroep
(drie rondes: 69,2 s mét, 46,9 s zonder). Als eigen parallelle aanroep zou dat van de
langste aanroep af gaan.

Teruggedraaid omdat de eval een bevinding opleverde die de fixture expliciet verbiedt:
"Indexeringsclausule partneralimentatie ontbreekt". Er is een sluitend mechanisme — de
MfN-elementenlijst bevat *"Partneralimentatie: bedrag + indexering, of nihilbeding met
motivering"*. Zolang die lijst in de structuur-prompt staat, heeft zo'n waarneming een
plek (de score). Haal je hem weg, dan komt dezelfde waarneming eruit als
volledigheidsbevinding.

Twee redenen om het zo te laten:

- **Het staat niet op het kritieke pad.** `structuur` was 88 s tegen 116 s voor
  `bevindingen`. Er 22 seconden afhalen levert nul wandklok op.
- **Uitstellen tot de gebruiker erom vraagt kost per saldo méér.** MfN lift nu gratis mee
  op de invoer van `structuur`. Als losse aanroep achteraf moet de documenttekst opnieuw
  mee: ~€0,13 tegen ~€0,07 bespaard. Het loont alleen als MfN in minder dan ongeveer een
  derde van de analyses wordt opgevraagd.

---

## Besluit: een tijdsgrens is een wandklokgrens

Zie `src/tijdsbudget.js`. Hij telt **alles** mee — het wachten én de aanroepen zelf — en
de limiet van één aanroep is nooit langer dan wat er van het totaal over is.

Twee storingen leidden hiertoe, en ze deelden hun oorzaak:

- **29 augustus 2026**, de PDF-conversie: de grens telde alleen de *slaaptijd* tussen de
  pogingen en werd bovenaan de lus getoetst. Bij het enige geval dat ertoe deed — een
  aanroep die blijft hangen — kón hij dus niet afgaan.
- **31 augustus 2026**, de analyse: geen enkele Claude-aanroep had een limiet, dus één
  trage aanroep at de hele functieduur op en nam de rest mee.

> Toets zo'n grens door hem te laten afgaan — een server die verbindt en nooit antwoordt.
> Anders weet je alleen dat de code compileert.

---

## Besluit: het aantal aanroepen blijft zoals het is

**Onderzocht en verworpen op 1 september 2026.** Dit is het besluit dat het vaakst opnieuw
zal worden voorgesteld, want het klinkt vanzelfsprekend: verdeel het werk over meer
parallelle aanroepen en de analyse wordt sneller.

Dat werkt niet, en de reden is gemeten. **Het aantal aanroepen bepaalt de uitvoer, niet de
indeling:**

| verandering | uitvoergroei |
|---|---|
| 1 → 2 aanroepen (dimensies gesplitst) | +42% |
| 4 → 4 aanroepen (alleen anders verdeeld) | +3 à 11% |
| 4 → 8 aanroepen (per onderwerp) | +86 à 154% |

Een smallere opdracht met hetzelfde tokenbudget levert diepere uitwerking op. Het zijn
grotendeels géén duplicaten — de overlap tussen gesplitste helften was 0 tot 2 titels —
maar het is wél werk dat je betaalt en waar de wandklok aan hangt. En omdat tijd aan
uitvoer hangt, heft die groei de fijnere verdeling precies op.

De volledige proef, acht onderwerp-aanroepen op één voorverwarmd voorvoegsel tegen de
huidige vier, op een documentpaar van ~7.500 tekens:

- **langste aanroep −7% en +2%** — geen tijdwinst
- **uitvoer +86% en +154%**, bevindingen 44→74 en 47→101
- **invoer −22%**, maar dat wordt ruimschoots opgegeten: kosten $0,46 → $0,73 (+58%)

Honderd bevindingen op twee documenten is bovendien niet alleen duur maar onbruikbaar.

> **Wat er wél uit kwam.** Vier aanroepen op één voorverwarmd voorvoegsel (dus zonder het
> aantal te vergroten) geeft **invoer −42% bij vlakke uitvoer**, en het voorverwarmen
> werkt: 8 van de 8 aanroepen lazen de cache. Maar de langste aanroep werd 12 tot 29%
> langer, omdat `volledigheid` over beide documenten dan de dikste brok is. Ook dat is dus
> een ruil, geen winst — en hij vraagt één gedeelde tool en het verplaatsen van de
> documenttype-specifieke promptdelen naar de staart.
>
> Wil je het toch: de meting staat in het ontwerpvoorstel, en de bouwstenen bestaan al
> (`docBlokken` bij cross_doc, `api/_cross-doc-toewijzing.js` voor het terugsplitsen).
> Bedenk dan wel dat de toewijzing in de proef brak — het model vulde soms `convenant` en
> soms `convenant.txt`. Elke extra aanroep is ook een extra manier om iets net anders te
> doen.

**Samenvoegen van de documenten** is apart gemeten en werkt technisch: invoer −47%, geen
bevindingen verloren, toewijzing 100%. Maar het maakt de analyse trager (+35% wandklok),
omdat dezelfde uitvoer in minder stromen wordt geperst. Samenvoegen is de voorwaarde voor
het gedeelde voorvoegsel, niet de opbrengst.

**Conclusie: de architectuur zit dicht bij een lokaal optimum.** Alles wat er nog ligt
ruilt tijd tegen geld. De onmiskenbare winst zit in de besluiten hierboven — de cache
eruit, de wetsartikelen uit cross-doc, het tokenplafond omhoog — en die zijn alle drie
doorgevoerd.

---

## De les die boven alle besluiten hier staat

Op 31 augustus en 1 september 2026 leek vijf keer iets een architectuurprobleem, en vijf
keer was het een instructie of een instelling:

| symptoom | leek | was |
|---|---|---|
| cache nooit gelezen | verkeerde blokvolgorde | de tool bindt het voorvoegsel |
| trage analyses | te veel wetsartikelen | een tokenplafond van 6.000 |
| eval onbruikbaar | te zware fixtures | een timeout van 180 s |
| balans op nul | verdringing door vier dimensies | een ontbrekende grensregel |
| splitsen zou tijd schelen | uitvoer is een vaste taart | uitvoer groeit met het aantal aanroepen |

**Toets bij elke voorgestelde herstructurering eerst of het geen promptprobleem is.**
Herstructureren is duur en risicovol; een instructie kost twee regels en is met de eval te
verifiëren.
