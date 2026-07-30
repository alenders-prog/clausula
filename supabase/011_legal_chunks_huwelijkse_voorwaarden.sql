-- ============================================================
-- Migratie 011 — Legal chunks: Huwelijkse voorwaarden (alle stelsels)
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000010',
  'Huwelijkse voorwaarden — alle stelsels: gemeenschap, uitsluiting, verrekening',
  'DOCTRINE-HUWELIJKSEVOORWAARDEN',
  'richtlijn',
  'https://wetten.overheid.nl/BWBR0002656/2018-01-01#Boek1_Titeld1.7',
  '1970-01-01'
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000010';

-- ── Chunk 1: Overzicht stelsels & tijdvakken ──────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 1,
  'HVW §1 — Overzicht stelsels & tijdvakken (art. 1:93–1:100 BW)',
  'HUWELIJKSE VOORWAARDEN — OVERZICHT STELSELS EN TIJDVAKKEN

Wettelijk stelsel zonder huwelijkse voorwaarden:
- Huwelijk VÓÓR 1 januari 2018 → algehele gemeenschap van goederen (art. 1:93 BW oud)
  Alle bezittingen en schulden van beide echtgenoten, ook voorhuwelijks, vallen in de gemeenschap.
- Huwelijk VANAF 1 januari 2018 → beperkte gemeenschap van goederen (art. 1:94 BW nieuw)
  Alleen tijdens het huwelijk verkregen goederen (tenzij erfenis/schenking). Voorhuwelijks
  vermogen, erfenissen en schenkingen (ook zonder uitsluitingsclausule) blijven privé.

Met huwelijkse voorwaarden — vier hoofdvormen:
1. ALGEHELE UITSLUITING (koude uitsluiting) — geen gemeenschap, geen verrekening
2. BEPERKTE GEMEENSCHAP — alleen bepaalde goederen gemeenschappelijk
3. PERIODIEK VERREKENBEDING — jaarlijks overgespaarde inkomsten verrekenen
4. FINAAL VERREKENBEDING — verrekening alleen bij echtscheiding/overlijden

Combinaties zijn mogelijk: bijv. koude uitsluiting + finaal verrekenbeding.

Relevante bepalingen:
- Art. 1:93 BW — algehele gemeenschap (vóór 2018)
- Art. 1:94 BW — beperkte gemeenschap (vanaf 2018)
- Art. 1:96 BW — bestuur gemeenschapsgoederen
- Art. 1:99–100 BW — ontbinding en verdeling gemeenschap
- Art. 1:114–116 BW — huwelijkse voorwaarden: vereisten en wijziging
- Art. 1:132–143 BW — verrekenbedingen

Cruciale vragen bij intake:
1. Is er een notariële akte van huwelijkse voorwaarden? (zo ja: opvragen!)
2. Trouwdatum (bepaalt wettelijk stelsel bij geen voorwaarden)
3. Zijn de voorwaarden tijdens het huwelijk gewijzigd? (kan via rechtbank, art. 1:119 BW)',
  ARRAY['huwelijkse-voorwaarden','gemeenschap','uitsluiting','verrekening','art-1:93-bw','art-1:94-bw','art-1:114-bw','tijdvak','2018']
);

-- ── Chunk 2: Algehele gemeenschap van goederen (pre-2018) ─────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 2,
  'HVW §2 — Algehele gemeenschap van goederen (huwelijken vóór 1-1-2018)',
  'ALGEHELE GEMEENSCHAP VAN GOEDEREN — art. 1:93 BW (oud)

Van toepassing op: huwelijken gesloten vóór 1 januari 2018 zonder huwelijkse voorwaarden.

Wat valt in de gemeenschap:
- Alle goederen die bij aanvang van het huwelijk aanwezig zijn (ook voorhuwelijks vermogen)
- Alle goederen tijdens het huwelijk verkregen
- Alle schulden van beide echtgenoten (ook voorhuwelijkse schulden)
- Erfenissen en schenkingen (ook zonder uitsluitingsclausule)

Wat valt NIET in de gemeenschap (art. 1:94 lid 2 BW oud):
- Goederen verkregen onder uitsluitingsclausule (notariële bepaling in testament of schenkingsakte)
- Lijfrenten en pensioenrechten (tot op zekere hoogte)
- Verknochte goederen (persoonsgebonden, bijv. smartengeld)

Verdeling bij scheiding:
- Gemeenschap wordt bij helfte verdeeld (art. 1:100 BW), tenzij partijen anders overeenkomen
- Schulden: beide echtgenoten zijn hoofdelijk aansprakelijk voor gemeenschapsschulden
- Privéschulden blijven verhaalbaar op privévermogen

Uitsluitingsclausule — belang bij erfenis/schenking:
Als ouder of erflater een uitsluitingsclausule heeft opgenomen ("buiten iedere gemeenschap"),
valt de erfenis/schenking NIET in de algehele gemeenschap — ook niet bij huwelijk vóór 2018.
Zonder uitsluitingsclausule: erfenis valt WEL in de gemeenschap.

Convenant-aandachtspunten:
- Voorhuwelijks vermogen is opgegaan in de gemeenschap — geen vergoedingsrecht tenzij
  uitsluitingsclausule of beleggingsleer van toepassing
- Pensioen: WVPS van toepassing tenzij partijen anders overeenkomen
- Onderneming vóór huwelijk: ook in gemeenschap gevallen, tenzij huwelijkse voorwaarden',
  ARRAY['algehele-gemeenschap','art-1:93-bw','art-1:94-bw','art-1:100-bw','voor-2018','uitsluitingsclausule','erfenis','scheiding','huwelijkse-voorwaarden']
);

-- ── Chunk 3: Beperkte gemeenschap (post-2018) ────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 3,
  'HVW §3 — Beperkte gemeenschap van goederen (huwelijken vanaf 1-1-2018, art. 1:94 BW nieuw)',
  'BEPERKTE GEMEENSCHAP VAN GOEDEREN — art. 1:94 BW (nieuw, vanaf 1-1-2018)

Van toepassing op: huwelijken gesloten op of na 1 januari 2018 zonder huwelijkse voorwaarden.

Wat valt IN de beperkte gemeenschap:
- Alle goederen en schulden verkregen/aangegaan TIJDENS het huwelijk
- Gezamenlijke woning en hypotheek (tenzij één echtgenoot de volledige koopsom privé betaalde)

Wat valt BUITEN de gemeenschap (privé):
- Voorhuwelijks vermogen van elke echtgenoot afzonderlijk
- Erfenissen en schenkingen ontvangen tijdens het huwelijk (ook ZONDER uitsluitingsclausule)
- Goederen verkregen met privémiddelen (mits traceerbaar — bewijslast bij claimende partij)
- Voorhuwelijkse schulden blijven privéschuld

Bijzondere regels:
- Art. 1:94 lid 4 BW: vruchten van privégoederen (bijv. huurinkomsten van privépand) vallen
  WEL in de gemeenschap, tenzij huwelijkse voorwaarden anders bepalen.
- Art. 1:95 BW: verkrijging met gemengde middelen (deels privé, deels gemeenschap) →
  beleggingsleer: proportionele verdeling. Zowel gemeenschap als privé krijgen een aandeel.
- Bewijsvermoeden art. 1:94 lid 1: goed wordt vermoed gemeenschappelijk tenzij één echtgenoot
  bewijst dat het privé is.

Convenant-aandachtspunten:
- Voorhuwelijks spaargeld traceerbaar? Bankafschriften bewaren als bewijs privévermogen
- Erfenis tijdens huwelijk ontvangen → GEEN uitsluitingsclausule nodig (automatisch privé)
- Vruchten van privébezit (bijv. dividenden, huur) → vallen in gemeenschap, mogelijk te verrekenen
- Aankoop woning deels met privégeld → beleggingsleer van toepassing (art. 1:95 BW)',
  ARRAY['beperkte-gemeenschap','art-1:94-bw','art-1:95-bw','vanaf-2018','privévermogen','erfenis','beleggingsleer','huwelijkse-voorwaarden','bewijs']
);

-- ── Chunk 4: Koude uitsluiting ───────────────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 4,
  'HVW §4 — Koude uitsluiting (algehele uitsluiting gemeenschap)',
  'KOUDE UITSLUITING — ALGEHELE UITSLUITING VAN GEMEENSCHAP

Definitie: huwelijkse voorwaarden waarbij elke gemeenschap van goederen is uitgesloten én
geen verrekenclausule is opgenomen. Elk goed blijft eigendom van de echtgenoot die het
heeft verkregen of op wiens naam het staat.

Kenmerken:
- Geen gemeenschappelijk vermogen
- Geen jaarlijkse of finale verrekening van inkomsten of vermogen
- Schulden zijn strikt persoonlijk
- Goederen op beider naam zijn gezamenlijk eigendom (ieder voor de helft, tenzij anders bepaald)

Verdeling bij scheiding:
- Elk behoudt zijn eigen vermogen
- Goederen op beider naam worden verdeeld naar eigendomsverhouding (doorgaans 50/50)
- Geen gemeenschappelijke schuldenafwikkeling

Vergoedingsrechten (beleggingsleer) zijn ook bij koude uitsluiting van toepassing:
- Echtgenoot A betaalt uit privégeld voor goed op naam van B → vergoedingsrecht A op B
- Berekening: proportioneel naar huidige waarde (art. 1:87 BW als transactie na 1-1-2012,
  anders jurisprudentie Huijbers/Jonkers)

Praktische valkuilen:
- "Koude uitsluiting" ≠ altijd volledig gescheiden: goed op beider naam is gezamenlijk
- Hypotheekaflossingen door één echtgenoot uit eigen inkomsten: geen automatisch vergoedingsrecht
  bij koude uitsluiting, tenzij art. 1:87 BW van toepassing (privégeld, niet inkomen)
- Inkomen van beide partijen is en blijft privé — geen verrekeningsverplichting

Redelijkheid en billijkheid (art. 6:2 BW):
In extreme gevallen (bijv. één partij heeft alles opgebouwd, andere heeft niets)
kan de rechter beperkende werking van redelijkheid en billijkheid toepassen.
Dit is uitzonderlijk; mediator moet partijen hier wel op wijzen.

Convenant-aandachtspunten:
- Expliciete lijst van goederen op beider naam met verdeling
- Vergoedingsrechten identificeren en vastleggen
- Onderlinge vorderingen (leningen, betalingen) opnemen',
  ARRAY['koude-uitsluiting','huwelijkse-voorwaarden','vergoedingsrecht','art-1:87-bw','privévermogen','scheiding','beleggingsleer','redelijkheid-billijkheid']
);

-- ── Chunk 5: Periodiek verrekenbeding ────────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 5,
  'HVW §5 — Periodiek verrekenbeding (art. 1:132–141 BW)',
  'PERIODIEK VERREKENBEDING — art. 1:132–141 BW

Definitie: huwelijkse voorwaarden waarbij echtgenoten jaarlijks het overgespaarde inkomen
(wat overblijft na aftrek van kosten levensonderhoud) met elkaar verrekenen.

Hoe werkt het in theorie:
- Beide inkomens worden samengeteld
- Kosten van de huishouding worden afgetrokken
- Het resterende "overgespaarde inkomen" wordt bij helfte gedeeld
- Jaarlijks vóór 1 januari (of andere overeengekomen datum) afrekenen

De praktijk: vrijwel niemand voert dit daadwerkelijk uit.

Gevolgen van niet-naleving (art. 1:136 + 1:141 BW):
Als het periodieke verrekenbeding niet is nageleefd, geldt bij echtscheiding:
- Art. 1:141 lid 3 BW: bewijsvermoeden dat het aanwezige vermogen verrekend moet worden,
  tenzij een echtgenoot bewijst dat het vermogen niet uit te verrekenen inkomsten stamt
  (bijv. erfenis, voorhuwelijks vermogen, schenking met uitsluitingsclausule).
- Beleggingsleer (HR Schwanen/Hundscheid 2006): waardestijging van goederen die zijn
  gefinancierd uit te verrekenen inkomsten wordt alsnog verrekend, proportioneel.

Wat moet worden verrekend bij niet-nageleefd beding:
- Eigen woning (voor zover gefinancierd uit te verrekenen inkomsten/aflossingen)
- Beleggingen en spaartegoeden opgebouwd uit inkomen
- Ondernemingswaarde (voor zover opgebouwd uit inkomen)
- NIET: erfenissen, schenkingen, voorhuwelijks vermogen (mits traceerbaar)

Veelgemaakte fouten in convenant:
- Partijen stellen "we kwijtschelden de verrekening" zonder dit juridisch correct vast te leggen
- Verrekening wordt berekend zonder de beleggingsleer toe te passen op de eigen woning
- Pensioen wordt niet meegenomen in de verrekenberekening

Convenant-aanpak:
1. Bepaal het te verrekenen vermogen (inkomensgerelateerd deel)
2. Stel de waardeontwikkeling vast (beleggingsleer op woning/beleggingen)
3. Bereken de verrekenvordering
4. Leg vast hoe deze wordt voldaan (uitbetaling, verrekening met andere posten)',
  ARRAY['periodiek-verrekenbeding','art-1:132-bw','art-1:136-bw','art-1:141-bw','verrekening','huwelijkse-voorwaarden','beleggingsleer','schwanen-hundscheid','eigen-woning']
);

-- ── Chunk 6: Finaal verrekenbeding ───────────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 6,
  'HVW §6 — Finaal verrekenbeding (art. 1:142 BW)',
  'FINAAL VERREKENBEDING — art. 1:142 BW

Definitie: huwelijkse voorwaarden waarbij verrekening ALLEEN plaatsvindt bij ontbinding
van het huwelijk (echtscheiding of overlijden), niet jaarlijks.

Doel: combineren van gescheiden vermogen tijdens het huwelijk met een rechtvaardige
verdeling bij het einde — zonder de administratieve last van jaarlijkse verrekening.

Twee hoofdvarianten:
1. ALSOF-gemeenschap: bij scheiding wordt verrekend alsof er algehele gemeenschap was
   (vermogensvergelijking: wat zou elk hebben gehad bij gemeenschap?)
2. WINSTVERDELING: alleen de vermogensaanwas tijdens het huwelijk wordt verrekend
   (eindvermogen minus beginvermogen, gecorrigeerd voor erfenissen/schenkingen)

Berekening vermogensaanwas (meest gebruikte variant):
- Beginvermogen = vermogen op huwelijksdatum (of datum huwelijkse voorwaarden)
- Eindvermogen = vermogen op datum ontbinding huwelijk
- Aanwas = eindvermogen − beginvermogen
- Te verrekenen: (aanwas A + aanwas B) / 2 → vordering van degene met lagere aanwas op andere

Uitzonderingen (afhankelijk van de tekst van de akte):
- Erfenissen en schenkingen: vallen doorgaans buiten de verrekening
- Vermogen verkregen vóór de huwelijkse voorwaarden (als ze later zijn gewijzigd)
- Verlies: negatieve aanwas van één partij kan de verrekening beïnvloeden

Aandachtspunten voor mediator:
- Lees de akte nauwkeurig: elke notaris formuleert anders. Zijn erfenissen uitgesloten?
  Is er een hardheidsclausule? Wat is de peildatum?
- Peilmoment: datum indiening echtscheidingsverzoek of andere datum?
- Waardering onderneming/aandelen: vaak geschilpunt — taxateur nodig
- Pensioenaanspraken: vallen ze binnen de finale verrekening? (afhankelijk van akteredactie)

Convenant-aanpak:
1. Bereken beginvermogen van beide partijen (bewijs: bankafschriften, belastingaangiften)
2. Bepaal eindvermogen op peildatum (alle activa minus passiva)
3. Corrigeer voor uitgesloten vermogensbestanddelen
4. Bereken verrekenvordering en leg uitvoering vast',
  ARRAY['finaal-verrekenbeding','art-1:142-bw','verrekening','huwelijkse-voorwaarden','vermogensaanwas','scheiding','onderneming','pensioen','peildatum']
);

-- ── Chunk 7: Beperkte gemeenschap bij HVW ────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 7,
  'HVW §7 — Beperkte gemeenschap bij huwelijkse voorwaarden (maatwerk)',
  'BEPERKTE GEMEENSCHAP BIJ HUWELIJKSE VOORWAARDEN

Naast het wettelijke stelsel (beperkte gemeenschap post-2018) kunnen echtgenoten via
huwelijkse voorwaarden een maatwerk-beperkte gemeenschap afspreken.

Voorbeelden van afgebakende gemeenschappen:
- Alleen de echtelijke woning is gemeenschappelijk, al het overige is privé
- Gemeenschap van inboedel en auto, niet van beleggingen of onderneming
- Gemeenschap van inkomen (geen vermogen)
- Gemeenschap van bepaalde bankrekeningen ("en/of-rekening als gemeenschap")

Verdeling bij scheiding:
- Alleen de aangewezen gemeenschapsgoederen worden gedeeld (doorgaans bij helfte)
- Privégoederen blijven van de eigenaar
- Schulden volgen de aanwijzing in de akte

Complicaties in de praktijk:
- Vermenging: privégeld en gemeenschapsgeld op dezelfde rekening → tracering vereist
- Vruchten: zijn inkomsten uit privégoed privé of gemeenschappelijk? (afhankelijk van akte)
- Aanwas: is waardestijging van privégoed privé? (ja, tenzij akte anders zegt)

Vergoedingsrechten (beleggingsleer):
Ook bij beperkte gemeenschap via huwelijkse voorwaarden geldt art. 1:87 BW als privégeld
wordt aangewend voor een gemeenschapsgoed of omgekeerd.

Convenant-aandachtspunten:
- Bepaal exact welke goederen onder de overeengekomen gemeenschap vallen
- Controleer of er vermenging heeft plaatsgevonden
- Leg vergoedingsrechten vast als privé- en gemeenschapsgeld vermengd zijn',
  ARRAY['beperkte-gemeenschap','huwelijkse-voorwaarden','maatwerk','vermenging','vergoedingsrecht','art-1:87-bw','scheiding']
);

-- ── Chunk 8: Combinatiestelsels en wijziging HVW ─────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000010', 8,
  'HVW §8 — Combinatiestelsels, wijziging HVW & keuzestress bij intake',
  'COMBINATIESTELSELS EN WIJZIGING HUWELIJKSE VOORWAARDEN

Veelvoorkomende combinaties:
- Koude uitsluiting + finaal verrekenbeding (meest voorkomend bij ondernemers)
- Koude uitsluiting + periodiek verrekenbeding (administratief veeleisend, zelden nageleefd)
- Beperkte gemeenschap (alleen woning) + koude uitsluiting voor overige vermogen
- Beperkte gemeenschap + finaal verrekenbeding voor het privévermogen

Wijziging huwelijkse voorwaarden tijdens het huwelijk (art. 1:119 BW):
- Vereist: notariële akte + goedkeuring rechtbank (of na 2012: alleen notariële akte volstaat
  als beide partijen akkoord zijn en geen schuldeisers worden benadeeld)
- Wijziging werkt alleen voor de toekomst, tenzij anders bepaald
- Complicatie: goederen verkregen onder het oude stelsel kunnen onder ander recht vallen
  dan goederen verkregen na wijziging

Praktische keuzehulp bij intake — stel altijd vast:
1. Zijn er huwelijkse voorwaarden? → notariële akte opvragen (niet alleen vragen aan partijen)
2. Zijn de voorwaarden ooit gewijzigd? → alle aktes opvragen
3. Welk stelsel geldt voor welke periode (bij wijziging)?
4. Is het periodiek verrekenbeding ooit uitgevoerd? → verrekeningsstaten opvragen

Aandachtsgebieden per stelsel bij scheiding:
- Algehele gemeenschap (pre-2018): verdelen. Let op uitsluitingsclausules.
- Beperkte gemeenschap (post-2018): scheiden privé van gemeenschap. Let op vruchten.
- Koude uitsluiting: vergoedingsrechten identificeren. Goederen op beider naam verdelen.
- Periodiek verrekenbeding: beleggingsleer toepassen. Bewijsvermoeden art. 1:141 BW.
- Finaal verrekenbeding: beginvermogen en eindvermogen bepalen. Akte nauwkeurig lezen.

Risicogebied: partijen die zeggen "koude uitsluiting" maar akte bevat verrekenbeding →
altijd akte lezen, nooit afgaan op de omschrijving die partijen zelf geven.',
  ARRAY['huwelijkse-voorwaarden','combinatiestelsel','wijziging','art-1:119-bw','koude-uitsluiting','finaal-verrekenbeding','periodiek-verrekenbeding','intake','scheiding']
);
