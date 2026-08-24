/**
 * api/prompts/gedeeld.js — regels die voor alle analyse-calls gelden
 *
 * Deze drie blokken vormen samen één gecachet geheel. Ze staan in de user-content
 * en niet in de system prompt: zo delen alle calls van hetzelfde document — en een
 * heranalyse — dezelfde cache-entry in plaats van er drie aan te maken.
 *
 * WIJZIGEN RAAKT DE SCREENINGKWALITEIT. Draai na elke aanpassing
 * `npm run test:eval` en vergelijk met de baseline — zie docs/auto-test-setup.md,
 * punt D10. Raak spelling en witruimte niet zonder reden aan: de gedeelde blokken
 * worden byte-exact door Anthropic gecachet, dus elke wijziging kost eenmalig een
 * volledige cache-miss op alle lopende analyses.
 */

import { bouwFeitenBlok } from './feiten.js';

export const ERNST_CRITERIA =
`Ernst-criteria (verplicht toepassen — wees terughoudend met 'hoog'):
- hoog: reserveer dit uitsluitend voor evidente wettelijke overtreding of volstrekte onuitvoerbaarheid; het document kan zo NIET worden gepasseerd of vastgelegd (bijv. verplichte WVPS-afstand volledig afwezig zonder vervangende regeling, nihilbeding kinderalimentatie voor minderjarigen zonder draagkrachtberekening).
- midden: inhoudelijk punt dat aanpassing verdient maar de kern van de afspraak intact laat (bijv. indexering ontbreekt, datum niet ingevuld, partijnaam inconsistent, onduidelijke clausule). Dit is het standaardniveau voor de meeste echte issues.
- laag: aandachtspunt, verbetersuggestie of stijlkwestie zonder materieel rechtsgevolg (bijv. vage verwijzing, alternatieve formulering, spellingsfout). Gebruik dit ruimhartig voor nuttige maar niet-urgente opmerkingen.
NOOIT 'hoog' voor een onderwerp dat volgens een expliciete verwijzing in een ander document van
het dossier is geregeld. Dat is hooguit een aandachtspunt over de verwijzing zelf, geen gebrek.`;

export const VERIFICATIEPLICHT =
`VERIFICATIEPLICHT BIJ AFWEZIGHEIDSCLAIMS:
Voordat je rapporteert dat iets "ontbreekt", "niet aanwezig is" of "niet zichtbaar is":
1. Doorzoek de VOLLEDIGE documenttekst actief op het beweerde ontbrekende element.
2. Bij INTERNE verwijzingen (bijv. "de in artikel 4.1.1 vermelde ...", "zie punt 21", "zie artikel 3.2"):
   Zoek of het gerefereerde nummer ELDERS in het document voorkomt — als sectietitel, koptekst, nummeringsprefix van een lid of sub-artikel (bijv. "4.1.1" of "4.1.1." aan het begin van een alinea of opsommingspunt), of andere onderdelen van de documentstructuur BUITEN de verwijzingstekst zelf.
   - Artikelnummer komt ERGENS ANDERS in het document voor → rapporteer GEEN issue.
   - Bij TWIJFEL of het artikel ergens gedefinieerd is → rapporteer GEEN issue.
   - Alleen bij ABSOLUTE ZEKERHEID dat het nummer nergens als definitie, sectie of genummerd lid voorkomt → rapporteer een issue.
2b. Bij EXTERNE verwijzingen naar een ander document (bijv. "zie het ouderschapsplan", "conform het convenant"):
    Dat andere document wordt apart geanalyseerd. Maak GEEN issue over ontbrekende inhoud daarin —
    rapporteer hooguit als 'laag' dat het referentiedocument als bijlage ontbreekt.
   OPGELET: het feit dat "4.1.1" in de verwijzingstekst zelf staat ("de in artikel 4.1.1 vermelde...") telt NIET als bewijs dat het artikel bestaat. Zoek naar een APARTE definitieplek.
3. SECTIENUMMERING — ABSOLUTE REGEL: Als het document aantoonbaar doorlopend genummerde secties heeft
   (bv. "1. Ouderlijk gezag", "2. Woon- en verblijfplaats", "3. Identiteitsbewijzen"…):
   a. Ga er dan ALTIJD vanuit dat hogere sectienummers (bv. "punt 21", "artikel 15") eveneens bestaan.
   b. Maak NOOIT een issue over een "ontbrekend" of "niet-aantoonbaar" puntgetal.
   c. Maak NOOIT een issue over een "onduidelijke verwijzing" naar een sectienummer — als het document
      genummerd is, zijn verwijzingen als "punt 21 Financiële afspraken" per definitie correct.
   d. Maak NOOIT een issue dat de nummering "niet zichtbaar" is of dat een sectienummer "niet als
      koptekst is opgenomen" — tekst-extractie kan sectienummers losmaken van hun koptekst. Dat is
      een extractie-artefact, GEEN documentfout.
   e. Enige uitzondering: als NERGENS in het document ook maar één sectienummer zichtbaar is (dus ook
      punt 1, 2, 3 ontbreken volledig), dan mag je de nummering in twijfel trekken.
4. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat.

VERIFICATIEPLICHT BIJ BEREKENDE EN NORMATIEVE CLAIMS:
Deze plicht gold lang alleen voor "dit ontbreekt"-claims. Ze geldt evengoed voor beweringen die
op een berekening of op een norm steunen.
1. REKEN VOOR. Beweer je dat bedragen, percentages of termijnen niet kloppen, zet de som dan
   uit in de bevinding: welke getallen, welke bewerking, welke uitkomst.
2. SPREEKT DE UITKOMST JE BEWERING TEGEN, DAN VERVALT HET ISSUE. Rapporteer nooit een
   overschrijding, tegenstrijdigheid of schending die je eigen berekening niet oplevert.
   Blijft er een andere, wél onderbouwde observatie over (bijv. "de percentages zijn
   ongebruikelijk en niet gemotiveerd"), rapporteer dán die — met een titel die daarbij past.
3. NORMCLAIMS: beweer alleen dat een grens of norm wordt overschreden als die grens
   daadwerkelijk in de aangeleverde kennisbank of wettekst staat. Een percentage dat afwijkt
   van een standaardwaarde is een afwijking, geen overtreding.

VERWIJZING NAAR EEN ANDER DOCUMENT IN HETZELFDE DOSSIER:
Een dossier bestaat uit meerdere documenten die naar elkaar verwijzen. Verwijst het document
dat je beoordeelt voor een onderwerp expliciet naar een ander document van hetzelfde dossier
— "alle afspraken betreffende de kinderen zijn vastgelegd in het bijgevoegde ouderschapsplan",
"zie het convenant voor de vermogensverdeling" — dan is dat een correcte en gangbare opzet.
- Rapporteer dan GEEN ontbrekende regeling voor dat onderwerp. Niet als volledigheid-issue,
  niet als juridisch issue, en al helemaal niet als 'hoog'. Het staat ergens anders, en dat
  andere document wordt apart geanalyseerd.
- Dit geldt voor élk onderwerp, niet alleen voor kinderafspraken: alimentatie, pensioen,
  woning, verdeling — wat met een expliciete verwijzing elders is belegd, hoort hier niet
  herhaald te worden.
- Een verwijzing hóéft niet woordelijk het onderwerp te noemen. "Alle afspraken betreffende
  de kinderen" dekt de kinderalimentatie, de zorgregeling en het gezag.
- Alleen als er GEEN enkele verwijzing staat én het onderwerp in dit documenttype thuishoort,
  is er iets te melden.

NAAMSVERMELDING VAN PARTIJEN — CONTROLEER OP CONSISTENTIE:
In de personalia hoort de officiële naam te staan zoals die op het identiteitsbewijs voorkomt.
Een roepnaam mag daar wél bij, maar dan apart geïntroduceerd ("hierna ook te noemen 'Sander'"),
niet dóór de geboortenaam heen geschreven.
- Vergelijk de naam uit de personalia met hoe dezelfde persoon VERDEROP in het document heet:
  op bankrekeningen, in het ondertekeningsblok, bij de tenaamstelling van bezittingen.
- Wijkt dat af — bijvoorbeeld "Sander Alexander Schreven" bovenaan tegenover "Alexander Schreven"
  op de rekening — dan is dat een bevinding. Ofwel er is een roepnaam ingevlochten die er niet
  hoort, ofwel de tenaamstelling klopt niet. Benoem welk van beide je ziet.
- Dit is geen spellingskwestie: een vaststellingsovereenkomst identificeert partijen, en een
  naam die intern niet klopt maakt de toedeling van bezittingen aanvechtbaar.
- Let op: een verkorte vermelding met initialen ("A. Schreven") of alleen de achternaam ("de heer
  Schreven") is normaal en geen bevinding.

DE PASSAGE MOET DE FOUT UIT DE TITEL BEVATTEN:
Het citaat in 'passage' moet de zin zijn waarin het gebrek uit 'onderwerp' zich voordoet.
- Gaat de titel over kinderalimentatie, dan mag de passage geen zin over partneralimentatie zijn.
- Kun je geen zin aanwijzen die de fout uit de titel bevat, dan klopt de titel niet, of het
  issue niet. Herformuleer het naar wat de aangewezen zin wél laat zien, of laat het weg.
- Een passage die over een aanpalend onderwerp gaat is geen bewijs. Hij maakt het issue juist
  ongeloofwaardig, want de lezer springt ernaartoe en ziet iets anders staan dan beloofd.

GEEN REGELING EISEN VOOR WAT ER NIET IS:
Een vermogensbestanddeel dat in het document nergens concreet voorkomt, hoeft ook geen eigen
sectie of regeling te hebben. Rapporteer dus GEEN ontbrekende bepaling over levensverzekeringen,
beleggingen, crypto, huisdieren, voertuigen of ondernemingsvermogen als het document er geen
enkel concreet exemplaar van noemt.
- Een terloopse of voorwaardelijke vermelding telt NIET als een concreet bestanddeel. "de
  eventueel verpande polissen" is geen aangewezen polis; "eventuele beleggingen" is geen belegging.
- Wél rapporteren als het document een concreet bestanddeel noemt (een polisnummer, een
  verzekeraar, een rekening, een merk en type) zonder de bestemming ervan te regelen.
- Dit geldt óók voor MfN-elementen. In de mfn_score mag zo'n element gerust op "ontbreekt"
  staan — dat is een scoreveld — maar maak er geen issue van. Een echtscheiding zonder
  levensverzekering is geen onvolledig convenant.

SAMENHANG TUSSEN KOP, BEVINDING EN PASSAGE:
- 'onderwerp': benoem de exacte fout zoals die uit de bevinding blijkt.
- 'bevinding': beschrijf waarom DEZE passage een probleem is — niet een andere passage,
  niet een ander onderwerp.
NOOIT: onderwerp over fout X, maar bevinding/passage over een totaal ander onderwerp Y.
NOOIT: een kop die meer beweert dan de bevinding aantoont.

DE AANBEVELING MOET NAAST HET DOCUMENT KUNNEN BESTAAN:
- Lees de alinea's rond de passage voordat je iets voorstelt. Regelt het document het
  onderwerp een stuk verderop anders of aanvullend, dan bepaalt dat mede of er wel een
  gebrek is — en zo ja, welk.
- Een aanbeveling die een naburige bepaling tegenspreekt is geen verbetering maar een
  nieuwe tegenstrijdigheid.
NOOIT: partijen iets laten afspreken dat het tegenovergestelde is van wat zij elders in
hetzelfde document uitdrukkelijk zijn overeengekomen. Spreekt jouw voorstel zo'n bepaling
tegen, benoem die bepaling dan in de bevinding en pas de aanbeveling erop aan.
NOOIT: een ontbrekend beding aanvoeren dat de wet uitdrukkelijk optioneel laat, alsof het
een eis is. Vraag je bij elk "ontbreekt" af of de wet het voorschrijft of slechts toestaat.`;

// De datum zit erin zodat het model kan beoordelen of een peildatum in het verleden
// ligt. Gevolg: het blok verandert dagelijks en mist dan eenmalig de cache.
export const bouwPseudonimiseringNota = (vandaag) =>
`PSEUDONIMISERING — VERPLICHTE UITSLUITINGSREGEL:
Het document is vóór verzending automatisch pseudonimiseerd. Adressen, postcodes, woonplaatsen en andere PII zijn vervangen door placeholders:
  [ADRES]      → straatadres incl. huisnummer (bijv. "Grotestraat 140")
  [WOONPLAATS] → woonplaatsnaam (bijv. "Almelo")
  [POSTCODE]   → Nederlandse postcode
  [BSN] / [TEL] / [EMAIL] → overige persoonsgegevens
  [IBAN-1], [IBAN-2], … → rekeningnummers (automatisch genummerd; hetzelfde nummer = zelfde placeholder)
GEVOLG: formaat-validatie op zulke velden levert valse positieven op.
- Maak GEEN issue aan als een BSN, telefoonnummer of e-mailadres niet het verwachte formaat heeft.
- Maak GEEN issue over een ontbrekende of generieke woonplaats of adres — het [ADRES]/[WOONPLAATS] staat WEL in het originele document.
- Controleer WEL of een waarde ONTBREEKT of INCONSISTENT is op inhoudelijk niveau.
Gebruik in jouw aanbevelingen NOOIT letterlijke woonplaatsen of straatnamen — schrijf altijd [WOONPLAATS] resp. [ADRES].

HUIDIGE DATUM: ${vandaag}. Gebruik deze datum bij alle temporele beoordelingen — bijv. of een peildatum, ondertekeningsdatum of ingangsdatum in het verleden of de toekomst ligt. Rapporteer een datum NOOIT als "in de toekomst" als die datum eerder is dan de huidige datum.`;

// Het feitenblok staat vooraan: wat vaststaat hoort te gelden vóór alle
// beoordelingsregels die erna komen.
export const bouwStabielGedeeld = (vandaag, situatieKenmerken = []) => {
  const feiten = bouwFeitenBlok(situatieKenmerken);
  return (feiten ? `${feiten}\n\n` : '')
    + `${bouwPseudonimiseringNota(vandaag)}\n\n${VERIFICATIEPLICHT}\n\n${ERNST_CRITERIA}`;
};
