-- ============================================================
-- Migratie 010 — Legal chunks: Beleggingsleer bij scheidingen
-- Uitvoeren in Supabase SQL-editor (eenmalig, idempotent)
-- ============================================================

-- Stap 1: Bronrecord aanmaken (idempotent via ON CONFLICT)
INSERT INTO legal_sources (id, title, bwb_id, source_type, url, valid_from)
VALUES (
  '10000000-0000-0000-0000-000000000009',
  'Beleggingsleer & vergoedingsrechten bij scheiding — art. 1:87 BW + jurisprudentie',
  'DOCTRINE-BELEGGINGSLEER',
  'richtlijn',
  'https://wetten.overheid.nl/BWBR0002656/2012-01-01#Boek1_Titeld1.7_Artikel87',
  '2012-01-01'
)
ON CONFLICT (id) DO NOTHING;

-- Stap 2: Verwijder eventueel bestaande chunks om opnieuw in te voegen
DELETE FROM legal_chunks WHERE source_id = '10000000-0000-0000-0000-000000000009';

-- ── Chunk 1: Kernbegrip en art. 1:87 BW ──────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000009', 1,
  'Beleggingsleer §1 — Kernbegrip & art. 1:87 BW (vanaf 2012)',
  'BELEGGINGSLEER BIJ SCHEIDING — KERNBEGRIP EN WETTELIJK KADER

Wat is de beleggingsleer?
De beleggingsleer houdt in dat wanneer privévermogen van één echtgenoot wordt geïnvesteerd in een goed dat (mede) aan de andere echtgenoot of de huwelijksgemeenschap toebehoort — of omgekeerd — er geen nominale vergoeding plaatsvindt, maar een proportionele vergoeding gebaseerd op de waardeontwikkeling van het goed.

Kern: de investeerder deelt mee in de waardestijging (én -daling) van het goed, naar rato van zijn investering.

Art. 1:87 BW (van kracht vanaf 1 januari 2012)
Artikel 1:87 BW codificeert de beleggingsleer voor alle huwelijken waarbij transacties plaatsvinden na 1-1-2012:

Lid 1: "Indien een echtgenoot ten laste van het vermogen van de andere echtgenoot een goed dat tot zijn eigen vermogen zal behoren verkrijgt, of indien een goed dat tot zijn eigen vermogen behoort ten laste van het vermogen van de andere echtgenoot wordt verbeterd, heeft de andere echtgenoot recht op een vergoeding."

Lid 2 (proportionele berekening): De vergoeding wordt berekend als de waarde die de bijdrage had ten opzichte van de totale waarde van het goed op het moment van verkrijging/verbetering, vermenigvuldigd met de actuele waarde van het goed:

  Vergoeding = (Privébijdrage / Waarde goed op moment van verkrijging) × Actuele waarde goed

Rekenvoorbeeld:
- Eigen woning gekocht voor €300.000
- Echtgenoot A betaalt €60.000 eigen geld (20%) als aanbetaling
- Resterende €240.000 via gezamenlijke hypotheek
- Woning bij scheiding waard: €450.000
→ Vergoedingsrecht A = 20% × €450.000 = €90.000 (niet slechts €60.000 nominaal)

Toepassing bij verlies: als de woning daalt naar €250.000:
→ Vergoedingsrecht A = 20% × €250.000 = €50.000 (A draagt ook het verlies mee)

Wanneer van toepassing:
- Privégeld (erfenis, schenking, voorhuwelijks spaargeld) gebruikt voor aankoop gezamenlijk goed
- Privégeld gebruikt voor verbouwing/verbetering van goed dat aan andere echtgenoot toebehoort
- Gemeenschapsgeld gebruikt voor privégoed van één echtgenoot
- Geldt ook voor huwelijken met koude uitsluiting en bij beperkte gemeenschap (post-2018)',
  ARRAY['beleggingsleer','vergoedingsrecht','art-1:87-bw','huwelijksvermogensrecht','privévermogen','aanbetaling','eigen-woning','proportioneel']
);

-- ── Chunk 2: Pre-2012 jurisprudentie ─────────────────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000009', 2,
  'Beleggingsleer §2 — Jurisprudentie vóór 2012 (HR Huijbers/Jonkers e.a.)',
  'BELEGGINGSLEER VÓÓR 1 JANUARI 2012 — JURISPRUDENTIEEL KADER

Tijdvakken:
- Transacties vóór 1-1-2012: jurisprudentiële beleggingsleer van toepassing
- Transacties vanaf 1-1-2012: art. 1:87 BW (zie chunk 1)
Let op: de datum van de transactie (aankoop, verbetering) is bepalend, niet de huwelijksdatum.

Sleuteljurisprudentie:

HR 12 juni 1987, NJ 1988/150 (Huijbers/Jonkers)
Eerste formele erkenning van de beleggingsleer door de Hoge Raad. Privégeld dat wordt aangewend voor verkrijging van een gemeenschapsgoed leidt niet tot een nominale maar tot een proportionele vergoedingsvordering. De echtgenoot die het geld investeerde heeft een vordering die meebeweegt met de waardeontwikkeling van het goed.

HR 21 april 2006, NJ 2007/395 (Vossen/Swinkels)
Bevestiging beleggingsleer bij koude uitsluiting. Zelfs als er géén gemeenschap is, leidt investering van privévermogen in goed van de andere echtgenoot tot een proportionele vergoedingsvordering. De HR verwierp de stelling dat bij koude uitsluiting altijd nominale vergoeding volstaat.

HR 10 februari 2012, NJ 2012/282
Vlak vóór inwerkingtreding art. 1:87 BW. Bevestigt dat de beleggingsleer ook van toepassing is op verbeteringen (verbouwingen), niet alleen op initiële aankopen. De proportionele vergoeding wordt berekend op het moment van verevening/verdeling.

Praktisch onderscheid pre- vs. post-2012:
- Pre-2012: rechter heeft meer beoordelingsruimte; partijen moeten aantonen dat beleggingsleer van toepassing is
- Post-2012: art. 1:87 BW geeft een wettelijk vermoeden; uitzondering vereist andersluidende overeenkomst (art. 1:87 lid 3: partijen kunnen bij huw.voorwaarden andere vergoedingsregels overeenkomen)

Bewijslast:
De echtgenoot die een vergoedingsrecht claimt, moet bewijzen:
1. Dat zijn privévermogen is aangewend
2. Voor welk bedrag en op welk moment
3. Voor welk goed

Bankafschriften, schenkingsbewijzen, hypotheekaktes en notariële aktes zijn cruciaal als bewijsmiddel.',
  ARRAY['beleggingsleer','jurisprudentie','hr-1987','hr-2006','huijbers-jonkers','vossen-swinkels','pre-2012','vergoedingsrecht','bewijs','huwelijksvermogensrecht']
);

-- ── Chunk 3: Beleggingsleer bij koude uitsluiting ────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000009', 3,
  'Beleggingsleer §3 — Koude uitsluiting & beperkte gemeenschap',
  'BELEGGINGSLEER BIJ KOUDE UITSLUITING EN BEPERKTE GEMEENSCHAP

Koude uitsluiting (volledige uitsluiting gemeenschap)
Bij koude uitsluiting is er géén huwelijksgemeenschap. Elk goed dat tijdens het huwelijk wordt verkregen, behoort toe aan de echtgenoot die het heeft gekocht of op wiens naam het staat.

Toch zijn vergoedingsrechten (beleggingsleer) ook hier van toepassing als:
- Echtgenoot A zijn privégeld gebruikt voor een goed dat juridisch aan echtgenoot B toebehoort
- Echtgenoot A zijn privégeld bijdraagt aan een goed op beider naam maar niet proportioneel aan zijn aandeel

Voorbeeld koude uitsluiting:
- Woning op naam van B (koopprijs €400.000)
- A betaalt €80.000 eigen geld als aanbetaling (20%)
- Gemeenschappelijke hypotheek voor restant
- Woning bij scheiding waard: €600.000
→ A heeft vergoedingsrecht van 20% × €600.000 = €120.000 op B
→ Dit is een vordering van A op B, geen aandeel in eigendom

Beperkte gemeenschap (huwelijken vanaf 1-1-2018, art. 1:94 BW nieuw)
Voorhuwelijks vermogen, erfenissen en schenkingen zijn privé. Goederen verkregen tijdens het huwelijk vallen in de beperkte gemeenschap, tenzij gekocht met privémiddelen.

Beleggingsleer-complicatie bij beperkte gemeenschap:
- Goed gekocht deels met privémiddelen (erfenis) en deels met gemeenschapsgeld: proportionele verdeling
- Artikel 1:95 lid 2 BW: als een privégoed mede uit gemeenschapsgeld is gefinancierd, heeft de gemeenschap een vergoedingsrecht (omgekeerde beleggingsleer)
- Vermenging van privé- en gemeenschapsgeld vereist nauwkeurige administratie; ontbreekt die dan geldt het bewijsvermoeden van art. 1:94 lid 1 BW (in gemeenschap gevallen)

Praktische valkuil — "onbenoemde rekening":
Spaargeld van vóór het huwelijk staat op een gezamenlijke rekening gestort. Door vermenging is niet meer traceerbaar welk deel privé was. Bewijs van privékarakter rust op de claimende echtgenoot.

Convenant-signalen bij koude uitsluiting:
- Aanbetaling eigen woning deels privégeld → vergoedingsrecht controleren
- Verbouwingskosten betaald door één echtgenoot → vergoedingsrecht berekenen
- "Leningen" tussen echtgenoten vastgelegd? Of toch schenking/belegging?
- Onderneming gefinancierd met privémiddelen van één echtgenoot: aandelen op beider naam → vergoedingsrecht',
  ARRAY['beleggingsleer','koude-uitsluiting','beperkte-gemeenschap','art-1:94-bw','art-1:95-bw','vergoedingsrecht','huwelijksvermogensrecht','privévermogen','vermenging']
);

-- ── Chunk 4: Beleggingsleer bij verrekenclausules ────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000009', 4,
  'Beleggingsleer §4 — Verrekenclausules & niet-uitgevoerde verrekening (art. 1:136 BW)',
  'BELEGGINGSLEER BIJ VERREKENCLAUSULES (art. 1:132-143 BW)

Periodieke verrekenclausule — wat houdt het in?
Veel huwelijkse voorwaarden bevatten een "periodieke verrekenclausule": jaarlijks verrekenen partijen hun overgespaarde inkomsten (wat er over is na aftrek van kosten van de huishouding).

Probleem in de praktijk: de meeste echtparen voeren de verrekening nooit feitelijk uit.

Art. 1:136 BW — de beleggingsleer bij niet-uitgevoerde verrekening
Als de periodieke verrekening niet is uitgevoerd, bepaalt art. 1:136 BW dat bij eindverrekening (echtscheiding) de waardestijging van goederen die zijn gefinancierd uit te verrekenen inkomsten alsnog wordt verrekend — naar rato van de investering uit te verrekenen inkomsten.

HR 27 januari 2006, NJ 2008/564 (Schwanen/Hundscheid)
Sleutelajeest: als periodieke verrekening niet is nageleefd én de eigen woning (mede) is gefinancierd uit inkomen dat verrekend had moeten worden, dan geldt de beleggingsleer: de waardestijging van de woning wordt verrekend naar rato van de gefinancierde hypotheekaflossingen uit te verrekenen inkomsten.

Bewijsvermoeden art. 1:141 lid 3 BW:
Als het periodiek verrekenbeding niet is nageleefd, wordt vermoed dat het aanwezige vermogen bij echtscheiding verrekend moet worden — tenzij aangetoond wordt dat het vermogen privé is (bijv. erfenis, voorhuwelijks vermogen of geschenk met uitsluitingsclausule).

Praktische implicaties voor mediator:
1. Controleer altijd of huwelijkse voorwaarden een verrekenclausule bevatten
2. Vraag of de verrekening jaarlijks is bijgehouden (bankafschriften, ondertekende overzichten)
3. Bij niet-nageleefd verrekenbeding: eigen woning, beleggingen en ondernemingsaandelen zijn potentieel te verrekenen
4. Bereken de verrekenvordering proportioneel: welk deel van de hypotheekaflossingen is betaald uit "te verrekenen" inkomen vs. privévermogen of inkomen buiten de clausule

Veelvoorkomende verrekenvalkuilen:
- Erfenis zonder uitsluitingsclausule → valt wél in de verrekening
- Salaris van één partner volledig gespaard terwijl ander partner alle kosten betaalde → volledig te verrekenen overschot
- Woning op naam van één echtgenoot, maar aflossingen uit gemeenschappelijk inkomen → verrekenvordering andere echtgenoot

Convenant-signalen:
- Huwelijkse voorwaarden met verrekenclausule aanwezig maar geen verrekeningsstaat → volledigheid (hoog)
- Verrekenbeding aanwezig, eigen woning aanwezig, maar geen verrekenberekening in convenant → juridisch (hoog)
- Partijen stellen "we hebben nooit verrekend, dat hebben we kwijtgescholden" → juridisch (midden, vereist expliciete vastlegging)',
  ARRAY['beleggingsleer','verrekenclausule','periodieke-verrekening','art-1:136-bw','art-1:141-bw','schwanen-hundscheid','hr-2006','huwelijkse-voorwaarden','eigen-woning','verrekening']
);

-- ── Chunk 5: Praktische toepassing voor mediators ────────────────────
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES (
  '10000000-0000-0000-0000-000000000009', 5,
  'Beleggingsleer §5 — Praktische toepassing voor mediators & convenant-formulering',
  'BELEGGINGSLEER IN DE MEDIATIONPRAKTIJK — TOEPASSING EN CONVENANT

Wanneer moet de mediator de beleggingsleer agenderen?
1. Aanbetaling eigen woning (deels) uit erfenis of privéspaargeld
2. Verbouwing of renovatie betaald door één echtgenoot uit privémiddelen
3. Hypotheekaflossingen betaald door één echtgenoot meer dan de ander (ook bij volledige gemeenschap)
4. Onderneming of aandelen gefinancierd door privévermogen van één echtgenoot
5. Tweede woning of belegging verkregen deels uit privémiddelen
6. Huwelijkse voorwaarden met verrekenclausule die niet is bijgehouden

Stappenplan vergoedingsrecht berekenen (art. 1:87 BW):
Stap 1 — Stel de privébijdrage vast (€X) en de totale aankoopwaarde (€Y) op het moment van verkrijging
Stap 2 — Bereken de ratio: X / Y (bijv. €40.000 / €200.000 = 20%)
Stap 3 — Stel de huidige waarde van het goed vast (€Z, bijv. taxatierapport of WOZ)
Stap 4 — Vergoedingsrecht = ratio × huidige waarde (20% × €350.000 = €70.000)
Stap 5 — Vergoedingsrecht verrekenen bij verdeling of als vordering vaststellen

Bijzondere situaties:
- Verbouwing: ratio = verbouwingskosten privé / (aankoopprijs + verbouwingskosten)
- Meerdere investeringen: elke investering creëert een eigen vergoedingsrecht met eigen ratio
- Hypotheekaflossingen privé: elk privé afgelost bedrag creëert een nieuwe, kleine ratio

Convenant-formulering — aanbevolen tekst:
"Partij A heeft een vergoedingsrecht jegens Partij B ter grootte van [bedrag of percentage × taxatiewaarde], wegens investering van privévermogen ad [€X] bij de aankoop van de gezamenlijke woning te [adres] op [datum], zijnde [Y]% van de toenmalige aankoopprijs van €[Z]. Dit vergoedingsrecht wordt verrekend/voldaan als volgt: [...]"

Optioneel — afzien van beleggingsleer:
Partijen kunnen overeenkomen af te zien van vergoedingsrechten (bijv. bij eenvoudige verdeling). Formulering: "Partijen bevestigen over en weer geen vergoedingsrechten als bedoeld in art. 1:87 BW jegens elkaar te hebben, dan wel doen zij wederzijds afstand van dergelijke rechten."

Fiscale aandachtspunten:
- Vergoedingsrecht is geen schenking als het op de beleggingsleer is gebaseerd; geen schenkbelasting
- Uitbetaling vergoedingsrecht uit de opbrengst van de woning: let op box 3 bij te lange doorlooptijd
- Kwijtschelding vergoedingsrecht door één echtgenoot aan de andere: kan schenking zijn → schenkbelasting

Convenant-signalen (screeningsaandachtspunten):
1. Woning aanwezig in convenant, maar geen vermelding van herkomst aanbetalingsgeld → onderzoeksvraag
2. Verbouwingskosten vermeld zonder bronvermelding (privé of gemeenschap) → volledigheid (midden)
3. Huwelijkse voorwaarden met koude uitsluiting, gezamenlijke woning op naam van één partij → vergoedingsrecht controleren
4. Partijen erkennen onderlinge leningen, maar geen vastlegging als vergoedingsrecht → juridisch (midden)
5. Significante waardeverschillen in vermogensopstelling zonder toelichting → beleggingsleer agenderen',
  ARRAY['beleggingsleer','vergoedingsrecht','mediator','convenant','art-1:87-bw','eigen-woning','privévermogen','berekening','formulering','schenking','fiscaal']
);
