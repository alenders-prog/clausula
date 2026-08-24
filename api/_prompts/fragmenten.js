/**
 * api/prompts/fragmenten.js — voorwaardelijke promptonderdelen
 *
 * Blokken die alleen onder bepaalde omstandigheden meegaan: notities over parallel
 * aangeleverde documenten en roepnamen, en de checklijsten per documenttype. Ze
 * worden ingevoegd in de system prompts van structuur.js en bevindingen.js.
 *
 * WIJZIGEN RAAKT DE SCREENINGKWALITEIT. Draai na elke aanpassing
 * `npm run test:eval` en vergelijk met de baseline — zie docs/auto-test-setup.md,
 * punt D10. Raak spelling en witruimte niet zonder reden aan: de gedeelde blokken
 * worden byte-exact door Anthropic gecachet.
 */

// Voorkomt dat het model meldt dat een parallel geanalyseerd document "ontbreekt".
export const bouwAnderDocsNota = (andereDocs) =>
  andereDocs.length
        ? `\nMEEGELEVERDE ANDERE DOCUMENTEN: ${andereDocs.join(', ')} ${andereDocs.length > 1 ? 'zijn' : 'is'} ook aangeleverd en word${andereDocs.length > 1 ? 'en' : 't'} parallel apart geanalyseerd. Rapporteer NOOIT dat een van deze documenten "niet meegeleverd is" of "als bijlage ontbreekt".`
        : '';

// Roepnamen uit bestandsnaam of dossiernaam die afwijken van de formele naam.
// De namen zijn hier al gepseudonimiseerd (nepVoornaam / nepVolledig).
export const bouwRoepnamenNota = (roepnamen) =>
  Array.isArray(roepnamen) && roepnamen.length
        ? `\nROEPNAMEN: De volgende partijen worden mogelijk aangeduid met een roepnaam die afwijkt van hun formele naam:${roepnamen.map(r => `\n- "${r.nepVoornaam}" als roepnaam van "${r.nepVolledig}"`).join('')}\nControleer voor elk of het document de roepnaam formeel introduceert (bijv. "verder te noemen als X" of vergelijkbaar). Indien de roepnaam NERGENS formeel omschreven is maar WEL elders in het documentlichaam (buiten de introductiezin) gebruikt wordt: meld dit als LAAG-issue. Indien de roepnaam NERGENS in het document voorkomt (ook niet in het lichaam), is er geen issue. Meld NOOIT een roepnaam-issue op basis van het bestaan van de roepnaam buiten het document.`
        : '';

// Checklijst per documenttype; de laatste tak is de terugval voor bijlagen
// en onbekende types.
export const bouwJuridischeChecks = (docType) =>
  docType === 'ouderschapsplan' ? `
Controleer specifiek op:
1. HOOFDVERBLIJFPLAATS — Wettelijk verplicht (art. 826 Rv).
2. ZORGREGELING — Omgangstijden specifiek (welke dagen, weekenden, vakanties, feestdagen)?
3. INFORMATIEPLICHT — Opgenomen (art. 1:377b BW)?
4. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)?
5. GEZAG — Gezamenlijk gezag bevestigd of afwijking gevraagd (art. 1:247 BW)?
6. GESCHILLENREGELING — Escalatiebepaling of mediationclausule (art. 1:253a BW)?
7. INDEXERING — Kinderalimentatie jaarlijks geïndexeerd?`
        : docType === 'convenant' ? `
Controleer specifiek op:
1. PARTNERALIMENTATIE — Bedrag of nihilbeding? Een nihilbeding is een overeenkomst op grond van art. 1:158 BW: partijen bepalen zelf of, en zo ja tot welk bedrag, er alimentatie verschuldigd is. Is dat bewust en geïnformeerd vastgelegd? Indexering?
   DUUR (art. 1:157 BW, zoals sinds 1-1-2020): staat er geen termijn in de overeenkomst, dan eindigt de verplichting van rechtswege na de helft van de huwelijksduur met een maximum van VIJF jaar (lid 1). Langer bij een huwelijk boven vijftien jaar wanneer de gerechtigde binnen tien jaar van de AOW-leeftijd zit (lid 2) of geboren is op of vóór 1 januari 1970 (lid 3, tien jaar), en bij kinderen tot twaalf jaar loopt hij door tot het jongste kind twaalf wordt (lid 4). Bij samenloop geldt de langste termijn (lid 5). De oude termijn van twaalf jaar geldt ALLEEN voor verzoeken die vóór 1 januari 2020 zijn ingediend — noem die dus niet bij een recente scheiding.
   NIET-WIJZIGINGSBEDING (art. 1:159 BW) IS OPTIONEEL, GEEN EIS. Dat is het beding dat de overeenkomst NIET door de rechter gewijzigd kan worden op grond van gewijzigde omstandigheden ("kan worden bedongen", schriftelijk). Beveel het NOOIT aan wanneer het document juist voorziet in herberekening, heroverweging of overleg bij gewijzigde omstandigheden: partijen willen dan het tegenovergestelde, en je zou hun eigen afspraak ongedaan maken. Het ontbreken van een niet-wijzigingsbeding is op zichzelf geen gebrek.
2. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)? LET OP: als het convenant expliciet verwijst naar een bijgevoegd of apart opgemaakt ouderschapsplan voor alle kinderafspraken, is dat een correcte en gangbare opzet — flag dit DAN NIET als ontbrekend. De kinderalimentatie hoeft in dat geval niet ook nog in het convenant herhaald te worden.
3. PENSIOEN — VEREVENING OF CONVERSIE? Dit zijn twee verschillende rechtsfiguren en de tekst
   verraadt welke bedoeld is. Let op het werkwoord:
   - VEREVENING (art. 2 WVPS, de wettelijke hoofdregel): de vereveningsgerechtigde krijgt recht
     op uitbetaling van de helft van het tijdens het huwelijk opgebouwde ouderdomspensioen, maar
     het pensioen blijft van de opbouwende partner. Het recht gaat in bij diens pensionering en
     eindigt bij diens overlijden. Woorden die hierop wijzen: "verevenen", "recht op uitbetaling",
     "de helft van het opgebouwde ouderdomspensioen".
   - CONVERSIE (art. 5 WVPS): het pensioendeel wordt omgezet in een eigen, zelfstandige aanspraak
     van de andere partner — losgekoppeld van het leven van de opbouwende partner. Woorden die
     hierop wijzen: "overdragen", "omzetten", "eigen aanspraak", "zelfstandig recht".
   ZO CONTROLEER JE HET: beschrijft het convenant conversie ("draagt over", "wordt omgezet") maar
   noemt het art. 5 WVPS niet, dan is dat een juridisch issue. Conversie vereist een uitdrukkelijke
   schriftelijke afspraak én instemming van de pensioenuitvoerder; zonder die grondslag is de
   afspraak niet uitvoerbaar en valt men terug op verevening — met een heel ander rechtsgevolg
   voor de langstlevende. Rapporteer dit als juridisch, niet als volledigheidsgebrek: er ontbreekt
   geen tekst, er staat de verkeerde rechtsfiguur.
   Controleer daarnaast: is er een afwijking van de 50/50-verdeling, en zo ja, schriftelijk
   vastgelegd? Is het bijzonder partnerpensioen geregeld of uitdrukkelijk uitgesloten?
4. WONING — Leverings-/passeerdatum? Hypotheek overname of verkoop? Ontslag aansprakelijkheid?
5. BELASTING — Fiscaal partnerschap tot welke datum? Aanslagen/teruggaven verdeeld?
6. VERMOGEN — Huwelijksgemeenschap of verrekenbeding volledig afgewikkeld (art. 1:94 en 1:121 BW)?
7. SCHULDEN — Wie neemt welke schulden over?
NOOIT als inconsistentie of conflict aanmerken: het hanteren van een gemaximeerd netto gezinsinkomen (bijv. € 7.500,-/maand per de Alimentatienormen/Trema) als grondslag voor kinderalimentatieberekeningen, terwijl het werkelijke (hogere) netto gezinsinkomen geldt als grondslag voor partneralimentatie. Dit is de standaard Trema-methode en is juridisch correct — ook als beide grondslagen in hetzelfde document naast elkaar staan.`
        : `\nControleer op juridische juistheid, volledigheid en consistentie.`;

// Kruiscontroles die alleen zin hebben als er huwelijkse voorwaarden meekomen.
export const bouwHvChecks = (heeftHV) =>
  heeftHV ? `

HUWELIJKSE VOORWAARDEN AANWEZIG — kruiscontroles uitvoeren:
HV-A. STELSEL — Benoem het vermogensrechtelijk stelsel (koude uitsluiting / beperkte gemeenschap / verrekenbeding).
  Bij KOUDE UITSLUITING: gezamenlijk eigendom? Ten onrechte "huwelijksgemeenschap"? WVPS geldt ook bij koude uitsluiting.
  Bij VERREKENBEDING: jaarlijks nagekomen? Finale verrekening of kwijtschelding opgenomen?
HV-B. UITSLUITINGSCLAUSULES — Erfenissen/schenkingen (art. 1:94 lid 3 BW) correct buiten verdeling?
HV-C. REFERENTIE — Verwijst convenant expliciet naar huwelijkse voorwaarden (datum en notaris)?` : '';

// Alleen bij een convenant. De detectie van het internationale element doet het
// model zelf op basis van de documentinhoud.
export const bouwIprChecks = (docType) =>
  docType === 'convenant' ? `

IPR — INTERNATIONAAL PRIVAATRECHT (verplicht bij convenant):
Detecteer of het document een internationaal element bevat. Signalen: buitenlandse nationaliteit van één of beide partijen, huwelijk in het buitenland gesloten, woonhistorie buiten Nederland ná het huwelijk, of vermogen in het buitenland (onroerend goed, bankrekening, pensioen, onderneming).

Als EEN OF MEER signalen aanwezig zijn — check de vier punten hieronder. Als GEEN signaal → maak géén IPR-issues.

IPR-A. TOEPASSELIJK RECHT — Vermeldt het convenant welk recht het huwelijksvermogensregime beheerst (bijv. "Op grond van EU-Verordening 2016/1103 / Haags Huwelijksvermogensverdrag 1978 is het recht van [land] van toepassing")?
  → Niet vermeld: volledigheid-issue (midden). Signalering: "Internationaal element aanwezig maar toepasselijk huwelijksvermogensrecht niet benoemd in het convenant."

IPR-B. WAGONSTELSEL — Alleen relevant bij huwelijken gesloten 1-9-1992 t/m 28-1-2019 (Haags Verdrag 1978). Als uit het document buitenlandse woonhistorie na het huwelijk blijkt: is vastgesteld of het wagonstelsel (automatische regimewijziging na 10 jaar verblijf in ander land, of vestiging in nationaliteitsland) tot een regimewisseling heeft geleid?
  → Niet vastgesteld: volledigheid-issue (midden). Signalering: "Buitenlandse woonhistorie tijdens tijdvak wagonstelsel (1992–2019): convenant vermeldt niet of automatische regimewijziging heeft plaatsgevonden."

IPR-C. VERDELING OP VERKEERD STELSEL — Wordt de verdeling berekend op de Nederlandse algehele of beperkte gemeenschap van goederen, terwijl het toepasselijke recht een ander stelsel aanwijst of aannemelijk maakt?
  → Ja: juridisch-issue (hoog). Signalering: "Verdeling gebaseerd op Nederlands recht terwijl een internationaal element duidt op toepasselijkheid van buitenlands huwelijksvermogensrecht — dit moet vóór ondertekening worden vastgesteld."

IPR-D. BUITENLANDS PENSIOEN — Is er een buitenlands pensioen vermeld zonder concrete afspraak over verevening of afstand?
  → Ja: volledigheid-issue (midden). Signalering: "Buitenlands pensioen vermeld zonder regeling: de WVPS is niet automatisch van toepassing op buitenlandse pensioenrechten — een expliciete afspraak is vereist."` : '';

// De MfN-score hangt aan een vaste elementenlijst per documenttype.
export const bouwMfnInstructie = ({ heeftMfn, docTypLabel, mfnElemList }) =>
  heeftMfn ? `

**mfn_score** — Beoordeel op MfN-vereisten. Score_aanwezig = aantal "aanwezig". Score_totaal = ${mfnElemList.length}.
MfN-VEREISTE ELEMENTEN (${docTypLabel}):
${mfnElemList.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '';
