-- ═══════════════════════════════════════════════════════════════════════════
-- Acht chunks bereikbaar maken voor de documentanalyse
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aanleiding (23 augustus 2026). `api/analyseer.js` selecteert wetteksten door
-- `topic_tags` te matchen tegen `situatie_kenmerken.key`. Gemeten: acht van de
-- vierennegentig chunks dragen géén enkele tag die in `situatie_kenmerken`
-- voorkomt. Ze gingen bij geen enkele classificatie mee, stonden gewoon in de
-- database, en er verscheen nergens een melding.
--
-- Dat is dezelfde ziekte als de underscore-tags van augustus: kennis die er is,
-- nooit wordt opgehaald, en waarvan het ontbreken niet opvalt omdat het antwoord
-- er zonder die kennis óók compleet uitziet.
--
-- Het gaat om twee groepen, met een verschillende oplossing.
--
-- ── Uitvoeren in de Supabase SQL-editor. Idempotent; mag opnieuw. ─────────────

-- ── Groep 1: IPR — een nieuw kenmerk ─────────────────────────────────────────
-- Vijf chunks over internationaal privaatrecht: welk huwelijksvermogensrecht geldt
-- bij echtgenoten uit verschillende landen, het wagonstelsel, EU-Verordening
-- 2016/1103. Dit is conditionele kennis: hangt hij aan `huwelijk`, dan gaat het
-- hele blok bij élke huwelijksanalyse mee — een paar duizend tokens ruis voor het
-- overgrote deel van de dossiers.
--
-- Daarom een eigen kenmerk. Het model hoeft het niet te benoemen: de classificatie
-- legt `nationaliteit_a` en `nationaliteit_b` al vast, en `afgeleideKenmerken()`
-- in src/rapport/internationaal.js leidt het kenmerk daaruit af. Geen promptwijziging.
--
-- Let op: alle vijf IPR-chunks dragen de tag `internationaal` al. Die stond er
-- altijd; er was alleen geen kenmerk dat hem kon oproepen. De werkelijke reparatie
-- zit dus in de code. De update hieronder is een vangnet voor chunks die later
-- worden toegevoegd met alleen `ipr`.

insert into situatie_kenmerken (key, label, categorie)
values ('internationaal', 'Internationaal element (nationaliteiten)', 'relatievorm')
on conflict (key) do nothing;

update legal_chunks
set topic_tags = array_append(topic_tags, 'internationaal')
where 'ipr' = any(topic_tags)
  and not ('internationaal' = any(topic_tags));

-- ── Groep 2: vergoedingsrechten — hertaggen ──────────────────────────────────
-- Drie chunks "Nominaal vs. beleggingsleer" en "Beleggingsleer §2". Die gaan over
-- de vraag wat er gebeurt als één partij eigen geld in de woning heeft gestoken.
-- Hun buren (Beleggingsleer §1, §3, §4) dragen al `eigen_woning` en zijn daardoor
-- wél bereikbaar; deze vier misten die tag zonder inhoudelijke reden.
--
-- Hier is geen nieuw kenmerk nodig: een vergoedingsrecht speelt vrijwel altijd rond
-- de woning, en dan hoort de hele reeks mee te gaan in plaats van de helft.
--
-- De voorwaarde is bewust nauw: alléén chunks die op dit moment door geen enkele
-- tag bereikbaar zijn. Een bredere update ("alles met beleggingsleer") zou ook
-- HVW §4 — Koude uitsluiting raken, en dat gaat over het huwelijksvermogensstelsel
-- en niet over de woning. Zo verandert er niets aan chunks die al goed staan, en
-- kan dit bestand opnieuw gedraaid worden zonder verder om zich heen te grijpen.

update legal_chunks lc
set topic_tags = array_append(lc.topic_tags, 'eigen_woning')
where ('beleggingsleer' = any(lc.topic_tags) or 'nominale-leer' = any(lc.topic_tags))
  and not exists (
    select 1 from situatie_kenmerken sk where sk.key = any(lc.topic_tags)
  )
  and not (lc.topic_tags && array['convenant','ouderschapsplan','huwelijkse_voorwaarden',
                                  'verrekenbeding','koude_uitsluiting','uitsluitingsclausule',
                                  'internationaal']);

-- ── Controle ─────────────────────────────────────────────────────────────────
-- Hierna hoort `node scripts/kennisbank-check.mjs` nul onbereikbare chunks te
-- melden. De embeddings hoeven niet opnieuw: die zijn op citatie en inhoud
-- gebaseerd, niet op tags.

select count(*) as chunks_zonder_bereikbare_tag
from legal_chunks lc
where not exists (
  select 1 from situatie_kenmerken sk where sk.key = any(lc.topic_tags)
)
and not (lc.topic_tags && array['convenant','ouderschapsplan','huwelijkse_voorwaarden',
                                'verrekenbeding','koude_uitsluiting','uitsluitingsclausule']);
