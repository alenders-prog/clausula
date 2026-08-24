-- ============================================================================
-- Alimentatie-chunks rechtzetten — 24 augustus 2026
--
-- Aanleiding: een screening meldde "Partneralimentatie: nihilbeding ontbreekt"
-- met de aanbeveling een niet-wijzigingsbeding (art. 1:159 BW) op te nemen,
-- terwijl het convenant er één alinea verder juist in voorziet dat bij
-- gewijzigde omstandigheden wordt HERBEREKEND. De aanbeveling sprak dus de
-- afspraak van partijen tegen.
--
-- Bij het uitzoeken bleken er negen chunks over artt. 1:156-1:159a te staan,
-- waarvan vier elkaar tegenspraken. Twee daarvan zijn de directe oorzaak: ze
-- hangen de eis "bewust en geïnformeerd" onder art. 1:159 BW in plaats van
-- 1:158, en beweren dat een nihilbeding zijn kracht niet verliest bij
-- gewijzigde omstandigheden. Eén chunk zegt zelfs het omgekeerde van de wet
-- over verhaal door de gemeente.
--
-- Alle bronteksten hieronder zijn op 24-08-2026 geverifieerd tegen de
-- geconsolideerde tekst op wetten.overheid.nl/BWBR0002656:
--   art. 1:156 BW  — toekenning van de uitkering (NIET 1:157)
--   art. 1:157 BW  — duur; lid 1 = helft huwelijksduur, max VIJF jaar
--   art. 1:158 BW  — de overeenkomst zelf (grondslag nihilbeding)
--   art. 1:159 BW  — niet-wijzigingsbeding, OPTIONEEL ("kan worden bedongen")
--   art. 1:159a BW — de overeenkomst staat verhaal door de gemeente NIET in de weg
--   art. 1:80e BW  — artt. 153-160 gelden ook bij geregistreerd partnerschap
--
-- Elke regel hieronder werkt op één id, met de citation als vangnet. Dat is
-- bewust nauw: in augustus raakte een bredere update vier chunks die al goed
-- stonden.
--
-- NA HET DRAAIEN (verplicht, zie CLAUDE.md):
--   node scripts/kennisbank-check.mjs    -- tags en bereikbaarheid
--   node scripts/kennisbank-embed.mjs    -- embeddings, anders wordt op de
--                                        -- OUDE tekst gezocht
-- ============================================================================

begin;

-- ── 1. Art. 1:157 BW — de wettekst van vóór 2020 vervangen ─────────────────
-- Stond in de kennisbank als "(volledig, incl. Wet herziening 2020)" maar
-- citeerde de oude leden: lid 4 = twaalf jaren, lid 6 = kort huwelijk zonder
-- kinderen. Beide bestaan niet meer in die vorm.
update legal_chunks set
  citation = 'Art. 1:157 BW — duur partneralimentatie (geldend recht, verzoeken vanaf 1-1-2020)',
  topic_tags = array['partneralimentatie','alimentatie','levensonderhoud','echtscheiding','convenant','nihilbeding'],
  content = 'Art. 1:157 BW — DUUR VAN DE PARTNERALIMENTATIE (geldende tekst; van toepassing op echtscheidingsverzoeken die zijn ingediend op of na 1 januari 2020, Wet herziening partneralimentatie, Stb. 2019/283).

LET OP — DE TOEKENNING STAAT NIET IN DIT ARTIKEL: dat is art. 1:156 BW (de rechter kan aan de echtgenoot die niet voldoende inkomsten tot zijn levensonderhoud heeft, noch zich in redelijkheid kan verwerven, op diens verzoek ten laste van de andere echtgenoot een uitkering toekennen). Art. 1:157 BW regelt uitsluitend hoe lang die verplichting duurt wanneer de rechter zelf geen termijn heeft vastgesteld.

LID 1: Indien de rechter geen termijn heeft vastgesteld, eindigt de verplichting tot het verstrekken van levensonderhoud van rechtswege na het verstrijken van een termijn die gelijk is aan de helft van de duur van het huwelijk met een maximum van VIJF jaren.

LID 2: Is op het tijdstip van indiening van het verzoek de duur van het huwelijk langer dan vijftien jaren en is de gerechtigde ten hoogste tien jaren jonger dan de leeftijd bedoeld in art. 7a Algemene Ouderdomswet, dan eindigt de verplichting niet eerder dan op het tijdstip waarop die echtgenoot die leeftijd bereikt.

LID 3: Is de duur van het huwelijk langer dan vijftien jaren, is de gerechtigde geboren op of voor 1 januari 1970 en is diens leeftijd meer dan tien jaren lager dan de AOW-leeftijd, dan eindigt de verplichting na tien jaren.

LID 4: In afwijking van het eerste tot en met derde lid eindigt de verplichting niet eerder dan op het tijdstip waarop de uit het huwelijk geboren kinderen de leeftijd van TWAALF jaren hebben bereikt.

LID 5: Bij samenloop van de omstandigheden uit lid 1 tot en met 4 geldt de LANGSTE termijn.

LID 6: De termijn vangt aan op de datum van inschrijving van de echtscheidingsbeschikking in de registers van de burgerlijke stand.

LID 7: Hardheidsclausule — kan ongewijzigde handhaving van de beeindiging naar maatstaven van redelijkheid en billijkheid niet van de gerechtigde worden gevergd, dan kan de rechter op diens verzoek alsnog een termijn vaststellen. Het verzoek wordt ingediend binnen drie maanden na de beeindiging. De rechter bepaalt bij de uitspraak of verlenging daarna mogelijk is.

DE TERMIJN VAN TWAALF JAAR IS OUD RECHT. Die stond in art. 1:157 lid 4 (oud) en geldt uitsluitend voor echtscheidingsverzoeken die voor 1 januari 2020 zijn ingediend. Noem hem nooit bij een recente scheiding: de hoofdregel is sindsdien de helft van de huwelijksduur met een maximum van vijf jaar (lid 1). Ook het oude lid 6 (huwelijk korter dan vijf jaar zonder kinderen) bestaat niet meer in die vorm.

TOELICHTING: partneralimentatie is NIET dwingend recht — echtgenoten kunnen er contractueel van afzien via art. 1:158 BW. Contrast met art. 1:400 lid 2 BW voor kinderalimentatie, dat wel dwingend is.

GEREGISTREERD PARTNERSCHAP: art. 1:80e lid 1 BW verklaart de artikelen 153 tot en met 160 van overeenkomstige toepassing op de ontbinding van een geregistreerd partnerschap. Dit duurregime geldt daar dus onverkort.

CONVENANT: vermeld ingangsdatum, hoogte en einddatum van de partneralimentatie, of leg een nihilbeding vast (art. 1:158 BW). Neemt de overeenkomst zelf geen termijn op, dan is art. 1:157 lid 1 tot en met 5 en lid 7 van overeenkomstige toepassing (art. 1:158 BW, tweede volzin).'
where id = '26dbfaa9-b7ea-49f2-8f16-cd20aaf8d922'
  and citation = 'Art. 1:157 BW — partneralimentatie bij echtscheiding (volledig, incl. Wet herziening 2020)';

-- ── 2. Art. 1:158 BW — de termijnregel uit de tweede volzin toevoegen ──────
-- Precies het punt waarop de screening viel: een nihilbeding zonder termijn is
-- niet onbepaald, het wettelijke duurregime vult aan.
update legal_chunks set
  content = content || '

TERMIJN BIJ EEN OVEREENKOMST: neemt de overeenkomst zelf geen termijn op, dan is art. 1:157 lid 1 tot en met 5 en lid 7 van overeenkomstige toepassing (art. 1:158 BW, tweede volzin). Een nihilbeding zonder termijn is dus niet automatisch onbepaald: het wettelijke duurregime vult aan.'
where id = '72dd2eec-063f-4495-8d66-b6db7134529c'
  and citation = 'art. 1:158 BW — Nihilbeding'
  and content not like '%tweede volzin%';

-- ── 3. Art. 1:159 BW — onjuiste bewering over lid 2 rechtzetten ────────────
-- De chunk beweerde dat lid 2 per 1-1-2023 geschrapt zou zijn. Lid 2 staat er
-- nog en gaat over iets anders: het beding vervalt als de overeenkomst voor de
-- indiening is aangegaan en het verzoek niet binnen drie maanden volgt.
update legal_chunks set
  content = replace(
    content,
    'De vervaltermijn van drie maanden voor een wijzigingsverzoek (oud lid 2) is per 1 januari 2023 geschrapt.',
    'Lid 2 bepaalt dat het beding vervalt indien de overeenkomst is aangegaan voor indiening van het echtscheidingsverzoek, tenzij dat verzoek binnen drie maanden na de overeenkomst is ingediend (idem bij een gemeenschappelijk verzoek). Deze bepaling geldt nog steeds.')
where id = 'fa096fe9-f41a-4030-830c-e40db409f0ce'
  and citation = 'art. 1:159 BW — Niet-wijzigingsbeding alimentatie';

-- ── 4. Art. 1:159a BW — tag overnemen van de chunk die weggaat ─────────────
update legal_chunks set
  topic_tags = array(select distinct unnest(topic_tags || array['nihilbeding']))
where id = '12154e5a-ff59-4ce1-a3f7-5397a3410c51'
  and citation = 'art. 1:159a BW — Partneralimentatie en Participatiewet-verhaal';

-- ── 5. De vier tegenstrijdige dubbelen weg ─────────────────────────────────
-- Elk op id EN citation, zodat een verkeerde treffer niets raakt.

-- Onvolledig en deels onjuist: plakt een maximum van twaalf jaar op de
-- kinderuitzondering van lid 4 (staat niet in de wet) en mist lid 3 en lid 5.
delete from legal_chunks
where id = 'e987c039-cdfe-498a-aa0e-8879a5d06c8a'
  and citation = 'art. 1:157 BW — recht op en duur partneralimentatie';

-- Stelt "verliest haar kracht niet doordat de omstandigheden wijzigen". Dat is
-- het gevolg van een niet-wijzigingsbeding (1:159), niet van 1:158 — en het
-- spreekt de goede 1:158-chunk rechtstreeks tegen.
delete from legal_chunks
where id = '93c10f20-c534-4785-94e4-02fe92ac4634'
  and citation = 'art. 1:158 BW — nihilbeding partneralimentatie';

-- De bron van de verwarring: presenteert lid 3 als het hele artikel en hangt de
-- eis "bewust en geinformeerd" onder 1:159 in plaats van onder 1:158.
delete from legal_chunks
where id = '373b8d0a-c73e-403b-a11e-32c104283ea0'
  and citation = 'art. 1:159 BW — wijziging nihilbeding';

-- Zegt het omgekeerde van de wet: art. 1:159a BW bepaalt juist dat de
-- overeenkomst verhaal door de gemeente NIET in de weg staat.
delete from legal_chunks
where id = 'f5fb1e14-2c6d-4bb7-83a4-800e6d4d8c53'
  and citation = 'art. 1:159a BW — nihilbeding geldig jegens gemeente (Participatiewet)';

commit;

-- Controle achteraf — verwacht: vijf regels (1:156 komt niet als eigen chunk voor).
--   Art. 1:157 BW — duur partneralimentatie (geldend recht, verzoeken vanaf 1-1-2020)
--   Art. 1:157 BW — jurisprudentie partneralimentatie: limitering, nihilstelling, grievend gedrag
--   art. 1:158 BW — Nihilbeding
--   art. 1:159 BW — Niet-wijzigingsbeding alimentatie
--   art. 1:159a BW — Partneralimentatie en Participatiewet-verhaal
select citation, array_length(topic_tags, 1) as tags, length(content) as tekens
from legal_chunks
where citation ~ '1:15[6789]'
order by citation;
