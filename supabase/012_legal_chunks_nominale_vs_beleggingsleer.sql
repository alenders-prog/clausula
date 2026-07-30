-- ============================================================
-- Migratie 012 — Legal chunks: Nominale leer vs. beleggingsleer
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000011',
  'Nominale leer vs. beleggingsleer — vergoedingsrechten bij scheiding',
  'DOCTRINE-NOMINAAL-VS-BELEGGING',
  'richtlijn',
  'https://wetten.overheid.nl/BWBR0002656/2012-01-01#Boek1_Titeld1.7_Artikel87',
  '2012-01-01'
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000011';

-- ── Chunk 1: Kernonderscheid nominaal vs. beleggingsleer ─────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000011', 1,
  'Nominaal vs. beleggingsleer §1 — Kernonderscheid en toepasselijkheid',
  'NOMINALE LEER VERSUS BELEGGINGSLEER — KERNONDERSCHEID

Het centrale vraagstuk:
Als echtgenoot A privégeld investeert in een goed dat (mede) aan de andere partij of de
gemeenschap toebehoort, heeft A bij scheiding recht op vergoeding. De vraag is: hoeveel?

NOMINALE LEER — het geïnvesteerde bedrag terugkrijgen
De vergoeding = het bedrag dat destijds is geïnvesteerd, zonder correctie voor inflatie
of waardeontwikkeling van het goed.

Voorbeeld: A investeert €50.000 privégeld in een woning. De woning is nu €100.000 meer
waard. Volgens de nominale leer krijgt A precies €50.000 terug — de waardestijging is
voor de ander.

BELEGGINGSLEER — proportioneel meedelen in de waardeontwikkeling
De vergoeding = (investering / waarde goed op moment van investering) × huidige waarde goed.
A deelt mee in zowel waardestijging als waardedaling.

Zelfde voorbeeld met beleggingsleer: woning kostte €200.000, A betaalde €50.000 (25%).
Woning nu €300.000 → vergoeding A = 25% × €300.000 = €75.000.
Bij daling naar €160.000 → vergoeding A = 25% × €160.000 = €40.000 (minder dan ingelegd).

WELKE LEER IS VAN TOEPASSING? — beslisschema:

Stap 1 — Datum van de transactie:
- Transactie NA 1 januari 2012 → art. 1:87 BW → BELEGGINGSLEER (wettelijk verankerd)
- Transactie VÓÓR 1 januari 2012 → jurisprudentie bepaalt

Stap 2 — Voor transacties vóór 2012: aard van de huwelijkse voorwaarden en aard van
de investering bepalen welke leer van toepassing is (zie chunk 2 en 3).

Stap 3 — Hebben partijen in de huwelijkse voorwaarden een andere regeling getroffen?
Art. 1:87 lid 3 BW: partijen kunnen bij huwelijkse voorwaarden afwijken van de
beleggingsleer en nominale vergoeding overeenkomen. Lees de akte altijd na.',
  ARRAY['nominale-leer','beleggingsleer','vergoedingsrecht','art-1:87-bw','huwelijksvermogensrecht','waardeontwikkeling','scheiding','2012']
);

-- ── Chunk 2: Historische ontwikkeling en jurisprudentie pre-2012 ──────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000011', 2,
  'Nominaal vs. beleggingsleer §2 — Historische ontwikkeling & jurisprudentie vóór 2012',
  'HISTORISCHE ONTWIKKELING — VAN NOMINAAL NAAR BELEGGINGSLEER

Vóór 1987 — nominale leer als uitgangspunt:
De Hoge Raad hanteerde lange tijd de nominale leer: de investerende echtgenoot had
recht op terugbetaling van het geïnvesteerde bedrag, niet meer. Inflatie en
waardestijging kwamen ten goede aan de echtgenoot op wiens naam het goed stond.

HR 12 juni 1987, NJ 1988/150 (Huijbers/Jonkers) — doorbraak:
De HR erkende voor het eerst expliciet de beleggingsleer bij vergoedingsrechten tussen
echtgenoten. Privégeld aangewend voor een gemeenschapsgoed leidt tot een proportionele
vergoedingsvordering die meebeweegt met de waardeontwikkeling van het goed.

HR 21 april 2006, NJ 2007/395 (Vossen/Swinkels) — uitbreiding naar koude uitsluiting:
Bevestiging dat de beleggingsleer ook geldt bij koude uitsluiting: privégeld geïnvesteerd
in goed van de andere echtgenoot → proportionele vordering, geen nominale vergoeding.

HR 10 februari 2012, NJ 2012/282 — vlak vóór codificatie:
Ook verbeteringen (verbouwingen) vallen onder de beleggingsleer, niet alleen de
initiële aankoop. Bevestiging vlak voor inwerkingtreding art. 1:87 BW.

Situaties vóór 2012 waar nominale leer TOCH nog kan gelden:
- Huwelijkse voorwaarden bepalen expliciet nominale vergoeding
- Rechter oordeelt op basis van omstandigheden dat nominale leer redelijker is
- Bewijs van privékarakter van investering ontbreekt → geen vergoedingsrecht

Bewijslast vóór 2012:
Anders dan bij art. 1:87 BW (post-2012) is er geen wettelijk vermoeden. De echtgenoot
die een vergoedingsrecht claimt, moet volledig bewijzen dat:
1. Het geïnvesteerde geld privé was (geen gemeenschapsgeld)
2. Het is aangewend voor het specifieke goed
3. Op welk moment en voor welk bedrag',
  ARRAY['nominale-leer','beleggingsleer','jurisprudentie','huijbers-jonkers','vossen-swinkels','hr-1987','hr-2006','pre-2012','vergoedingsrecht','bewijs']
);

-- ── Chunk 3: Art. 1:87 BW — codificatie beleggingsleer post-2012 ─────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000011', 3,
  'Nominaal vs. beleggingsleer §3 — Art. 1:87 BW: codificatie & berekening',
  'ART. 1:87 BW — CODIFICATIE VAN DE BELEGGINGSLEER (VANAF 1-1-2012)

Wettekst (kern):
Lid 1: Als een echtgenoot ten laste van het vermogen van de andere echtgenoot een goed
verkrijgt dat tot zijn eigen vermogen zal behoren, of als een eigen goed ten laste van
het vermogen van de andere echtgenoot wordt verbeterd, heeft de andere echtgenoot recht
op vergoeding.

Lid 2 — Proportionele berekening (de beleggingsleer):
De vergoeding bedraagt een evenredig deel van de waarde van het goed op het moment van
opeisbaarheid (= doorgaans scheiding):

  Vergoeding = (bijdrage / waarde goed op moment van bijdrage) × actuele waarde

Lid 3 — Afwijking mogelijk:
Bij huwelijkse voorwaarden kunnen partijen een andere vergoedingsregeling overeenkomen,
inclusief de nominale leer ("vergoeding gelijk aan het geïnvesteerde bedrag").

Wanneer is art. 1:87 BW van toepassing:
- De bijdrage (investering, verbetering) moet hebben plaatsgevonden NA 1 januari 2012
- Geldt voor ALLE huwelijksstelsels: gemeenschap, beperkte gemeenschap, koude uitsluiting
- Ook van toepassing als alleen de verbouwing na 2012 plaatsvond (niet de aankoop)

Meerdere bijdragen — meerdere ratio''s:
Elke afzonderlijke bijdrage creëert een eigen ratio. Voorbeeld:
- 2013: €30.000 aanbetaling op woning van €300.000 → ratio 10%
- 2018: €20.000 verbouwing (woning nu €350.000 waard) → ratio 20.000/350.000 = 5,7%
- Bij scheiding: som van beide vergoedingen berekend op actuele waarde

Nominale leer via HVW — wanneer van toepassing:
Als de huwelijkse voorwaarden expliciet bepalen dat vergoedingen nominaal zijn (bijv.
"de echtgenoot heeft recht op vergoeding van het geïnvesteerde bedrag"), wijkt dit af
van art. 1:87 BW lid 2. Dit is een uitdrukkelijke keuze die in de akte moet staan.

Praktische rekentools:
Gebruik altijd: taxatierapport of WOZ-waarde als actuele waarde. Notariële akte en
bankafschriften als bewijs van de bijdrage en de waarde op dat moment.',
  ARRAY['art-1:87-bw','beleggingsleer','nominale-leer','vergoedingsrecht','berekening','ratio','post-2012','huwelijkse-voorwaarden','verbouwing','codificatie']
);

-- ── Chunk 4: Praktische beslisboom en rekenvoorbeelden ───────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000011', 4,
  'Nominaal vs. beleggingsleer §4 — Beslisboom & rekenvoorbeelden voor mediator',
  'BESLISBOOM NOMINAAL VS. BELEGGINGSLEER — VOOR DE MEDIATOR

Stap 1 — Is er überhaupt een vergoedingsrecht?
Privégeld (erfenis, schenking, voorhuwelijks spaargeld) aangewend voor goed van de ander
of de gemeenschap? → JA: ga naar stap 2. NEE: geen vergoedingsrecht.

Stap 2 — Datum van de investering/verbetering?
VOOR 1-1-2012 → ga naar stap 3 (jurisprudentie)
NA 1-1-2012 → art. 1:87 BW: BELEGGINGSLEER (tenzij HVW anders bepalen → stap 4)

Stap 3 — Vóór 2012: huwelijkse voorwaarden en feiten beoordelen
- HVW bepalen nominale vergoeding → NOMINALE LEER
- HVW bepalen beleggingsleer → BELEGGINGSLEER
- Geen bepaling → beleggingsleer (HR 1987, HR 2006) tenzij rechter anders oordeelt
- Bewijs privékarakter vereist

Stap 4 — Na 2012: afwijking in HVW?
- HVW bepalen nominale vergoeding → NOMINALE LEER (art. 1:87 lid 3)
- Geen afwijking → BELEGGINGSLEER (art. 1:87 lid 2)

REKENVOORBEELDEN

Voorbeeld A — Beleggingsleer, waardestijging:
- Aankoop woning 2015: €250.000
- Privébijdrage A (erfenis): €50.000 (ratio: 20%)
- Woning bij scheiding: €400.000
- Vergoeding A = 20% × €400.000 = €80.000

Voorbeeld B — Beleggingsleer, waardedaling:
- Zelfde situatie, woning bij scheiding: €200.000
- Vergoeding A = 20% × €200.000 = €40.000 (A draagt verlies mee)

Voorbeeld C — Nominale leer (HVW bepalen dit):
- Zelfde investering €50.000
- Woning €400.000 of €200.000 → vergoeding A = altijd €50.000

Voorbeeld D — Verbouwing na 2012, aankoop vóór 2012:
- Woning gekocht 2008, aankoop geen privégeld
- Verbouwing 2015: €40.000 privégeld A (woning toen €280.000)
- Ratio verbouwing: 40.000/280.000 = 14,3%
- Woning bij scheiding: €350.000
- Vergoeding A (alleen verbouwingsdeel) = 14,3% × €350.000 = €50.000

Cruciale vragen voor de mediator bij elk dossier:
1. Wat was de waarde van het goed op het moment van de investering? (taxatie, koopakte)
2. Welk bedrag was privégeld en welk bewijs is er? (bankafschriften, schenkingsbewijzen)
3. Zijn er meerdere privé-investeringen geweest? (elk eigen ratio)
4. Bepalen de huwelijkse voorwaarden iets over de vergoedingsregeling?
5. Zijn er ook gemeenschapsmiddelen gebruikt? (beïnvloedt de ratio)',
  ARRAY['beslisboom','nominale-leer','beleggingsleer','vergoedingsrecht','rekenvoorbeeld','art-1:87-bw','mediator','ratio','waardestijging','waardedaling','bewijs']
);
