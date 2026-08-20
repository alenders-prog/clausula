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
1. PARTNERALIMENTATIE — Bedrag of nihilbeding? Bij nihilbeding: bewust en geïnformeerd (art. 1:159 BW)? Termijn max 12 jaar (art. 1:157 BW)? Indexering?
2. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)? LET OP: als het convenant expliciet verwijst naar een bijgevoegd of apart opgemaakt ouderschapsplan voor alle kinderafspraken, is dat een correcte en gangbare opzet — flag dit DAN NIET als ontbrekend. De kinderalimentatie hoeft in dat geval niet ook nog in het convenant herhaald te worden.
3. PENSIOENVEREVENING — WVPS 50/50 of schriftelijke afwijking (WVPS art. 2 en 5)?
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
