# Wat er gecentraliseerd moet worden, en in welke volgorde

Opgesteld 8 september 2026, na een dag waarin dezelfde fout vier keer opdook op vier
plekken die hetzelfde probleem elk apart hadden opgelost.

> **Dit is een plan, geen besluit.** Per onderdeel staat wat er nu is, wat het kost en wat
> er kan breken. Wat hier niet staat is een meting — die hoort bij de uitvoering, niet bij
> het voorstel. Zie ook de drie vragen in CLAUDE.md.

---

## Waarom dit stuk bestaat

Op 8 september kwam vier keer dezelfde fout naar boven: een glijdend venster van vier
woorden dat de eerste treffer neemt. Eén keer gemeld door een mediator, drie keer gevonden
door erop door te zoeken. Ze zaten op vier verschillende plekken, elk met eigen code.

Het inzicht dat uniekheid het betere criterium is stond al opgeschreven — in de kop van
`src/viewer/uniek-fragment.js`, met de uitleg waarom een stopwoordenlijst niet werkt. Het
was alleen niet toegepast op de functies ernaast.

**Een inzicht vastleggen is niet hetzelfde als het doorvoeren.** Zolang acht plekken hun
eigen versie hebben, bereikt een verbetering er één.

---

## Deel A — het terugvinden van een passage

### Wat er nu is

Twee gedeelde bouwstenen:

| module | wat | wie gebruikt hem |
|---|---|---|
| `src/viewer/uniek-fragment.js` | kies een fragment dat maar één keer voorkomt | 2 plekken, beide sinds 8 sep |
| `src/rapport/doc-volgorde.js` → `vindPositie` | positie via een trappenladder | documentvolgorde + bijlagefilter |

En acht plekken met een eigen implementatie:

| | plek | bepaalt | gevonden fout op 8 sep |
|---|---|---|---|
| 1 | `vindDocVolgorde` | volgorde van de kaarten | — |
| 2 | `vindPassageFractie` | de positiehint | ja, eerste-treffer |
| 3 | `bepaalPassageDocIdx` | **welk tabblad** | ja, verkeerd document |
| 4 | `highlightInPdf` | de markering in de PDF-laag | — |
| 5 | `zoekEnScrollNaarPassage` | zes terugvallen | ja, verkeerde alinea |
| 6 | `pasWijzigingenToeInDocx` | de DOCX-vervanging | ja, stille overslag |
| 7 | de conceptvervangingslus | de teksthervanging | ja, lengtegrens en dedup |
| 8 | `vindPositie` (server) | het bijlagefilter | — |

### Wat er per plek verschilt, en dat is het echte probleem

**Vier normalisaties die niet hetzelfde doen.** `normChars` en `normPassage` in
`index.html`, `normaliseer` in `uniek-fragment.js`, en `norm` in `passage-herkomst.js`.
De eerste behoudt leestekens, de tweede niet; de derde haalt alles weg wat geen letter of
cijfer is. Twee stukken tekst die volgens de ene gelijk zijn, zijn dat volgens de andere
niet.

**Twee dialecten voor het opsommingsteken.** Het DOCX-pad gebruikt `BULLET_PAT` met de
Unicode-reeks `U+25A0–U+25FF`; de conceptlus doet het met een handjevol tekens. Een
document met een wit rondje wordt door de ene wél en door de andere niet herkend.

**Drie kopieën van dezelfde stopwoordenlijst**, waarvan twee letterlijk identiek.

**En ze zoeken niet in dezelfde ruimte.** `vindPassageFractie` pseudonimiseert de passage
eerst terug en zoekt dus in de pseudonieme tekst. De viewer zoekt in de herstelde tekst,
met echte namen. Dat herstel is niet symmetrisch: er zijn twee kaarten, `naarEcht`
(roepnaam, kort) en `naarEchtVolledig`, en `herstelAnonObj` past de tweede speciaal toe op
`passage` en `bevinding` — juist omdát het anders niet matcht. Dat is een pleister op een
mismatch die het herstel zelf veroorzaakt.

Eén ruimte kiezen — de pseudonieme, waarin beide kanten hetzelfde zijn opgeschreven —
haalt die hele klasse weg. Het idee komt van de gebruiker, bij een geval waarin het
overigens niet de oorzaak was: daar had het model "op 06-11-1986" geparafraseerd tot "in
1986", en dat is geen herstelprobleem maar een onjuiste bevinding. Zie hieronder.

### Voorstel

Eén module — `src/tekst/passage-zoeken.js` — met drie dingen:

1. **normaliseren**, in twee standen: behoudend (leestekens blijven) en agressief. Nu
   liggen die keuzes verspreid en impliciet.
2. **een zoekpatroon bouwen** uit een passage, met één opsommingsteken-dialect.
3. **positie bepalen**, met een expliciete zekerheidsgraad terug: `zeker` (letterlijk of
   uniek), `onzeker` (meerdere treffers), `niet gevonden`.

De acht plekken roepen die aan en houden alleen hun eigen beslissing over wat ze met
`onzeker` doen. Dát verschilt namelijk terecht per plek:

- de viewer markeert wél en waarschuwt erbij
- `bepaalPassageDocIdx` doet níéts bij onzeker — liever geen tabwissel dan de verkeerde
- de DOCX-vervanging slaat over en telt het als gemist
- het bijlagefilter houdt zijn **bewust scheve** toets: blijven mag met een zwakke treffer,
  weggooien vereist een harde. Zie de kop van `passage-herkomst.js` — die scheefheid is
  gemeten en moet blijven.

### Wat dit kost en wat er kan breken

Een dag werk, en het raakt vrijwel elk pad dat een mediator ziet: kaartvolgorde,
tabkeuze, markering, conceptvervanging, DOCX-export en het bijlagefilter.

Het grootste risico is de normalisatie. Op vier plekken staat nu net iets anders, en
sommige van die verschillen zijn per ongeluk maar sommige dragen gedrag. **Begin daarom
met vaststellen wat elke plek nu precies doet** — een tabel van invoer naar uitvoer per
normalisatie — vóór er één regel wordt samengevoegd.

Dekking: `tests/unit/passage-herkomst.test.js` (17 tests) en `tests/unit/doc-volgorde.test.js`
bestaan al en zijn de vangnetten. De e2e-test `14-doc-volgorde.spec.js` loopt de echte flow.

---

## Deel B — wat er verder gecentraliseerd kan worden

Dezelfde vraag op de rest van de code. Op volgorde van risico, niet van omvang.

### B1. De lijst met dimensies — zes varianten, drie volgordes

Er bestaat een geëxporteerde constante, `DIM_VOLGORDE` in
`src/analyse/voortgang-status.js`. Daarnaast staan er vijf kopieën:

| plek | inhoud |
|---|---|
| `src/analyse/voortgang-status.js` | juridisch, volledigheid, balans, conflicten, cross_doc, grammatica |
| `index.html` (2 plekken) | letterlijk dezelfde lijst, hardgecodeerd |
| `index.html` `DIMVOLGORDE` | juridisch, **conflicten**, volledigheid, balans, grammatica |
| `index.html` (dashboard) | volledigheid, juridisch, balans, grammatica, conflicten |
| `src/dashboard/statistieken.js` `CATEGORIEEN` | zonder cross_doc |

Drie verschillende volgordes van dezelfde vijf begrippen. Eén daarvan — juridisch,
conflicten, volledigheid, balans, grammatica — is de **voorrangsvolgorde uit de prompt**
en draagt betekenis. De andere zijn weergavevolgordes. Dat onderscheid is nergens
opgeschreven, en dus is niet te zien welke je mag veranderen.

**Risico:** iemand "harmoniseert" ze en verschuift daarmee ongemerkt de voorrangsregel die
bepaalt welke dimensie een issue krijgt.

**Voorstel:** twee benoemde constanten met een naam die zegt waarvoor ze zijn —
`VOORRANG_DIMENSIES` en `WEERGAVE_DIMENSIES` — plus een bronwachter die verbiedt dat er
weer een lijst van dimensienamen los in de code staat. Klein werk, hoog rendement.

### B2. De stopwoordenlijst — drie kopieën

Twee identiek, één met een andere drempel voor woordlengte. Hoort bij deel A, maar kan
apart en meteen.

### B3. Wat verder de moeite van een blik waard is

Niet nagekeken, alleen opgemerkt bij het doorzoeken. Elk vraagt eerst een telling voordat
er iets over te zeggen valt:

- **ernstvolgorde** (`hoog` → `midden` → `laag`): staat in `consolidatie-grens.js` als
  `ERNST_RANG`, en vermoedelijk elders opnieuw
- **documenttype-labels** (`convenant` → "Convenant"): `DOC_TYPES` in `index.html`, maar ook
  `label()` in het dashboard
- **de scoreberekening**: `src/rapport/score.js` bestaat, maar `berekenDeelscores` staat in
  `index.html`
- **datumopmaak** naar het Nederlands

---

## Los hiervan: een citaat dat niet in het document staat

Bij het nalopen van de CSP-flows kwam een bevinding voorbij die luidde "Geboortedatum
partijen niet volledig vermeld", met als citaat *"geboren te Deventer in 1986"*. In het
document staat *"geboren te Deventer op 06-11-1986"*. Het model had geparafraseerd en
vervolgens op zijn eigen parafrase een gebrek vastgesteld.

Dat is aanname A3 in het klein: een foute bevinding waarop een mediator handelt. En het is
te zien zonder het document te lezen — het citaat komt niet letterlijk in de tekst voor.

Die berekening bestaat al: de viewer weet sinds 8 september of een markering zeker of
onzeker is, en `vindPositie` kent trappen van letterlijk tot zwak. Alleen belandt die
uitkomst in de viewer en niet op de kaart. **Een bevinding waarvan het citaat niet
letterlijk in het document staat, hoort een zichtbaar voorbehoud te krijgen** — dan ziet de
mediator meteen waaróm zo'n punt rammelt, in plaats van het te moeten narekenen.

Kosten: klein, want het rekenwerk is er. Het is vooral een keuze over hoe opdringerig het
voorbehoud mag zijn.

## Volgorde van uitvoeren

1. **B1** — een halve dag, laag risico, en het beschermt een regel die de screening stuurt.
2. **Deel A stap één**: vaststellen wat de vier normalisaties nu doen, in een tabel. Dat is
   onderzoek en verandert nog niets.
3. **Deel A** zelf, met de uitkomst van stap twee als leidraad.
4. **B3** pas nadat er geteld is.

> **Waarom niet alles tegelijk.** Elk van deze samenvoegingen verandert gedrag op plekken
> waar het nu per ongeluk goed gaat. De winst zit in het voorkomen van de vólgende fout, en
> die winst is er alleen als de samenvoeging zelf er geen introduceert.
