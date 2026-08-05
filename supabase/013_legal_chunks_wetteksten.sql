-- ============================================================
-- Migratie 013 — Letterlijke wetteksten prioriteitsartikelen
-- Familierecht / echtscheidingsdocumenten
-- Geverifieerd via wetten.overheid.nl
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

-- Stap 1: Bronrecord aanmaken (idempotent via ON CONFLICT)
INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000012',
  'Wetteksten familierecht — letterlijke tekst prioriteitsartikelen BW/Rv',
  'WETTEKST-FAMILIERECHT-PRIORITEITSARTIKELEN',
  'richtlijn',
  'https://wetten.overheid.nl/BWBR0002656',
  '1838-01-01'
)
ON CONFLICT (id) DO NOTHING;

-- Stap 2: Verwijder eventueel bestaande chunks (idempotent)
DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000012';

-- ================================================================
-- CHUNK 1 — Art. 1:88 BW — Toestemming echtgenoot (geldend 2025)
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 1,
  'Art. 1:88 BW — toestemming echtgenoot (volledig)',
  'LID 1: Een echtgenoot behoeft de toestemming van de andere echtgenoot voor de volgende rechtshandelingen:
a. overeenkomsten strekkende tot vervreemding, bezwaring of ingebruikgeving en rechtshandelingen strekkende tot beëindiging van het gebruik van een door de echtgenoten tezamen of door de andere echtgenoot alleen bewoonde woning of van zaken die bij een zodanige woning of tot de inboedel daarvan behoren;
b. giften, met uitzondering van de gebruikelijke, niet bovenmatige;
c. overeenkomsten die ertoe strekken dat hij, anders dan in de normale uitoefening van zijn beroep of bedrijf, zich als borg of hoofdelijk medeschuldenaar verbindt, zich voor een derde sterk maakt, of zich tot zekerheidstelling voor een schuld van de derde verbindt;
d. overeenkomsten van goederenkrediet als bedoeld in artikel 84 van Boek 7, behalve indien zij zaken betreffen die kennelijk uitsluitend of hoofdzakelijk ten behoeve van de normale uitoefening van zijn beroep of bedrijf strekken.

LID 2: De echtgenoot behoeft de toestemming niet, indien hij tot het verrichten der rechtshandeling is verplicht op grond van de wet of op grond van een voorafgaande rechtshandeling waarvoor die toestemming is verleend of niet was vereist.

LID 3: De toestemming moet schriftelijk of langs elektronische weg worden verleend, indien de wet voor het verrichten van de rechtshandeling een vorm voorschrijft.

LID 4: In afwijking van lid 1, onder b, is geen toestemming vereist voor giften welke de strekking hebben dat zij pas zullen worden uitgevoerd na het overlijden van degene die de gift doet, en niet reeds tijdens diens leven worden uitgevoerd. Bestaat de gift in de aanwijzing van een begunstigde bij een sommenverzekering die tijdens het leven van de verzekeringnemer is aanvaard of kan worden aanvaard, dan is daarvoor wel toestemming vereist.

LID 5: Toestemming voor een rechtshandeling als bedoeld in lid 1 onder c, is niet vereist, indien zij wordt verricht door een bestuurder van een naamloze vennootschap of van een besloten vennootschap met beperkte aansprakelijkheid, die daarvan alleen of met zijn medebestuurders de meerderheid der aandelen houdt en mits zij geschiedt ten behoeve van de normale uitoefening van het bedrijf van die vennootschap.

LID 6: Indien de andere echtgenoot door afwezigheid of een andere oorzaak in de onmogelijkheid verkeert zijn wil te verklaren of zijn toestemming niet verleent, kan de beslissing van de rechtbank worden ingeroepen.

LID 7: Dit artikel is van toepassing ongeacht het recht dat van toepassing is op het huwelijksvermogensstelsel van de echtgenoten, indien de andere echtgenoot zijn gewone verblijfplaats heeft in Nederland ten tijde van het verrichten van een rechtshandeling, bedoeld in het eerste lid.

VALKUIL: Het criterium voor sub a is "bewoonde woning" (tegenwoordige tijd). Er bestaat GEEN wettelijke "kortgeleden heeft bewoond"-uitzondering. Lid 1 sub d gebruikt "goederenkrediet" (niet "koop op afbetaling").

TEMPORELE BEPERKING — KRITIEK VOOR SCHEIDINGSPRAKTIJK: Art. 1:88 BW geldt uitsluitend zolang het huwelijk voortduurt. Na inschrijving van de echtscheidingsbeschikking in de registers van de burgerlijke stand vervalt de toestemmingsplicht volledig.

Twee fasen bij een te verkopen woning:
- FASE 1 (ondertekening convenant tot inschrijving beschikking): art. 1:88 geldt — rechtshandelingen zonder toestemming zijn vernietigbaar. Duur varieert per rechtbank en omstandigheden.
- FASE 2 (inschrijving beschikking tot juridische levering): art. 1:88 vervalt — uitsluitend contractuele grondslag (boetebeding, leveringsplicht in het convenant) biedt nog bescherming.

Praktijkadvies: bij tijdelijke regelingen in het convenant (bijv. verbod op inwoning derden tijdens verkoopperiode) altijd vermelden dat de regeling ook ná inschrijving beschikking doorloopt op contractuele grondslag, en een boetebeding opnemen dat onafhankelijk van art. 1:88 werkt. Zonder dit valt de bescherming weg op het moment dat de beschikking wordt ingeschreven.

AFWEGING: HOORT DEZE BEPALING IN HET DOCUMENT?
Fase 1 (tekenen → beschikking) is doorgaans kort; art. 1:88 biedt hier al bescherming — een extra bepaling voegt in deze fase weinig toe. De bepaling is echter WEL noodzakelijk vanwege fase 2 (beschikking → levering woning), die maanden kan duren en waarbij art. 1:88 is vervallen. Conclusie: de bepaling hoort in het document, maar de motivering moet gericht zijn op fase 2, niet fase 1. Vermeld expliciet dat de bepaling doorloopt na inschrijving van de beschikking en leg de grondslag contractueel vast met een boetebeding.',
  ARRAY['eigen_woning', 'toestemming', 'ingebruikgeving', 'woning', 'borgtocht', 'gift', 'goederenkrediet', 'echtscheiding', 'tijdelijk']
);

-- ================================================================
-- CHUNK 2 — Art. 1:89 BW — Vernietiging zonder toestemming
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 2,
  'Art. 1:89 BW — vernietiging rechtshandeling zonder toestemming (volledig)',
  'LID 1: Een rechtshandeling die een echtgenoot in strijd met het vorige artikel heeft verricht, is vernietigbaar; slechts de andere echtgenoot kan een beroep op de vernietigingsgrond doen.

LID 2: Het vorige lid geldt niet voor een andere handeling dan een gift, indien de wederpartij te goeder trouw was.

LID 3: Het einde van het huwelijk en scheiding van tafel en bed hebben geen invloed op de bevoegdheid om ter vernietiging van een rechtshandeling van een echtgenoot een beroep op de vernietigingsgrond te doen, die voordien was ontstaan. Indien de andere echtgenoot dientengevolge schuldenaar uit die rechtshandeling wordt, geldt artikel 51 lid 3 van Boek 3 voor hem slechts, zolang de termijn van artikel 52 lid 1 van Boek 3 niet is verstreken.

LID 4: De verklaring of rechtsvordering tot vernietiging behoeft in afwijking van de artikelen 50 lid 1 en 51 lid 2 van Boek 3 niet mede te worden gericht tot de echtgenoot die de handeling heeft verricht.

LID 5: De echtgenoot die een beroep op de vernietigingsgrond heeft gedaan, kan tevens alle uit de nietigheid voortvloeiende rechtsvorderingen instellen.

TOELICHTING: Vernietigingsbevoegdheid bestaat ook ná echtscheiding voor rechtshandelingen verricht tijdens het huwelijk (lid 3). Verjaring: 3 jaar na kennis, in ieder geval 20 jaar na de rechtshandeling (art. 3:52 BW). De wederpartij te goeder trouw is beschermd bij niet-giften (lid 2).',
  ARRAY['eigen_woning', 'toestemming', 'vernietiging', 'woning', 'borgtocht']
);

-- ================================================================
-- CHUNK 3 — Art. 1:87 BW — Vergoedingsrecht / beleggingsleer
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 3,
  'Art. 1:87 BW — vergoedingsrecht / beleggingsleer (volledig)',
  'LID 1: Indien een echtgenoot ten laste van het vermogen van de andere echtgenoot een goed dat tot zijn eigen vermogen zal behoren, verkrijgt of indien ten laste van het vermogen van de andere echtgenoot een schuld ter zake van een tot zijn eigen vermogen behorend goed wordt voldaan of afgelost, ontstaat voor de eerstgenoemde echtgenoot een plicht tot vergoeding.

LID 2: De vergoeding beloopt een gedeelte van de waarde van het goed op het tijdstip waarop de vergoeding wordt voldaan. Dit gedeelte:
a. is in het geval van een verkrijging ten laste van het vermogen van de andere echtgenoot evenredig aan het uit diens vermogen afkomstige aandeel in de tegenprestatie voor het goed;
b. komt in het geval van een voldoening of aflossing ten laste van het vermogen van de andere echtgenoot overeen met de verhouding tussen het uit diens vermogen voldane of afgeloste bedrag ten opzichte van de waarde van het goed op het tijdstip van die voldoening of aflossing.

LID 3: Ten aanzien van de vergoeding gelden voorts de volgende regels:
a. tenzij de echtgenoot het vermogen van de andere echtgenoot met diens toestemming heeft aangewend op de wijze als bedoeld in het eerste lid, beloopt de vergoeding ten minste het nominale bedrag dat ten laste van het vermogen van de andere echtgenoot is gekomen;
b. ter zake van goederen die naar hun aard bestemd zijn om te worden verbruikt, beloopt de vergoeding steeds het nominale bedrag dat ten laste van het vermogen van de andere echtgenoot is gekomen;
c. ter zake van goederen die inmiddels zijn vervreemd zonder dat daarvoor andere goederen in de plaats zijn gekomen, wordt in plaats van de waarde, bedoeld in de aanhef van het tweede lid, uitgegaan van de waarde ten tijde van de vervreemding.

LID 4: Echtgenoten kunnen bij overeenkomst afwijken van het eerste lid tot en met het derde lid. Geen vergoeding is verschuldigd voorzover door de verkrijging, voldoening of aflossing ten laste van het vermogen van de andere echtgenoot wordt voldaan aan een op die echtgenoot rustende verbintenis.

LID 5: Kan de vergoeding overeenkomstig het eerste tot en met het vierde lid niet nauwkeurig worden vastgesteld, dan wordt zij geschat.

TOELICHTING: Beleggingsleer geldt uitsluitend voor gehuwden/geregistreerde partners (art. 1:87 BW). Voor samenwoners is de grondslag art. 6:212 BW (ongerechtvaardigde verrijking) — dat kent een nominaal en niet-proportioneel systeem.',
  ARRAY['vermogensrecht', 'beleggingsleer', 'vergoedingsrecht', 'eigen_woning', 'gemeenschap_van_goederen']
);

-- ================================================================
-- CHUNK 4 — Art. 1:94 BW NIEUW — Beperkte gemeenschap (v.a. 1-1-2018)
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 4,
  'Art. 1:94 BW — beperkte gemeenschap van goederen (geldend v.a. 1-1-2018, volledig)',
  'LID 1: Van het ogenblik van de voltrekking van het huwelijk bestaat tussen de echtgenoten van rechtswege een gemeenschap van goederen.

LID 2: De gemeenschap omvat, wat haar baten betreft, alle goederen die reeds vóór de aanvang van de gemeenschap aan de echtgenoten gezamenlijk toebehoorden, en alle overige goederen van de echtgenoten, door ieder van hen afzonderlijk of door hen tezamen vanaf de aanvang van de gemeenschap tot haar ontbinding verkregen, met uitzondering van:
a. krachtens erfopvolging bij versterf, making, lastbevoordeling of gift verkregen goederen;
b. pensioenrechten waarop de Wet verevening pensioenrechten bij scheiding van toepassing is, alsmede met die pensioenrechten verband houdende rechten op nabestaandenpensioen;
c. rechten op het vestigen van vruchtgebruik als bedoeld in de artikelen 29 en 30 van Boek 4, vruchtgebruik dat op grond van die bepalingen is gevestigd, alsmede hetgeen wordt verkregen ingevolge de artikelen 34, 35, 36, 38, 63 tot en met 92 en 126, eerste lid en tweede lid, onderdelen a en c, van Boek 4.

LID 3: Het tweede lid, aanhef en onderdeel a, is niet van toepassing op:
a. giften van tot de gemeenschap behorende goederen aan de andere echtgenoot;
b. goederen, alsmede de vruchten van die goederen, ten aanzien waarvan bij uiterste wilsbeschikking of bij de gift is bepaald dat zij in de gemeenschap vallen (insluitingsclausule).

LID 4: Goederen, alsmede de vruchten van die goederen, ten aanzien waarvan bij uiterste wilsbeschikking of bij de gift is bepaald dat zij buiten de gemeenschap vallen (uitsluitingsclausule), blijven buiten de gemeenschap, ook al zijn echtgenoten bij huwelijkse voorwaarden overeengekomen dat krachtens erfopvolging bij versterf, making, lastbevoordeling of gift verkregen goederen dan wel de vruchten daarvan in de gemeenschap vallen.

LID 5: Goederen en schulden die aan een van de echtgenoten op enigerlei bijzondere wijze verknocht zijn, vallen slechts in de gemeenschap voor zover die verknochtheid zich hiertegen niet verzet.

LID 6: Vruchten van goederen die niet in de gemeenschap vallen, vallen evenmin in de gemeenschap. Buiten de gemeenschap valt hetgeen wordt geïnd op een vordering die buiten de gemeenschap valt, alsmede een vordering tot vergoeding die in de plaats van een eigen goed van een echtgenoot treedt, waaronder begrepen een vordering ter zake van waardevermindering van zulk een goed.

LID 7: De gemeenschap omvat, wat haar lasten betreft, alle vóór het bestaan van de gemeenschap ontstane gemeenschappelijke schulden, alle schulden betreffende goederen die reeds vóór de aanvang van de gemeenschap aan de echtgenoten gezamenlijk toebehoorden, en alle tijdens het bestaan van de gemeenschap ontstane schulden van ieder van de echtgenoten, met uitzondering van schulden:
a. betreffende van de gemeenschap uitgezonderde goederen;
b. die behoren tot een nalatenschap waartoe een echtgenoot is gerechtigd;
c. uit door een van de echtgenoten gedane giften, gemaakte bedingen en aangegane omzettingen als bedoeld in artikel 126, eerste lid en tweede lid, onderdelen a en c, van Boek 4.

LID 8: Bestaat tussen echtgenoten een geschil aan wie van hen beiden een goed toebehoort en kan geen van beiden zijn recht op dit goed bewijzen, dan wordt dit goed als gemeenschapsgoed aangemerkt. Het vermoeden werkt niet ten nadele van de schuldeisers van de echtgenoten.

TOELICHTING: Geldt voor huwelijken gesloten op of na 1-1-2018. Privégoederen van vóór het huwelijk vallen NIET automatisch in de gemeenschap. Erfenissen en giften zijn altijd uitgezonderd (lid 2 sub a), tenzij partijen een insluitingsclausule zijn overeengekomen (lid 3b).',
  ARRAY['gemeenschap_van_goederen', 'vermogensrecht', 'huwelijkse_voorwaarden', 'erfenis', 'gift']
);

-- ================================================================
-- CHUNK 5 — Art. 1:94 BW OUD — Algehele gemeenschap (tot 31-12-2017)
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 5,
  'Art. 1:94 BW — algehele gemeenschap van goederen (OUD RECHT, geldig tot 31-12-2017)',
  'LID 1: Van het ogenblik der voltrekking van het huwelijk bestaat tussen de echtgenoten van rechtswege een gemeenschap van goederen.

LID 2: De gemeenschap omvat, wat haar baten betreft, alle goederen der echtgenoten, bij aanvang van de gemeenschap aanwezig of nadien, zolang de gemeenschap niet is ontbonden, verkregen, met uitzondering van:
a. goederen ten aanzien waarvan bij uiterste wilsbeschikking van de erflater of bij de gift is bepaald dat zij buiten de gemeenschap vallen (uitsluitingsclausule);
b. pensioenrechten waarop de Wet verevening pensioenrechten bij scheiding van toepassing is alsmede met die pensioenrechten verband houdende rechten op nabestaandenpensioen;
c. rechten op het vestigen van vruchtgebruik als bedoeld in de artikelen 29 en 30 van Boek 4, vruchtgebruik dat op grond van die bepalingen is gevestigd, alsmede hetgeen wordt verkregen ingevolge artikel 34 van Boek 4.

LID 3: Goederen en schulden die aan een der echtgenoten op enigerlei bijzondere wijze verknocht zijn, vallen slechts in de gemeenschap voor zover die verknochtheid zich hiertegen niet verzet.

LID 4: Vruchten van goederen die niet in de gemeenschap vallen, vallen evenmin in de gemeenschap. Buiten de gemeenschap valt hetgeen wordt geïnd op een vordering die buiten de gemeenschap valt, alsmede een vordering tot vergoeding die in de plaats van een eigen goed van een echtgenoot treedt, waaronder begrepen een vordering ter zake van waardevermindering van zulk een goed.

LID 5: De gemeenschap omvat, wat haar lasten betreft, alle schulden van ieder der echtgenoten, met uitzondering van schulden:
a. betreffende van de gemeenschap uitgezonderde goederen;
b. uit door een der echtgenoten gedane giften, gemaakte bedingen en aangegane omzettingen als bedoeld in artikel 126, eerste lid, en tweede lid, onder a en c, van Boek 4.

LID 6: Bestaat tussen echtgenoten een geschil aan wie van hen beiden een goed toebehoort en kan geen van beiden zijn recht op dit goed bewijzen, dan wordt dat goed als gemeenschapsgoed aangemerkt. Het vermoeden werkt niet ten nadele van de schuldeisers der echtgenoten.

TOELICHTING: OUD RECHT voor huwelijken gesloten vóór 1-1-2018. Alle goederen en schulden van beide echtgenoten vallen in de gemeenschap, ook privégoederen van vóór het huwelijk. Erfenissen en giften zijn alleen uitgezonderd als er een uitsluitingsclausule is opgenomen — zonder clausule vallen ze in de gemeenschap.',
  ARRAY['gemeenschap_van_goederen', 'vermogensrecht', 'huwelijkse_voorwaarden', 'erfenis', 'gift', 'algehele_gemeenschap']
);

-- ================================================================
-- CHUNK 6 — Art. 1:157 BW — Partneralimentatie (incl. wijziging 2020)
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 6,
  'Art. 1:157 BW — partneralimentatie bij echtscheiding (volledig, incl. Wet herziening 2020)',
  'LID 1: De rechter kan bij de echtscheidingsbeschikking of bij latere uitspraak aan de echtgenoot die niet voldoende inkomsten tot zijn levensonderhoud heeft, noch zich in redelijkheid kan verwerven, op diens verzoek ten laste van de andere echtgenoot een uitkering tot levensonderhoud toekennen.

LID 2: Bij de vaststelling van de uitkering kan de rechter rekening houden met de behoefte aan een voorziening in het levensonderhoud voor het geval van overlijden van degene die tot de uitkering is gehouden.

LID 3: De rechter kan op verzoek van één van de echtgenoten de uitkering toekennen onder vaststelling van voorwaarden en van een termijn. Deze vaststelling kan niet ten gevolge hebben dat de uitkering later eindigt dan twaalf jaren na de datum van inschrijving van de beschikking in de registers van de burgerlijke stand.

LID 4: Indien de rechter geen termijn heeft vastgesteld, eindigt de verplichting tot levensonderhoud van rechtswege na het verstrijken van een termijn van twaalf jaren, die aanvangt op de datum van inschrijving van de beschikking in de registers van de burgerlijke stand.

LID 5: Indien de beëindiging van de uitkering ten gevolge van het verstrijken van de in het vierde lid bedoelde termijn van zo ingrijpende aard is dat ongewijzigde handhaving van die termijn naar maatstaven van redelijkheid en billijkheid van degene die tot de uitkering gerechtigd is niet kan worden gevergd, kan de rechter op diens verzoek alsnog een termijn vaststellen. Het verzoek daartoe dient te worden ingediend voordat drie maanden sinds de beëindiging zijn verstreken.

LID 6: Indien de duur van het huwelijk niet meer bedraagt dan vijf jaren en uit dit huwelijk geen kinderen zijn geboren, eindigt de verplichting tot levensonderhoud van rechtswege na het verstrijken van een termijn die gelijk is aan de duur van het huwelijk en die aanvangt op de datum van inschrijving van de beschikking in de registers van de burgerlijke stand.

TOELICHTING: Partneralimentatie is NIET dwingend recht — echtgenoten kunnen contractueel afzien van partneralimentatie (contrast met art. 1:400 lid 2 BW voor kinderalimentatie). Maximale duur 12 jaar (lid 4). Bij huwelijk korter dan 5 jaar zonder kinderen geldt de kortere termijn van lid 6 (Wet herziening partneralimentatie 2020). Lid 6 geldt NIET als er kinderen zijn geboren, ook niet als die al meerderjarig zijn.',
  ARRAY['partneralimentatie', 'alimentatie', 'levensonderhoud', 'echtscheiding']
);

-- ================================================================
-- CHUNK 7 — Art. 1:400 BW — Kinderalimentatie, dwingend recht
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 7,
  'Art. 1:400 BW — rangorde onderhoudsverplichtingen en dwingend recht (volledig)',
  'LID 1: Indien een persoon verplicht is levensonderhoud te verstrekken aan twee of meer personen, en zijn draagkracht onvoldoende is om dit volledig aan allen te verschaffen, hebben zijn echtgenoot, zijn vroegere echtgenoot, zijn geregistreerde partner, zijn vroegere geregistreerde partner, zijn ouders, zijn kinderen en stiefkinderen voorrang boven zijn behuwdkinderen en zijn schoonouders.

LID 2: Overeenkomsten waarbij van het volgens de wet verschuldigde levensonderhoud wordt afgezien, zijn nietig.

TOELICHTING: Lid 2 is het kernbeginsel: kinderalimentatie is DWINGEND RECHT. Een beding in een convenant dat de kinderalimentatie volledig uitsluit of kwijtscheldt, is nietig. Partijen kunnen de hoogte wél nader afspreken (binnen grenzen van draagkracht en behoefte). Contrast: partneralimentatie (art. 1:157 lid 3 BW) is niet dwingend — afstand is geldig.',
  ARRAY['kinderalimentatie', 'alimentatie', 'kinderen', 'dwingend_recht', 'levensonderhoud']
);

-- ================================================================
-- CHUNK 8 — Art. 1:253a BW — Beslissing rechter bij geschil gezag
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 8,
  'Art. 1:253a BW — beslissing rechter bij geschil gezamenlijk gezag (volledig)',
  'LID 1: In geval van gezamenlijke uitoefening van het gezag kunnen geschillen hieromtrent op verzoek van de ouders of van een van hen aan de rechtbank worden voorgelegd. De rechtbank neemt een zodanige beslissing als haar in het belang van het kind wenselijk voorkomt.

LID 2: De rechtbank kan eveneens op verzoek van de ouders of een van hen een regeling vaststellen inzake de uitoefening van het ouderlijk gezag. Deze regeling kan omvatten:
a. een toedeling aan ieder der ouders van de zorg- en opvoedingstaken, alsmede met overeenkomstige toepassing van artikel 377a, derde lid, een tijdelijk verbod aan een ouder om met het kind contact te hebben;
b. de beslissing bij welke ouder het kind zijn hoofdverblijfplaats heeft;
c. de wijze waarop informatie omtrent gewichtige aangelegenheden met betrekking tot de persoon en het vermogen van het kind wordt verschaft aan de ouder bij wie het kind niet zijn hoofdverblijfplaats heeft dan wel de wijze waarop deze ouder wordt geraadpleegd;
d. de wijze waarop informatie door derden overeenkomstig artikel 377c, eerste en tweede lid, wordt verschaft.

LID 3: Indien op de ouders de verplichting van artikel 247a rust en zij daaraan niet hebben voldaan, houdt de rechter de beslissing op een in het tweede lid bedoeld verzoek ambtshalve aan.

LID 4: De artikelen 377e en 377g zijn van overeenkomstige toepassing.

LID 5: De rechtbank beproeft alvorens te beslissen op een verzoek als in het eerste of tweede lid bedoeld, een vergelijk tussen de ouders.

LID 6: De rechtbank behandelt het verzoek binnen zes weken.

TOELICHTING: Bij 50/50 co-ouderschap bepaalt lid 2b dat de rechter beslist bij welke ouder het kind zijn hoofdverblijfplaats heeft. Deze keuze heeft overwegend administratief karakter (BRP-inschrijving, kinderbijslag, WKB). Dubbele inschrijving is niet mogelijk; de hoofdverblijfouder is de ouder die kinderbijslag en kindgebonden budget aanvraagt.',
  ARRAY['kinderen', 'hoofdverblijf', 'co_ouderschap', 'ouderschapsplan', 'gezag', 'zorgverdeling']
);

-- ================================================================
-- CHUNK 9 — Art. 815 Rv — Inhoud verzoekschrift / ouderschapsplan
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 9,
  'Art. 815 Rv — inhoud verzoekschrift bij echtscheiding en ouderschapsplan (volledig)',
  'LID 1: Onverminderd het in artikel 278, eerste lid, bepaalde vermeldt het verzoekschrift:
a. de naam, de voornamen en voorzover bekend de woonplaats en de werkelijke verblijfplaats van de echtgenoot die niet de verzoeker is;
b. voorzover bekend de naam van diens raadsman;
c. de naam en de voornamen en voorzover bekend de woonplaats en de werkelijke verblijfplaats van ieder minderjarig kind van de echtgenoten te zamen of van een van hen.

LID 2: Het verzoekschrift bevat een door beide echtgenoten ondertekend ouderschapsplan ten aanzien van:
a. hun gezamenlijke minderjarige kinderen over wie de echtgenoten al dan niet gezamenlijk het gezag uitoefenen;
b. de minderjarige kinderen over wie de echtgenoten ingevolge artikel 253sa of 253t het gezag gezamenlijk uitoefenen.

LID 3: In het ouderschapsplan worden in ieder geval afspraken opgenomen over:
a. de wijze waarop de echtgenoten de zorg- en opvoedingstaken verdelen;
b. de wijze waarop de echtgenoten elkaar informatie verschaffen en raadplegen omtrent gewichtige aangelegenheden;
c. de kosten van de verzorging en opvoeding van de minderjarige kinderen.

LID 4: Het verzoekschrift vermeldt over welke van de gevraagde voorzieningen overeenstemming is bereikt en over welke van de gevraagde voorzieningen een verschil van mening bestaat met de gronden daarvoor. Tevens vermeldt het verzoekschrift op welke wijze de kinderen zijn betrokken bij het opstellen van het ouderschapsplan.

LID 5: Bij de indiening van het verzoekschrift moeten worden overgelegd:
a. een afschrift of uittreksel van de huwelijksakte;
b. bescheiden betreffende de gronden waarop de rechter ingevolge artikel 4 rechtsmacht heeft;
c. een afschrift of uittreksel van de akte van geboorte van ieder minderjarig kind van de echtgenoten te zamen of van een van hen;
d. de processtukken die betrekking hebben op de voorlopige voorzieningen, bedoeld in de artikelen 822 en 823, indien deze zijn gevraagd;
e. indien het een verzoek tot ontbinding van het huwelijk na scheiding van tafel en bed betreft: een authentiek afschrift van de rechterlijke uitspraak waarbij de scheiding van tafel en bed is uitgesproken.

LID 6: Indien het ouderschapsplan, bedoeld in het tweede lid, of de stukken, bedoeld in het vijfde lid, onderdelen a tot en met c, redelijkerwijs niet kunnen worden overgelegd, kan worden volstaan met overlegging van andere stukken of kan op andere wijze daarin worden voorzien, een en ander ter beoordeling van de rechter.

LID 7: Indien ten behoeve van minderjarige kinderen voorzieningen moeten worden getroffen, zendt de griffier onverwijld een afschrift van het verzoekschrift aan de raad voor de kinderbescherming.

TOELICHTING: Ouderschapsplan (lid 2-3) is verplicht bij gezamenlijk gezag. Drie verplichte elementen (lid 3): zorgverdeling, informatie-uitwisseling, kosten. Ontbreekt het plan zonder goede reden, dan kan de rechter het verzoek niet-ontvankelijk verklaren.',
  ARRAY['ouderschapsplan', 'kinderen', 'echtscheiding', 'co_ouderschap', 'gezag', 'zorgverdeling']
);

-- ================================================================
-- CHUNK 10 — Art. 1:247a BW — Ouderschapsplan bij samenwoners
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 10,
  'Art. 1:247a BW — ouderschapsplan bij beëindigen samenleving (volledig)',
  'LID 1 (enig lid): Indien de ouders het gezag gezamenlijk uitoefenen op grond van artikel 251b, eerste lid, of een aantekening als bedoeld in artikel 252, eerste lid, is geplaatst en de ouders hun samenleving beëindigen, stellen zij een ouderschapsplan op als bedoeld in artikel 815, tweede en derde lid, van het Wetboek van Burgerlijke Rechtsvordering.

TOELICHTING: Dit artikel verplicht ook niet-gehuwde ouders met gezamenlijk gezag tot een ouderschapsplan bij beëindiging van hun samenleving. De inhoudsvereisten zijn gelijk aan die van art. 815 lid 3 Rv (zorgverdeling, informatie-uitwisseling, kosten).',
  ARRAY['ouderschapsplan', 'kinderen', 'samenwoners', 'gezag', 'co_ouderschap']
);

-- ================================================================
-- CHUNK 11 — Art. 3:264 BW — Hypotheekbeding / verhuurverbod
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 11,
  'Art. 3:264 BW — hypotheekbeding en verhuur-/gebruiksverbod (kernbepalingen)',
  'LID 1: Indien de hypotheekakte een uitdrukkelijk beding bevat waarbij de hypotheekgever in zijn bevoegdheid is beperkt, hetzij om het bezwaarde goed buiten toestemming van de hypotheekhouder te verhuren of te verpachten, hetzij ten aanzien van de wijze waarop of van de tijd gedurende welke het goed zal kunnen worden verhuurd of verpacht, hetzij ten aanzien van de vooruitbetaling van huur- of pachtpenningen, hetzij om het recht op de huur- of pachtpenningen te vervreemden of te verpanden, kan dit beding niet alleen tegen latere verkrijgers van het bezwaarde goed, maar ook tegen de huurder of pachter en tegen degene aan wie het recht op de huur- of pachtpenningen werd vervreemd of verpand, worden ingeroepen, zulks zowel door de hypotheekhouder, als na de uitwinning van het bezwaarde goed door de koper.
Het beding kan niet worden ingeroepen indien:
a. het in stand houden van de huurovereenkomst kennelijk in het belang is van een voldoende opbrengst bij de openbare verkoop;
b. met het in stand houden van de huurovereenkomst kennelijk een voldoende opbrengst zal worden verkregen om alle hypotheekhouders te voldoen;
c. ten tijde van de bekendmaking geen gebruik wordt gemaakt van het bezwaarde goed krachtens de huurovereenkomst.

LID 2: Indien in strijd met het beding is gehandeld, kan hetgeen in strijd met het beding is geschied, worden vernietigd ten behoeve van degene die het beding kan inroepen.

LID 4: Indien het beding is gemaakt met betrekking tot huur van woonruimte of huur van bedrijfsruimte, heeft het slechts werking, voor zover het niet in strijd is met enig dwingend wettelijk voorschrift omtrent zodanige huur.

TOELICHTING: Vrijwel alle Nederlandse hypotheekaktes bevatten een beding als bedoeld in lid 1. Dit verbiedt verhuur én ingebruikgeving zonder schriftelijke toestemming van de bank. Art. 3:264 staat VOLLEDIG LOS van art. 1:88 BW (toestemming andere echtgenoot) — beide vereisten gelden cumulatief bij een bewoonde, gehypothekeerde woning.',
  ARRAY['hypotheek', 'eigen_woning', 'ingebruikgeving', 'verhuur', 'woning', 'bank']
);

-- ================================================================
-- CHUNK 12 — Art. 6:212 BW — Ongerechtvaardigde verrijking
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000012', 12,
  'Art. 6:212 BW — ongerechtvaardigde verrijking (volledig)',
  'LID 1: Hij die ongerechtvaardigd is verrijkt ten koste van een ander, is verplicht, voor zover dit redelijk is, diens schade te vergoeden tot het bedrag van zijn verrijking.

LID 2: Voor zover de verrijking is verminderd als gevolg van een omstandigheid die niet aan de verrijkte kan worden toegerekend, blijft zij buiten beschouwing.

LID 3: Is de verrijking verminderd in de periode waarin de verrijkte redelijkerwijze met een verplichting tot vergoeding van de schade geen rekening behoefde te houden, dan wordt hem dit niet toegerekend. Bij de vaststelling van deze vermindering wordt mede rekening gehouden met uitgaven die zonder de verrijking zouden zijn uitgebleven.

TOELICHTING: Voor samenwoners geldt géén beleggingsleer (art. 1:87 BW is beperkt tot gehuwden/geregistreerde partners). Bij financiering van elkaars goederen is de grondslag art. 6:212 BW. Kernverschil: de vergoeding is NOMINAAL tenzij anders overeengekomen — er is geen proportioneel meestijgen met waardeontwikkeling van het goed.',
  ARRAY['samenwoners', 'vermogensrecht', 'vergoedingsrecht', 'beleggingsleer', 'eigen_woning', 'ongerechtvaardigde_verrijking']
);
