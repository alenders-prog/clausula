/**
 * Unit test — omvang van index.html
 *
 * Geen stijlregel maar een rem. Het refactorplan in docs/REFACTOR-PLAN-clausula.md
 * ging uit van ~13.000 regels; tijdens de uitvoering ervan groeide het bestand naar
 * bijna 15.000. De extractie hield geen gelijke tred met wat er bijkwam, en dat is
 * precies de manier waarop een refactor halverwege doodbloedt.
 *
 * Deze grens mag ALLEEN OMLAAG. Verhogen kan technisch, maar dan staat het in de
 * diff en is het een besluit in plaats van een sluipende toename.
 *
 * Loopt hij vol? Verplaats dan eerst iets naar src/ — met een test erbij. Dat is
 * meteen de winst: alles wat in src/ staat is getest, niets van wat in index.html
 * staat is dat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Vastgesteld op 19 augustus 2026. Verlaag deze waarde bij elke extractie.
//
// 21-08-2026: bewust verhoogd van 14894 naar 14939 (+45), voor drie reparaties
// die bedrading in dit bestand nodig hadden: de knoptoestand na een
// concept-generatie, het herstel van opsommingstekens in de tracked-changes
// patcher, en de documentcontext voor de extra verificatie.
//
// De pure logica is wél verhuisd — src/docx/bullet-prefix.js (11 tests) en
// src/rapport/verificatie-context.js (15 tests). Wat hier bleef staan is
// bedrading die niets te bewijzen heeft; verplaatsen zou alleen indirectie
// opleveren.
//
// 23-08-2026: bewust verhoogd van 14939 naar 14994 (+55), voor het streamende
// antwoord van de assistent. Wat erbij kwam is uitsluitend DOM-bedrading: een
// labelwissel in de denkbubbel, het opbouwen van de voorvertoning, en de
// vertakking tussen stroom en JSON in de fetch.
//
// De redenerende delen staan wél in src/ — src/assistent/deelbare-json.js leest
// een veld uit JSON die nog binnenkomt (14 tests), src/assistent/sse-stroom.js
// haalt de stroom uit elkaar (10 tests). De bubbel verplaatsen zou betekenen dat
// _assistMd, _assistHerstelNamen en het container-element als parameters mee
// moeten; dat is indirectie zonder dat er een test bij komt die iets bewijst.
// 23-08-2026 (tweede keer die dag): verhoogd van 14994 naar 15028 (+34), voor het
// progressief tonen van de extra verificatie en het opmerken van een afgekapt
// antwoord. Ook dit is bedrading: het bijhouden van twee SSE-velden, een render
// tijdens de leeslus, en de opbouw van een meldingsblok.
//
// De redenerende delen staan in src/verificatie/stroom-status.js (15 tests):
// splitsen van analyse en voorstel, en het oordeel of de stroom is afgerond.
//
// 23-08-2026 (vierde keer): 15028 → 15082 (+54), voor de opmaak van het streamende
// antwoord: de .assist-bubble-wikkel die de voorvertoning miste, en de voortgangsregel
// die toont welk onderdeel nog onderweg is.
//
// ── Waarom er nu twee grenzen zijn ──
// Bij deze verhoging viel op dat 20 van de 54 regels CSS waren. De regel in CLAUDE.md
// gaat over logica — "nieuwe logica met een eigen redenering hoort in src/, met een
// unittest" — maar deze bewaker telde álles: stijl, opmaak en script door elkaar. Een
// stijlblok dat groeit is niet waar de rem voor bedoeld is, en er ís ook geen plek om
// CSS naartoe te verplaatsen: er is geen build-stap.
//
// Vandaar de tweede grens hieronder, op alleen de regels binnen <script>. Die meet wat
// de regel bedoelt. De totale grens blijft staan als vangnet tegen een bestand dat op
// een andere manier uitdijt, maar de JS-grens is degene die iets zegt.
//
// Verdeling op dit moment: 12.085 JavaScript · 2.157 CSS · 840 HTML.
// 23-08-2026 (vijfde keer): 15099 → 15174 (+75 totaal, +75 script), voor het streamen
// van het rawModus-pad: clausule, mail, klanttekst en samenvatting. Dat is één
// stroom-bouwer (`_assistMaakTekstStroom`), één leeshulp (`_assistRawStroom`), de
// clausule-indeling die ook met half binnengekomen tekst overweg kan, en de bedrading
// van vijf aanroepen.
//
// Waar de tekst uit rawModus vandaan komt en hoe hij geknipt wordt staat wél in src/:
// src/assistent/clausule-delen.js (14 tests). Wat hier ligt is het aansturen van de
// renderer — en die renderer is bewust één functie gebleven, zodat de opmaak onderweg
// niet kan afwijken van die aan het eind.
// 24-08-2026: 15174 → 15206 (+32), voor `_assistVerwijderClausuleHeader` uit een
// reviewbevinding en voor de toelichting bij `_assistSelecteerKeuze`, die nu vraag en
// keuze uit de DOM leest in plaats van uit het onclick-attribuut. Beide DOM-werk;
// er valt niets aan te extraheren.
// 24-08-2026 (tweede keer): 15206 → 15347 (+141 totaal, +116 script), voor stap 3
// van de analyse-wizard. Die stap bestond niet: de wizard sloot zichzelf en drukte op
// de knop van het uploadscherm, dat daardoor tijdens de analyse zichtbaar werd met de
// documentenlijst die net was bevestigd.
//
// Wat erbij kwam is flow en DOM: een paneel tonen, de documenten als samenvatting
// tekenen, de voortgangselementen lenen en terugzetten, en de analyse als functie
// losmaken van de klik-handler zodat de wizard erop kan wachten. Geen van die delen
// heeft een eigen redenering die zich buiten de DOM laat toetsen — wat het wél
// verdiende is een browsertest, en die staat er (07-wizard-analyse.spec.js).
// 24-08-2026 (derde keer): 15377 → 15382 (+5 totaal, +5 script), na twee reparaties
// die per saldo bijna tegen elkaar wegvielen.
//
// Eruit: de roepnaam-issues, die als één lijst aan élk document werden geplakt met
// een passage uit het verkeerde document. Die toewijzing staat nu in
// src/rapport/roepnaam-issues.js (11 tests) — precies een transformatie met een
// eigen redenering, dus daar hoort hij.
//
// Erin: één anker per treffer in `highlightInDocx`. Dat is geen redenering die zich
// buiten de DOM laat toetsen — de functie loopt over live tekstnodes en het bewijs
// is juist dat twee <mark>-elementen samen één zoekresultaat vormen. Verplaatsen
// zou de walker als parameter opleveren zonder dat er iets aantoonbaar wordt.
// Wat het wél verdiende is een browsertest: 08-doc-zoeken.spec.js, vier stuks,
// waarvan er drie falen zodra de oude verzamelwijze terugkomt.
// 24-08-2026 (vierde keer): 15382 → 15434 (+52 totaal, +51 script), voor het
// vervangen van wizard-stap 3 door een looptoestand ín stap 2.
//
// Er ging óók code weg: wizNaarStap3 en wizHerstelVoortgang samen 64 regels, plus
// een !important-CSS-blok en het markupblok van stap 3. Wat ervoor terugkomt is
// langer omdat het meer toestanden netjes afhandelt — knop, terugknop,
// keuzelijsten, standvakjes, foutpad — en omdat er uitleg bij staat over waarom
// het geleende-elementen-mechanisme weg moest. Dat mechanisme brak op één dag twee
// keer; die uitleg is de goedkoopste manier om te voorkomen dat iemand het
// terugbouwt.
//
// Verplaatsen naar src/ is hier onderzocht en afgewezen: alles wat erin zit is
// DOM-bedrading (klasse zetten, knop uitschakelen, rij opzoeken). Er is geen kern
// die zich buiten de DOM laat toetsen; extractie zou een parameterlijst met
// element-id's opleveren en geen enkele bewering bewijzen.
//
// Wat het wél verdiende is een browsertest, en die is meegegroeid:
// 07-wizard-analyse.spec.js dekt nu vijf gevallen, waaronder het foutpad waar de
// vorige opzet twee keer op strandde, en het vinkje-op-naam in plaats van op
// volgorde.
// 24-08-2026 (vijfde keer): 15434 → 15421 (−13, alleen CSS). De veertien
// laadanimaties zijn er vier geworden; wat er aan uitleg bijkwam woog niet op tegen
// wat er aan dode en dubbele regels wegging. Het script bleef gelijk — dit was
// stijlwerk, en dat is precies waarom er twee grenzen zijn.
// 24-08-2026 (zesde keer): 15421 → 15487 (+66 totaal, +53 script), voor de
// traagregel — de zin die verschijnt wanneer de voortgang stilstaat. Dat was de
// klacht van die dag ("er lijkt nu niets meer te gebeuren"), en geen van de
// veertien animaties loste hem op.
//
// De redenering staat wél in src/: src/ui/traag-melder.js met twaalf tests, over
// de vraag wanneer iets als stilstand telt. Het subtiele punt daar is dat een
// hérhaalde melding niet als voortgang telt — de SSE-lus stuurt bij elk event
// dezelfde zin, en zou dat de klok terugzetten dan ging de regel nooit af.
//
// Wat hier bleef is bedrading: een luisteraar, een interval, en een element tonen
// of verbergen. Daar valt niets aan te bewijzen buiten de DOM. Afgedekt met
// 09-traagregel.spec.js (vijf gevallen), waaronder dat de regel een herbouw van
// het analysepaneel overleeft — hij staat er bewust buiten.
// 24-08-2026 (zevende keer): 15487 → 15433 en 12456 → 12420. De traagregel is er
// weer uit. Hij verscheen na twintig seconden met "dit duurt langer dan
// gebruikelijk", maar op het analysescherm was al gemeld dat het een paar minuten
// duurt — dus de melding was niet alleen overbodig, hij was onwaar, en hij wekte
// ongeduld in plaats van het weg te nemen.
//
// Wat het probleem echt oploste is een regel eronder: de tekst noemt nu welke
// dimensies nog draaien en wordt korter naarmate ze binnenkomen. Dan staat er
// niets meer stil, en is er niets meer te melden over stilstand.
//
// src/ui/traag-melder.js en zijn twaalf tests zijn mee verwijderd. Ongebruikte
// code laten staan is precies wat we deze dag hebben opgeruimd.
// 24-08-2026 (achtste keer): 15433 → 15457 (+24, alle 24 script), voor het
// aansluiten van kiesUniekFragment op de passage-zoekterugval. Een aangeklikt
// issue markeerde de verkeerde alinea omdat de laatste terugval het eerste venster
// van vier woorden nam — "De ouder waar het" — dat twintig regels eerder óók stond.
//
// De redenering staat in src/viewer/uniek-fragment.js met dertien tests: kies een
// fragment dat het document maar één keer bevat. Wat hier bijkwam is de aanroep,
// een terugval erachter voor gescande documenten, en de uitleg waarom uniekheid
// een betere maatstaf is dan een stopwoordenlijst.
// 24-08-2026 (negende keer): 15457 → 15472 (+15, alle 15 script), voor het
// aaneenplakken van tekstnodes MET een spatie op blokgrenzen. Een passage die over
// twee bullets liep was onvindbaar omdat er "…te wensen.Oud & Nieuw…" stond.
//
// De redenering staat in src/viewer/dom-tekst.js met tien tests, en het onderscheid
// is subtiel genoeg om het daar te willen hebben: tussen blokken WEL een spatie,
// binnen een blok NIET — anders breekt "vor<strong>dering</strong>" in tweeën.
// Wat hier bijkwam is het bepalen van het blok per node en de aanroep.
// 25-08-2026 (tiende keer): 15472 → 15502 (+30, alle 30 script), voor de toets of
// twee documenten wel bij hetzelfde dossier horen, met een doorgaan-of-afbreken-vraag.
//
// De redenering staat in src/dossier-samenhang.js met negentien tests. Wat hier bijkwam
// is uitsluitend bedrading die niet naar src/ kán: de aanroep, het bevestigingsvenster,
// de afbreek-tak en de brugregels. Er is eerst elf regels commentaar geschrapt dat de
// uitleg uit de module herhaalde; dit is wat er daarna nog overbleef.
//
// Waarom de grens hier omhoog gaat en niet de code dichter: de toets zelf staat al in
// src/ mét tests. De grens bewaakt toetsbaarheid, en die is hier niet in het geding —
// alleen het aantal regels bedrading, en dat is de prijs van een dialoog in een bestand
// zonder build-stap.
// 26-08-2026 (elfde keer): 15502 → 15676 (+174, waarvan 130 script en 44 opmaak),
// voor tweefactorauthenticatie: het tabblad Beveiliging, in- en uitschrijven, en de
// controle bij het opstarten.
//
// Waarom de grens omhoog gaat: het toetsbare deel staat al in src/auth/ — het beleid
// (wie moet 2FA, en wat nu?) in mfa-beleid.js en de vier schermtoestanden in
// mfa-scherm.js, samen 28 tests. Wat hier bijkomt kán daar niet heen: het roept
// db.auth.mfa.* aan en hangt knoppen op. De grens bewaakt toetsbaarheid, en die is
// hier niet in het geding.
//
// De 44 regels opmaak tellen wel mee in MAX_REGELS_INDEX maar niet in MAX_REGELS_JS —
// dat is precies waarvoor die tweede grens sinds 23-08-2026 bestaat.
// Zelfde dag, +21 script: het opruimen van een half afgeronde inschrijving en het
// tonen van de échte foutmelding in plaats van een vangnettekst die de oorzaak
// verborg. Zie mfaInschrijfFoutTekst in src/auth/mfa-beleid.js.
// +2 opmaakregels (geen script) voor de waarschuwing over een achtergebleven regel in
// de authenticator-app. Die kostte in de praktijk een half uur zoeken: de app toonde
// nette codes uit een eerdere poging die de server allang niet meer kende.
// 26-08-2026 (twaalfde keer): 15699 → 15861 (+162, waarvan slechts 32 script).
// Het dashboard boven de dossierlijst: kaartenrij, uitklappaneel met periodekiezer,
// en de secties categorie/verloop/MfN/top.
//
// Die 32 is laag omdat er ook iets wég ging: berekenGemiddeldeScore stond in dit
// bestand en verhuisde naar src/rapport/score.js (66 regels eruit). Het dashboard
// rekent met dezelfde formule als de chip op een dossierkaart, en twee kopieën van
// een scoreformule lopen gegarandeerd uiteen. Die verhuizing leverde bovendien
// zestien tests op voor een formule die er geen had — en het is de formule die het
// cijfer bepaalt dat een mediator aan zijn cliënt laat zien.
//
// Aggregatie (26 tests) en weergave (23 tests) staan in src/dashboard/. Wat hier
// bijkwam is de periodekeuze, het platslaan van de geneste query en het ophangen
// van de knoppen.
// +16 na de eerste ronde terugkoppeling: opmaak voor de twee voor/na-ringen en de
// totaalregel, plus vier scriptregels om de documenttypekeuze door de hele aggregatie
// te laten werken in plaats van alleen door het MfN-blok.
// 15882 → 15872 (−10). De kop en de legenda boven de ringen zijn er weer uit: de
// kleuren staan al links boven de tabel en de ringen spreken zonder bijschrift. Wat
// overblijft is het centreren, verticaal tegen het staafdiagram en horizontaal in de
// eigen kolom.
// +4 opmaakregels: ook de enkele ring krijgt de ring van de dossierkaart. Bij
// Ouderschapsplan was nog niets afgevinkt, dus viel die sectie terug op de oude
// opmaak — één documenttype zag er anders uit dan de rest.
// 28-08-2026 (dertiende keer): 15876 → 15913 (+37, alle 37 script), voor het
// wegschrijven van een feitregel bij elke bewaarde analyse — tellingen die blijven
// staan als het dossier later wordt verwijderd.
//
// Het tellen zelf staat in src/dashboard/feiten.js met achttien tests, waaronder het
// vangnet dat weigert te schrijven zodra er vrije tekst in een feitregel staat. Wat
// hier bijkwam is het ophalen van de zojuist bewaarde rij en het wegschrijven.
// 28-08-2026 (veertiende keer): 15913 → 15967 (+54, waarvan 51 script). Het dashboard
// rekent nu op analyse_feiten in plaats van op de screeningen, zodat de cijfers blijven
// staan als een dossier wordt verwijderd.
//
// Het rekenwerk staat in src/dashboard/feiten-statistiek.js met 24 tests, waaronder
// een kruiscontrole dat beide bronnen dezelfde cijfers geven zolang er niets is
// verwijderd. Wat hier bijkwam is het ophalen, het samenvoegen van de twee bronnen
// (tellingen uit feiten, verloop en top-lijst uit de live berekening omdat die
// issue-titels nodig hebben) en het regeltje dat meldt hoeveel er uit verwijderde
// dossiers meetelt.
// 29-08-2026 (vijftiende keer): 15967 → 16017 (+50, waarvan 45 script). Een afgekapt
// antwoord van de assistent blijft nu staan in plaats van te verdwijnen.
//
// De aanroeper riep bericht.weg() in een finally-blok, dus ook bij een fout — met de
// motivering "geen half bericht laten staan". Bij een clausule die vijftig seconden
// schrijft en op de tijdslimiet strandt is dat de duurste reactie die er is: de
// gebruiker ziet het antwoord verschijnen en vervolgens in één klap verdwijnen.
// Twee streambubbels kregen daarom afbreken(); de aanroepplekken ruimen alleen nog
// op bij succes.
// 29-08-2026 (zestiende keer): 16017 → 16024 (+7, alle 7 script). De fase-header voor
// api/claude-edge.js, plus de fase bij de twee aanroepplekken (classificatie, concept).
//
// Dat endpoint is een doorgeefluik: het stuurt de body ongewijzigd naar Anthropic en
// kan dus niet weten waarvoor het wordt gebruikt. Vandaar een header en geen veld in
// de body — dat laatste zou meegaan naar Anthropic.
// 29-08-2026 (zeventiende keer): 16024 → 16059 (+35, alle 35 script), voor het wachten
// op de ESM-brug.
//
// `laadDossiers()` staat aan het eind van de opstart-IIFE in het KLASSIEKE script, dat
// meteen draait; het moduleblok onderaan is deferred. Alles wat via window.* uit src/
// komt bestaat op dat moment nog niet. Die race zat er altijd in en werd altijd
// gewonnen — tot de modulegraaf van ~20 naar ~30 bestanden groeide. Toen meldde de app
// bij het openen "Kon dossiers niet laden: maakGrad is not defined", zonder enige
// foutmelding in de console.
//
// Verplaatsen naar src/ kan hier niet: het IS de koppeling tussen de twee scriptsoorten.
// Wat het wél verdiende is een browsertest, en die staat er (13-brug-race.spec.js) —
// mét de race afgedwongen, want zonder die vertraging bleef hij groen ook als je de
// reparatie weghaalde.
// 29-08-2026 (achttiende keer): 16059 → 16077 (+18, alle 18 script), voor het
// tijdsbudget van de PDF→DOCX-conversie.
//
// De rédenering ging wél naar src/ (conversie/wachtschema.js, 13 tests). Wat hier
// achterbleef is bedrading die nergens anders kán staan: de import, zes window.*-regels
// op de brug, `await brugGereed`, en twee `signal:`-regels bij de fetches. Daar valt
// geen test omheen te schrijven, want er valt niets te beslissen.
//
// De aanleiding: de conversie bleef eeuwig staan op "Converteren… (1s)". `vercel dev`
// sluist het antwoord via undici door en valt bij ~1,44 MB om met een onafgevangen
// socket-error; het proces sterft en niemand antwoordt nog. Dat is hun bug. Van ons was
// dat de app er oneindig op wachtte: geen enkele fetch had een tijdslimiet, en de grens
// van 90s telde alleen de SLAAPTIJD op en werd bovenaan de lus getoetst — dus precies
// bij een aanroep die bleef hangen kon hij niet afgaan.
// 31-08-2026 (negentiende keer): 16077 → 16128 (+51, waarvan 42 script en 9 CSS), voor
// de statusregel die tijdens de analyse blijft staan.
//
// De beslissing zelf ging naar src/analyse/voortgang-status.js met 15 tests; de oude
// inline-variant in de render is daarmee verdwenen. Wat hier bijkwam is het tekenen
// (tekenVoortgangStatus, ~30 regels DOM-werk), twee plekken in de kopregel en het
// onthouden van het afrondingsmoment.
//
// De aanleiding: de zin "Bezig met juridische toets, balans en grammatica…" hing aan
// `alleI.length > 0 ? kaarten : nogBezig ? zin : leeg` — dus aan "er is nog niets" in
// plaats van aan "er wordt nog gewerkt". Zodra het eerste verbeterpunt binnenkwam was
// hij weg, terwijl er nog twee dimensies liepen. Wat overbleef waren de veegjes op de
// grijze fiches, en daaruit valt niet af te lezen waaróp gewacht wordt.
// 31-08-2026 (twintigste keer): 16128 → 16098 (−30, alle 30 script). Omláág, voor het
// eerst sinds lang: vindDocVolgorde ging naar src/rapport/doc-volgorde.js met 22 tests
// en liet 30 regels achter zich.
//
// Aanleiding: een verbeterpunt uit §11 van een ouderschapsplan stond bovenaan de lijst
// bij "Sorteren op Documentvolgorde". Er was geen enkele manier om te zien waarom — de
// functie gaf een getal terug zonder te zeggen of dat een treffer was of een terugval.
// Twee trappen waren daadwerkelijk stuk; nu zegt elke uitkomst via welke trap hij
// gevonden is, en telt beoordeelVolgorde hoeveel er op de terugval staan.
// 31-08-2026 (eenentwintigste keer): 16098 → 16118 (+20, alle 20 script), voor de
// sleutel waaronder een analyse gemeten wordt.
//
// api_verbruik had een kolom screening_id die nooit werd gevuld: de analyse begint
// vóórdat de screening bestaat, dus de server kán hem niet weten. De browser maakt hem
// nu vooraf en stuurt hem mee. Wat hier bijkwam is het maken, het meesturen, het
// bewaren in het rapport (nodig omdat een heranalyse de bestaande rij bijwerkt en de
// sleutel dan niet gelijk is aan het screening-id) en het wissen bij het laden.
// 31-08-2026 (tweeëntwintigste keer): 16118 → 16153 (+35, waarvan 29 script en 6 CSS),
// voor het opmerken van een afgekapte analyse.
//
// Een analyse van twee documenten werd na 120 seconden door Vercel doodgeschoten. De
// leeslus zette `_klaar` en las hem nergens: bij een weggevallen server brak hij af en
// toonde de app een rapport waarin voor één document álle juridische bevindingen
// ontbraken, zonder een spoor daarvan op het scherm. Het oordeel — wát er mist, en of
// het rapport te vertrouwen is — staat in src/analyse/afgekapt.js met 14 tests; hier
// bleef het tekenen van de balk over.
const MAX_REGELS_INDEX = 16153;
const MAX_REGELS_JS     = 12930;

function regels(pad) {
  return readFileSync(join(WORTEL, pad), 'utf8').split('\n').length;
}

/** Regels binnen <script>-blokken; `src=`-verwijzingen tellen niet mee. */
function scriptRegels(pad) {
  const bron = readFileSync(join(WORTEL, pad), 'utf8');
  return [...bron.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .reduce((n, m) => n + m[1].split('\n').length, 0);
}

describe('omvang van de monoliet', () => {
  it(`index.html blijft binnen ${MAX_REGELS_INDEX} regels`, () => {
    const n = regels('index.html');
    expect(
      n,
      `index.html is ${n} regels (grens ${MAX_REGELS_INDEX}). Verplaats logica naar src/ `
      + 'met een test, of verhoog de grens bewust in dit bestand.',
    ).toBeLessThanOrEqual(MAX_REGELS_INDEX);
  });

  it('de grens staat niet onnodig hoog', () => {
    // Zakt het bestand ruim onder de grens, dan hoort de grens mee te zakken —
    // anders ontstaat er stilletjes weer ruimte om te groeien.
    const n = regels('index.html');
    expect(
      MAX_REGELS_INDEX - n,
      `index.html is ${n} regels; verlaag MAX_REGELS_INDEX naar die waarde.`,
    ).toBeLessThan(250);
  });

  it(`het script in index.html blijft binnen ${MAX_REGELS_JS} regels`, () => {
    // Dit is de grens die de regel uit CLAUDE.md daadwerkelijk uitdrukt. CSS en
    // HTML tellen niet mee: daar valt niets aan te extraheren, en groei daarin
    // zegt niets over toetsbaarheid.
    const n = scriptRegels('index.html');
    expect(
      n,
      `index.html bevat ${n} regels script (grens ${MAX_REGELS_JS}). Nieuwe logica met `
      + 'een eigen redenering hoort in src/ met een unittest — zie CLAUDE.md.',
    ).toBeLessThanOrEqual(MAX_REGELS_JS);
  });
});
