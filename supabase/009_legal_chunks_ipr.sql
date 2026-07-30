-- ============================================================
-- Migratie 009 — Legal chunks: IPR huwelijksvermogensrecht
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

-- Stap 1: Bronrecord aanmaken (idempotent via ON CONFLICT)
INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000008',
  'IPR Huwelijksvermogensrecht — Beslisboom tijdvakken & verwijzingssystemen',
  'BWBR0030068',
  'richtlijn',
  'https://wetten.overheid.nl/BWBR0030068',
  '2012-01-01'
)
ON CONFLICT (id) DO NOTHING;

-- Stap 2: Verwijder eventueel bestaande IPR-chunks om opnieuw in te voegen
DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000008';

-- Chunk 1: Stap 0-2 — internationaal element detectie, huwelijkserkenning, rechtskeuze
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000008', 1,
  'IPR-HVR §0-2 — Internationaal element, huwelijkserkenning & rechtskeuze',
  'BESLISBOOM IPR-HUWELIJKSVERMOGENSRECHT — Stap 0 t/m 2

Stap 0 — Is er een internationaal element?
Stel bij elke intake vier vragen:
1. Hebben (of hadden) partijen een andere of dubbele nationaliteit?
2. Is het huwelijk in het buitenland gesloten?
3. Hebben partijen direct na het huwelijk of daarna in het buitenland gewoond?
4. Is er vermogen in het buitenland (woning, bankrekening, pensioen, onderneming)?

Alle vier nee → zuiver Nederlands dossier; let alleen op huwelijksdatum (vóór/vanaf 1-1-2018).
Eén of meer ja → doorloop de stappen hieronder.

Belangrijk misverstand: het land waar de bruiloft plaatsvond bepaalt NIET welk vermogensrecht geldt. Het trouwland is alleen relevant voor de erkenning van het huwelijk.

Stap 1 — Huwelijkserkenning in Nederland
Een huwelijk rechtsgeldig gesloten naar het recht van het voltrekkingsland wordt in beginsel erkend (art. 10:31 BW). Uitzondering: strijd met de openbare orde (art. 10:32 BW), bijv. kindhuwelijk of polygamie.

Stap 2 — Rechtskeuze of huwelijkse voorwaarden?
In ALLE tijdvakken staat rechtskeuze bovenaan de cascade. Vraag altijd:
- Zijn er huwelijkse voorwaarden of een prenuptial agreement — ook naar buitenlands recht?
- Is daarin expliciet of impliciet een recht aangewezen?
- Is er tijdens het huwelijk een rechtskeuze gemaakt (kan bij notariële akte)?

Geldige rechtskeuze → dat recht geldt. Geen rechtskeuze → bepaal objectief via stap 3+4.

Vormvereisten rechtskeuze onder EU-Verordening 2016/1103 (huwelijken vanaf 29-1-2019):
schriftelijk, gedagtekend en ondertekend; keuze alleen voor recht van gewone verblijfplaats of nationaliteit van één van partijen.',
  ARRAY['ipr','huwelijksvermogensrecht','internationaal','rechtskeuze','huwelijkserkenning','art-10:31-bw','art-10:32-bw']
);

-- Chunk 2: Stap 3 + 4a + 4b — verwijzingssysteem vóór 1992
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000008', 2,
  'IPR-HVR §3-4b — Verwijzingssysteem per tijdvak (vóór 1992)',
  'BESLISBOOM IPR — Stap 3: welk verwijzingssysteem geldt?

Huwelijksdatum                | Verwijzingssysteem
Vóór 23 aug 1977              | Haags Huwelijksgevolgenverdrag 1905 (indien beiden onderdaan verdragsstaat), anders Chelouche/Van Leer
23 aug 1977 t/m 31 aug 1992   | Chelouche/Van Leer (HR 10 december 1976)
1 sep 1992 t/m 28 jan 2019    | Haags Huwelijksvermogensverdrag 1978
Vanaf 29 jan 2019             | EU-Huwelijksvermogensrechtverordening 2016/1103

Stap 4a — Verdrag 1905 (vóór 23-8-1977, beiden onderdaan verdragsstaat)
→ Nationaal recht van de man ten tijde van de huwelijkssluiting. Onwandelbaar.

Stap 4b — Chelouche/Van Leer (vóór 1-9-1992, buiten verdrag 1905)
Cascade:
1. Rechtskeuze (ook stilzwijgend)
2. Gemeenschappelijke nationaliteit bij huwelijkssluiting
3. Eerste huwelijksdomicilie (waar partijen zich na het huwelijk vestigden)
4. Recht van de nauwste band

Onwandelbaar: eenmaal aangewezen recht blijft gelden, ook na verhuizing.',
  ARRAY['ipr','huwelijksvermogensrecht','chelouche-van-leer','verdrag1905','tijdvak','internationaal']
);

-- Chunk 3: Stap 4c — Haags Verdrag 1978 + wagonstelsel (1992-2019)
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000008', 3,
  'IPR-HVR §4c — Haags Verdrag 1978 & wagonstelsel art. 7 lid 2–3 (huwelijken 1992–2019)',
  'BESLISBOOM IPR — Stap 4c: Haags Huwelijksvermogensverdrag 1978 (huwelijken 1-9-1992 t/m 28-1-2019)

Cascade:
1. Rechtskeuze
2. Eerste gewone verblijfplaats direct na het huwelijk — tenzij de nationaliteitsuitzondering (art. 4 lid 2) de gemeenschappelijke nationaliteit laat voorgaan
3. Geen van beide → recht van de nauwste verbondenheid

WAGONSTELSEL — ART. 7 LID 2 (automatische regimewisseling):
Het toepasselijke recht wijzigt AUTOMATISCH zodra:
- partijen zich vestigen in het land van hun gemeenschappelijke nationaliteit, OF
- partijen 10 jaar na vestiging in een ander land daar nog wonen, OF
- partijen die eerst geen gemeenschappelijke gewone verblijfplaats hadden, die alsnog krijgen.

WAGONSTELSEL — ART. 7 LID 3 (effect van de wisseling — KERN):
De wisseling werkt UITSLUITEND voor de toekomst (ex nunc):
- Goederen verkregen VÓÓR de wisseling blijven onderworpen aan het OUDE recht (wagon 1, 2, …).
- Goederen verkregen NA de wisseling vallen onder het NIEUWE recht (volgende wagon).
- Uitzondering: echtgenoten kunnen UITDRUKKELIJK overeenkomen dat de wisseling terugwerkende kracht heeft (bijv. om alle vermogen onder één regime te brengen) — dit vereist een notariële akte of schriftelijke overeenkomst.
- Elke regimewisseling creëert een nieuw compartiment. Bij meerdere wisselingen ontstaan meerdere wagons, elk met eigen toepasselijk recht.

DERDENWERKING (art. 7 lid 3 jo. art. 11–12 HHV 1978):
De regimewisseling werkt niet automatisch jegens derden (hypotheekhouders, schuldeisers) die te goeder trouw handelden onder het vorige regime. Inschrijving in het huwelijksgoederenregister biedt bescherming; zonder inschrijving kan een derde zich op het vorige regime beroepen.

PRAKTISCH VOOR CONVENANT — per-wagon werkwijze:
1. Reconstrueer de volledige woonhistorie VANAF de huwelijksdatum.
2. Stel per art. 7 lid 2-trigger de exacte wisselingsdatum vast.
3. Deel alle vermogensbestanddelen in per wagon op basis van de verwervingsdatum.
4. Wikkel elke wagon af onder het recht dat in díe periode gold.
5. Controleer of partijen retroactieve toepassing zijn overeengekomen (notariële akte).

Convenant-signalen:
- Buitenlandse woonhistorie aanwezig, maar convenant stelt geen wagonverdeling vast → volledigheid-issue (hoog).
- Convenant behandelt alle goederen onder één regime terwijl wagonstelsel aantoonbaar van toepassing was → juistheid-issue (hoog).
- Mogelijke retroactieve terugwerkende kracht niet vastgelegd in akte → volledigheid-issue (middel).',
  ARRAY['ipr','huwelijksvermogensrecht','wagonstelsel','verdrag1978','art7lid2','art7lid3','tijdvak','woonhistorie','derdenwerking','retroactiviteit','internationaal']
);

-- Chunk 4: Stap 4d — EU-Verordening 2016/1103 (vanaf 2019)
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000008', 4,
  'IPR-HVR §4d — EU-Verordening 2016/1103 (huwelijken vanaf 29-1-2019)',
  'BESLISBOOM IPR — Stap 4d: EU-Huwelijksvermogensrechtverordening 2016/1103 (huwelijken vanaf 29-1-2019)

Cascade:
1. Rechtskeuze (schriftelijk, gedagtekend, ondertekend)
2. Eerste gemeenschappelijke gewone verblijfplaats na de huwelijkssluiting
3. Gemeenschappelijke nationaliteit bij huwelijkssluiting (vervalt als meer dan één gemeenschappelijke nationaliteit)
4. Nauwste band ten tijde van de huwelijkssluiting

Kenmerken:
- ONWANDELBAAR: geen automatische wijziging. Verhuizen verandert niets; alleen een latere rechtskeuze van partijen zelf kan het regime wijzigen. Geen wagonstelsel.
- UNIVERSELE TOEPASSING: wijst zo nodig ook recht van een niet-EU-land aan.
- Vergelijking: het wagonstelsel van het Haags Verdrag 1978 geldt NIET onder de EU-Verordening.',
  ARRAY['ipr','huwelijksvermogensrecht','eu-verordening','2016/1103','tijdvak','internationaal','onwandelbaar']
);

-- Chunk 5: Stap 5-6 + checklist + convenant-signalen
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000008', 5,
  'IPR-HVR §5-6 — Gevolgen toepasselijk recht, overige lagen & convenant-checklist',
  'BESLISBOOM IPR — Stap 5: gevolgen aangewezen recht

Nederlands recht aangewezen:
- Huwelijk vóór 1-1-2018 → algehele gemeenschap van goederen
- Huwelijk op of na 1-1-2018 → beperkte gemeenschap (voorhuwelijks vermogen, erfenissen en schenkingen blijven privé)

Buitenlands recht aangewezen:
- Stel de inhoud vast (bijv. Duitse Zugewinngemeinschaft, Belgisch wettelijk stelsel, Engels common law).
- Raadpleeg zo nodig het Internationaal Juridisch Instituut (IJI) of een IPR-notaris.
- Formuleer in het convenant EXPLICIET welk recht van toepassing is en waarom (aanknopingspunten benoemen).

Stap 6 — Overige lagen (elk eigen verwijzingsregel):
- Echtscheiding zelf: art. 10:56 BW → Nederlands recht
- Partner- en kinderalimentatie: Haags Protocol 2007 → recht gewone verblijfplaats onderhoudsgerechtigde (= NL-normen als partijen in NL wonen)
- Pensioenverevening: art. 10:51 BW → volgt huwelijksvermogensregime; WVPS NIET automatisch van toepassing bij buitenlands regime — expliciet regelen in convenant
- Gezag en zorgregeling: Haags Kinderbeschermingsverdrag 1996 → gewone verblijfplaats kind

Intakechecklist internationaal dossier:
- Nationaliteit(en) van beide partijen bij huwelijkssluiting (incl. dubbele nationaliteit)
- Huidige nationaliteit(en)
- Datum en land van huwelijkssluiting
- Huwelijkse voorwaarden / prenup / rechtskeuze — ook buitenlandse aktes opvragen
- Eerste gezamenlijke woonplaats direct na het huwelijk
- Volledige woonhistorie VANAF huwelijksdatum (i.v.m. wagonstelsel 1992–2019)
- Vermogen in het buitenland (onroerend goed, rekeningen, onderneming, pensioen)
- Buitenlandse pensioenaanspraken — WVPS-toepasselijkheid checken
- Bij twijfel: IJI-advies of IPR-notaris inschakelen VOOR opstellen convenant

Convenant-signalen (volledigheidsscreening):
1. Internationaal element aanwezig maar toepasselijk recht niet benoemd → volledigheid (midden)
2. Huwelijk 1992–2019 + buitenlandse woonhistorie + geen wagonstelselvaststelling → volledigheid (midden)
3. Verdeling op NL gemeenschap terwijl buitenlands recht van toepassing → juridisch (hoog)
4. Buitenlands pensioen zonder verevening-afspraak → volledigheid (midden); WVPS niet automatisch van toepassing',
  ARRAY['ipr','huwelijksvermogensrecht','pensioen','wvps','alimentatie','convenant','checklist','internationaal','art-10:51-bw','art-10:56-bw']
);
