-- ============================================================
-- Migratie 014 — Jurisprudentie prioriteitsartikelen familierecht
-- Geverifieerde HR-arresten via rechtspraak.nl / cassatieblog.nl
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

-- Stap 1: Bronrecord aanmaken (idempotent via ON CONFLICT)
INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000013',
  'Jurisprudentie familierecht — geverifieerde HR-arresten prioriteitsartikelen',
  'JURISPRUDENTIE-FAMILIERECHT-HR',
  'richtlijn',
  'https://uitspraken.rechtspraak.nl',
  '1975-01-01'
)
ON CONFLICT (id) DO NOTHING;

-- Stap 2: Verwijder eventueel bestaande chunks (idempotent)
DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000013';

-- ================================================================
-- CHUNK 1 — Art. 1:88 BW — jurisprudentie toestemming woning
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 1,
  'Art. 1:88 BW — jurisprudentie toestemmingsvereiste echtelijke woning',
  'JURISPRUDENTIE ART. 1:88 BW — TOESTEMMINGSVEREISTE ECHTELIJKE WONING

--- ECLI:NL:HR:1975:AC5652 (HR 28 november 1975, NJ 1976/466) "Maastrichtse woning I" ---
Kern: Toestemmingsvereiste van art. 1:88 lid 1 sub a BW blijft gelden zelfs als een echtgenoot de woning feitelijk heeft verlaten, zolang de andere echtgenoot er nog woont. Niet alleen feitelijke maar ook juridische bewoning is beslissend. Louter niet-fysiek aanwezig zijn is onvoldoende om buiten het bereik van het toestemmingsvereiste te vallen — ook een rechterlijk bevel tot verlaten van de woning doet hier niet aan af.
Relevantie: Kernregel bij echtscheidingsdossiers: vertrek van één echtgenoot in het kader van de scheiding beëindigt de bescherming van art. 1:88 BW niet zolang de andere echtgenoot nog in de woning woont.

--- ECLI:NL:HR:2004:AO6013 (HR 4 juni 2004, NJ 2004/397) "Westerhof/Van den Brandhof" ---
Kern: De reikwijdte van "zaken die bij een zodanige woning behoren" (art. 1:88 lid 1 sub a) wordt bepaald door een objectieve maatstaf: het functionele verband met de woning, te beoordelen aan de hand van ligging, bestemming en gebruik. Dit zijn objectieve criteria die rechtszekerheid voor derden moeten waarborgen.
Relevantie: Relevant als in een convenant naast de woning ook grond of bijgebouwen worden verdeeld — die kunnen ook onder het toestemmingsvereiste vallen.

--- ECLI:NL:HR:2023:1290 (HR 22 september 2023) ---
Kern: De conflictregel die bepaalt of het Nederlandse toestemmingsvereiste van art. 1:88 BW van toepassing is bij internationale huwelijken: art. 10:40 (oud) BW blijft van toepassing op echtparen die vóór 29 januari 2019 zijn getrouwd, ook na de inwerkingtreding van de EU-Verordening Huwelijksvermogensstelsels.
Relevantie: Bij gemengde of internationale huwelijken in echtscheidingsdossiers: nagaan of het Nederlandse toestemmingsvereiste überhaupt van toepassing is.

--- ECLI:NL:HR:2026:681 (HR 17 april 2026) ---
Kern: Een overeenkomst omvatte zowel de echtelijke woning als bedrijfspanden. De echtgenote vernietigde de overeenkomst op grond van art. 1:89 BW wegens ontbrekende toestemming. De HR bepaalde dat de vernietiging partiële werking had: zij trof alleen het gedeelte dat de echtelijke woning betrof. De bedrijfspanden bleven bindend (partiële nietigheid ex art. 3:41 BW).
Relevantie: Verhindert totale vernietiging van een overeenkomst die naast de woning ook zakelijk onroerend goed betreft, als splitsing praktisch haalbaar is.',
  ARRAY['eigen_woning', 'toestemming', 'woning', 'ingebruikgeving', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 2 — Art. 1:89 BW — jurisprudentie vernietiging
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 2,
  'Art. 1:89 BW — jurisprudentie vernietiging zonder toestemming echtgenoot',
  'JURISPRUDENTIE ART. 1:89 BW — VERNIETIGING

--- ECLI:NL:HR:1978:AC5653 (HR 15 december 1978, NJ 1979/427) "Maastrichtse woning II" ---
Kern: Goede trouw bij art. 1:89 BW ontbreekt als de wederpartij zich baseert op een rechtsopvatting die niet door vaste rechtspraak of literatuur wordt aanvaard. Het enkele "niet-weten" van de toestemmingseis of een onjuiste wetsinterpretatie geeft geen bescherming.
Relevantie: Koper of wederpartij kan zich niet op goede trouw beroepen als de rechtsopvatting waarop hij steunde aantoonbaar onjuist was; begrenst het goed-trouw-verweer bij vernietiging van woningtransacties.

--- ECLI:NL:HR:2019:506 (HR 5 april 2019, zaaknr. 18/01146) ---
Kern: Na een geslaagde vernietiging ex art. 1:89 BW (effectenleaseovereenkomst) rijst de vraag of de wederpartij te kwader trouw was bij het incasseren van termijnbetalingen, zodat onmiddellijk rente verschuldigd zou zijn (art. 6:205 BW). De HR formuleert een scherpe norm: kwade trouw vereist subjectieve wetenschap dat de betaling onverschuldigd was op het moment van ontvangst. Het ontbreken van goede trouw, twijfel of nalatigheid volstaan niet.
Relevantie: Begrenst de rechtsgevolgen van een geslaagde vernietiging voor de periode vóór het beroep op vernietigbaarheid.',
  ARRAY['eigen_woning', 'toestemming', 'vernietiging', 'woning', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 3 — Art. 1:87 BW — jurisprudentie beleggingsleer
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 3,
  'Art. 1:87 BW — jurisprudentie beleggingsleer en vergoedingsrecht echtgenoten',
  'JURISPRUDENTIE ART. 1:87 BW — BELEGGINGSLEER / VERGOEDINGSRECHT

--- ECLI:NL:HR:2025:436 (HR 21 maart 2025, zaaknr. 24/02046) ---
Kern: Een vergoedingsschuld op grond van art. 1:87 BW is geen gemeenschapsschuld in de zin van art. 1:94 lid 7 BW. De vergoedingsvordering van de bijdragende echtgenoot valt buiten de gemeenschap en blijft volledig intact — hij wordt niet gehalveerd door de gemeenschap.
Relevantie: Cruciaal bij convenanten waarbij één echtgenoot de woning volledig of grotendeels heeft gefinancierd uit privévermogen; de vergoedingsvordering moet integraal als bate worden meegenomen.

--- ECLI:NL:HR:2023:1571 (HR 17 november 2023, zaaknr. 22/00474) ---
Kern: De HR bevestigt expliciet dat de beleggingsleer van art. 1:87 BW geldt voor echtgenoten en geregistreerde partners en dat de nominaliteitsleer voor hen niet meer van toepassing is. De wettelijke regels van het huwelijksvermogensrecht gelden niet analoog voor informele samenwoners.
Relevantie: Bevestiging van de beleggingsleer als exclusief regime voor vergoedingsrechten tussen echtgenoten; bij convenanten relevant om de berekeningsmethode (nominaal vs. proportioneel) vast te stellen.

--- ECLI:NL:HR:2019:707 (HR 10 mei 2019, zaaknr. 18/00773) ---
Kern: Art. 1:87 BW en de beleggingsleer zijn niet naar analogie van toepassing op ongehuwde samenwoners. Vergoedingsrechten van samenwoners kunnen uitsluitend worden gebaseerd op een samenlevingsovereenkomst of op het algemene verbintenissenrecht (art. 6:212 BW: ongerechtvaardigde verrijking, of afspraak).
Relevantie: Scheidingslijn samenwoners vs. gehuwden: bij samenwoners geldt de nominaliteitsleer als standaard tenzij anders overeengekomen.',
  ARRAY['vermogensrecht', 'beleggingsleer', 'vergoedingsrecht', 'eigen_woning', 'samenwoners', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 4 — Art. 1:94 BW — jurisprudentie verknochtheid
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 4,
  'Art. 1:94 BW — jurisprudentie verknochtheid van goederen en schulden',
  'JURISPRUDENTIE ART. 1:94 BW — VERKNOCHTHEID

Maatstaf (vaste lijn): of een goed of schuld verknocht is, hangt af van de omstandigheden van het geval, met name de aard van het goed/de schuld naar maatschappelijke opvattingen. De rechter beoordeelt of het goed/de schuld naar zijn aard uitsluitend aan één echtgenoot is toe te rekenen.

--- ECLI:NL:HR:2016:1293 (HR 24 juni 2016, zaaknr. 15/04250) ---
Kern: Ontslagvergoeding gestort als premie in een stamrechtverzekering. Uitkeringen die betrekking hebben op de periode na ontbinding van de huwelijksgemeenschap zijn verknocht; uitkeringen voor de periode vóór ontbinding vallen wél in de gemeenschap. Methode: tijdsevenredige splitsing (voor/na ontbinding).
Relevantie: Standaardarrest voor ontslagvergoedingen, stamrechten en periodieke aanspraken bij echtscheiding; de tijdsevenredige splitsing is de vaste methode.

--- ECLI:NL:HR:2018:270 (HR 23 februari 2018, zaaknr. 16/06046) ---
Kern: Ook een reeds uitgekeerd smartengeld kan verknocht zijn als het op het moment van verdeling nog identificeerbaar (traceerbaar) is. Verknochtheid van letselschadevergoeding wordt bepaald door de aard van de vordering naar maatschappelijke opvattingen; de rechter beoordeelt op welke schadeposten de vergoeding betrekking heeft.
Relevantie: Bij convenanten waarbij letselschadevergoedingen of smartengeld zijn ontvangen tijdens het huwelijk; de echtgenoot die stelt dat het bedrag verknocht is, moet onderbouwen op welke schade de uitkering zag.

--- ECLI:NL:HR:2012:BV1749 (HR 30 maart 2012) ---
Kern: Een bankkrediet op naam van één echtgenoot is niet zonder meer een verknochte schuld. Verknochtheid van schulden hangt af van de omstandigheden, met name de aard van de schuld naar maatschappelijke opvattingen. De benadering is restrictief.
Relevantie: Basisarrest voor verknochtheid van schulden als spiegelbeeld van verknochte goederen; bevestigt de restrictieve benadering en is bruikbaar bij de beoordeling van privéschulden in convenanten.',
  ARRAY['gemeenschap_van_goederen', 'vermogensrecht', 'huwelijkse_voorwaarden', 'verknochtheid', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 5 — Art. 1:157 BW — jurisprudentie partneralimentatie
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 5,
  'Art. 1:157 BW — jurisprudentie partneralimentatie: limitering, nihilstelling, grievend gedrag',
  'JURISPRUDENTIE ART. 1:157 BW — PARTNERALIMENTATIE

--- ECLI:NL:HR:2018:695 (HR 4 mei 2018, zaaknr. 17/02828) ---
Kern: Voor beslissingen die de alimentatieverplichting vóór het verstrijken van de 12-jaarstermijn definitief beëindigen of praktisch uitsluiten, gelden zware motiveringseisen. Afnemende lotsverbondenheid is op zichzelf geen grond voor beëindiging, ook niet in combinatie met andere omstandigheden.
Relevantie: Een convenantsclausule die alimentatie beëindigt vóór de wettelijke termijn is kwetsbaar als die niet met zwaarwegende feiten onderbouwd is; de rechter toetst dit.

--- ECLI:NL:HR:2013:BY3236 (HR 15 februari 2013) ---
Kern: Onderscheid tijdelijke nihilstelling (alimentatie op nul maar vatbaar voor wijziging) versus definitieve beëindiging. Voor tijdelijke nihilstelling gelden lichtere motiveringseisen, omdat een tijdelijke nihilstelling wettelijk gewijzigd kan worden als omstandigheden veranderen.
Relevantie: Als partijen alimentatie op nul afspreken "totdat" een bepaalde situatie intreedt, is dat een tijdelijke nihilstelling — de rechter toetst dit minder streng, maar het blijft wijzigbaar.

--- ECLI:NL:HR:2023:307 (HR 24 februari 2023) ---
Kern: Serieus grievend gedrag van de alimentatiegerechtigde kan in uitzonderlijke gevallen meebrengen dat het naar maatstaven van redelijkheid en billijkheid onaanvaardbaar is dat de verplichting volledig in stand blijft. Maatstaf is hoog: alleen bij serieus grievend gedrag.
Relevantie: Convenantsafspraken over gedragsclausules of "grievend gedrag"-bedingen lopen aan tegen deze hoge lat; niet elk vervelend gedrag volstaat.',
  ARRAY['partneralimentatie', 'alimentatie', 'levensonderhoud', 'echtscheiding', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 6 — Art. 1:253a BW — jurisprudentie hoofdverblijf co-ouderschap
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 6,
  'Art. 1:253a BW — jurisprudentie hoofdverblijfplaats en co-ouderschap',
  'JURISPRUDENTIE ART. 1:253a BW — CO-OUDERSCHAP EN HOOFDVERBLIJFPLAATS

--- ECLI:NL:HR:2010:BL7407 (HR 21 mei 2010, zaaknr. 09/03564) "Gelijkwaardig ouderschap I" ---
Kern: Eerste HR-arrest na inwerkingtreding Wet bevordering voortgezet ouderschap (1 maart 2009). De wet stelt gelijkwaardige verdeling als uitgangspunt, maar verplicht de rechter niet tot een 50/50-uitkomst. Het belang van het kind weegt zwaarder dan het belang van elke ouder afzonderlijk bij een gelijke verdeling. Slechte communicatie tussen ouders en reisafstand kunnen reden zijn om van gelijke verdeling af te wijken.
Relevantie: Een convenant dat co-ouderschap regelt zonder expliciet een hoofdverblijfplaats te noemen, is vatbaar voor problemen bij BRP-inschrijving en kinderalimentatieberekening (Trema-normen). De rechter kijkt altijd naar het belang van het kind.

--- ECLI:NL:HR:2021:1513 (HR 15 oktober 2021, zaaknr. 20/03640, NJ 2021/336) ---
Kern: Dit arrest gaat over de bevoegdheid van de rechter om op grond van art. 1:253a BW een verhuisverbod of terugkeerplicht op te leggen — ook bij eenhoofdig gezag als de gezaghebbende ouder het contact met de andere ouder frustreert. Let op: dit arrest gaat NIET over de keuze van hoofdverblijfplaats bij een 50/50-zorgverdeling.
Relevantie: Relevant als een ouder dreigt te verhuizen of het contact frustreert; niet de primaire bron voor de keuze van het administratieve hoofdverblijf bij co-ouderschap.',
  ARRAY['kinderen', 'hoofdverblijf', 'co_ouderschap', 'ouderschapsplan', 'gezag', 'zorgverdeling', 'jurisprudentie']
);

-- ================================================================
-- CHUNK 7 — Art. 1:400 BW — jurisprudentie kinderalimentatie
-- ================================================================

INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000013', 7,
  'Art. 1:400 BW — jurisprudentie kinderalimentatie dwingend recht',
  'JURISPRUDENTIE ART. 1:400 BW — KINDERALIMENTATIE DWINGEND RECHT

--- ECLI:NL:HR:2019:1689 (HR 1 november 2019, prejudiciële vragen) ---
Kern: Een niet-wijzigingsbeding dat inhoudt dat stijgende draagkracht of stijgende behoefte van het kind niet tot hogere kinderalimentatie kan leiden, is nietig (strijd met art. 1:400 lid 2 BW). Een beding dat lagere draagkracht of lagere behoefte blokkeert is wél geldig. Contractsvrijheid wijkt voor het dwingende karakter van kinderalimentatie ten behoeve van minderjarigen.
Relevantie: Een convenantsclausule die kinderalimentatie definitief op nul of op een vast bedrag bevriest "ongeacht gewijzigde omstandigheden" is geheel of gedeeltelijk nietig. De rechter mag altijd toetsen aan de Trema-normen.

--- ECLI:NL:HR:2011:BQ0002 (HR 2011, zaaknr. 10/02597) "Voorrangsregel kinderalimentatie" ---
Kern: Art. 1:400 lid 1 BW: kinderalimentatie heeft voorrang boven alle andere onderhoudsverplichtingen. Dit is een absolute voorrangsregel die de rechter ambtshalve moet toepassen bij de afstemming van alimentatieverplichtingen. Een hof dat de voorrangsregel negeert bij de vaststelling van partneralimentatie handelt in strijd met het recht.
Relevantie: Als het convenant kinderalimentatie op nul stelt en partneralimentatie hoog, moet de rechter dit corrigeren op grond van art. 1:400 lid 1. De nietigheidsgrond van lid 2 (afstand van alimentatie) geldt bovendien voor iedere overeenkomst waarbij op kinderalimentatie afstand wordt gedaan.',
  ARRAY['kinderalimentatie', 'alimentatie', 'kinderen', 'dwingend_recht', 'levensonderhoud', 'jurisprudentie', 'co_ouderschap']
);
