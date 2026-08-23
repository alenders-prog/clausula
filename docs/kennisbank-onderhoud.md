# Onderhoud Juridische Kennisbank

Dit document beschrijft wat wanneer bijgewerkt moet worden in de `legal_chunks`-tabel in Supabase, en hoe je dat doet.

---

## ⚠️ Na élke wijziging aan `legal_chunks` — twee scripts draaien

Ook na een wijziging rechtstreeks in het Supabase-dashboard.

```bash
node scripts/kennisbank-check.mjs    # tags: underscore vs streepje
node scripts/kennisbank-embed.mjs    # embeddings bijwerken voor semantisch zoeken
```

Beide falen stil als je ze vergeet, en dat is precies het probleem.

**`kennisbank-check.mjs`** vangt tags in twee schrijfwijzen. Een chunk getagd met
`koude-uitsluiting` in plaats van `koude_uitsluiting` matcht nooit tegen
`situatie_kenmerken.key`, staat in de database, en verschijnt nergens.

**`kennisbank-embed.mjs`** leest gewijzigde chunks opnieuw in als embedding. Sla je
dit over, dan wordt een aangepaste chunk gevonden op zijn **oude** inhoud — de tekst
klopt, de vindbaarheid niet. Het script pakt standaard alleen chunks zonder
`embedding_bij`; heb je bestaande tekst aangepast, zet dan `embedding_bij` op `null`
voor die rijen, of draai `--alles`.

Eenmalig vooraf: `supabase/kennisbank-semantisch.sql` in de SQL-editor, daarna
`node scripts/kennisbank-semantisch-check.mjs` om te zien of alles er echt staat.
Die controle bestaat omdat de eerste poging half doorkwam: `embedding` was
aangemaakt, `embedding_bij` niet, en de zoekfunctie ontbrak — terwijl de app
gewoon doordraaide op de terugval, dus van buitenaf zag het er goed uit.

> **Waarom semantisch zoeken?** Zie het technisch document, §8 Design beslissingen.
> Kort: de assistent zocht op alléén het eerste woord van de zoekopdracht; zes van
> twaalf realistische vragen leverden nul relevante chunks op. Semantisch zoeken
> haalde dat naar nul-van-twaalf-missers.

---

## Overzicht: wat staat er in de kennisbank?

De kennisbank bevat wetteksten en richtlijnen die Claude gebruikt bij de analyse van echtscheidingsdocumenten. Alles staat in `legal_chunks_seed.sql`.

| Categorie | Artikelen |
|---|---|
| **BW Boek 1 — Vermogen** | art. 1:94 (2× pre/na 2018), 1:99-100, 1:114, 1:121, 1:132-133, 1:141, 1:94 lid 3/1:95, **1:88, 1:81, 1:149** |
| **BW Boek 1 — Alimentatie** | art. 1:157, 1:158, 1:159, 1:159a, 1:160, 1:397, 1:401, 1:402, 1:408, **1:395a, 1:400** |
| **BW Boek 1 — Kinderen** | art. 1:404, 1:247, 1:253a, 1:253n, 1:377a-377b |
| **BW Boek 1 — Pensioen** | art. **1:155** |
| **BW Boek 1 — Overig** | art. **1:165** (finale kwijting), **Standaardclausules** |
| **Rv** | art. 815, 826 |
| **WVPS** | art. 2, **3, 4**, 5, 11 |
| **BW Boek 3** | art. 3:170, **3:177-178** |
| **IB 2001** | art. 6.3+3.101 (alimentatie fiscaal), art. 3.111+3.119a (eigen woning), **art. 2.17 (fiscale partners)** |
| **Participatiewet** | art. 62 |
| **Tremanormen** | Methode, behoeftetabel, draagkrachttabel, partneralimentatie |

---

## Nieuw artikel automatisch toevoegen (aanbevolen)

Gebruik het fetch-script voor nieuwe artikelen. Het script haalt de officiële wettekst op van wetten.overheid.nl en laat Claude de chunk structureren:

```bash
# Alle artikelen in de TE_VERWERKEN lijst verwerken:
node scripts/fetch-wetteksten.js

# Eén specifiek artikel:
node scripts/fetch-wetteksten.js --artikel=1:82

# Alleen fetchen, niet structureren (testen):
node scripts/fetch-wetteksten.js --dry-run
```

Output: `scripts/output/nieuwe-chunks.sql`

**Na een run:**
1. Review het gegenereerde SQL-bestand
2. Kopieer het naar `legal_chunks_seed.sql` (vóór het SELECT-blok)
3. Voer uit in Supabase SQL-editor
4. Pas `VOLGENDE_INDEX` in `scripts/fetch-wetteksten.js` aan

**Nieuwe artikelen toevoegen aan de verwerkingslijst:**
Open `scripts/fetch-wetteksten.js` en voeg toe aan de `TE_VERWERKEN` array:

```javascript
{
  sourceId:  '10000000-0000-0000-0000-000000000001', // BW Boek 1
  bwbId:     'BWBR0002656',
  wetNaam:   'BW Boek 1',
  artikel:   '1:82',
  hint:      'Bijdrage kosten huishouding tijdens huwelijk',
},
```

Source-IDs per wet:
| Wet | source_id |
|-----|-----------|
| BW Boek 1 | `10000000-0000-0000-0000-000000000001` |
| Rv | `10000000-0000-0000-0000-000000000002` |
| WVPS | `10000000-0000-0000-0000-000000000003` |
| BW Boek 3 | `10000000-0000-0000-0000-000000000004` |
| Tremanormen | `10000000-0000-0000-0000-000000000005` |
| IB 2001 | `10000000-0000-0000-0000-000000000006` |
| Participatiewet | `10000000-0000-0000-0000-000000000007` |

---

## Handmatig artikel toevoegen

Voeg direct toe aan `legal_chunks_seed.sql` vóór het SELECT-verificatieblok:

```sql
INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES
('10000000-0000-0000-0000-000000000001', 35,  -- source_id + volgend chunk_index
'art. X:XX BW — korte omschrijving',
'Volledige wettekst of samenvatting met praktische aandachtspunten...',
ARRAY['tag1','tag2','convenant']);
```

Voer daarna uit in de Supabase SQL-editor.

---

## Jaarlijkse update: Tremanormen (elk januari)

De Tremanormen worden jaarlijks per 1 januari bijgewerkt. Controleer elk jaar in januari.

**Bron:** [rechtspraak.nl/Onderwerpen/Paginas/Alimentatie.aspx](https://www.rechtspraak.nl/Onderwerpen/Paginas/Alimentatie.aspx)

In `legal_chunks_seed.sql`:
1. Zoek op `Tremanormen 2025`
2. Vervang jaar + bijgewerkte bedragen (behoeftetabel chunk 2, draagkrachttabel chunk 3)
3. Herrun het volledige bestand in Supabase SQL-editor

---

## Bij wetswijzigingen

- Abonneer op alerts via [wetten.overheid.nl](https://wetten.overheid.nl)
- Zoek het gewijzigde artikel op in `legal_chunks_seed.sql`
- Pas inhoud aan en herrun in Supabase

---

## Als Claude een vals positief genereert

Als Claude een wetsartikel of gangbare clausule ten onrechte als fout aanmerkt:

1. **Controleer** of het artikel in `legal_chunks_seed.sql` staat (ook in de standaardclausules-chunk, index 28)
2. **Ontbreekt het**: voeg toe via `node scripts/fetch-wetteksten.js --artikel=X:XX`
3. **Herrun** de INSERT in Supabase SQL-editor
4. Voer een nieuwe analyse uit — Claude heeft nu de juiste context

**Speciaal geval — standaardformuleringen:**
Als Claude een *gangbare formulering* in een convenant aanmerkt als fout, voeg die formulering dan toe aan chunk 28 (`Gangbare correcte standaardclausules`) in `legal_chunks_seed.sql`.

---

## Volledigheidscheck

```bash
node scripts/check-legal-chunks.js
```

Vergelijkt huidige database met referentielijst en rapporteert wat ontbreekt.

---

## Topic tags — overzicht

| Tag | Wanneer gebruiken |
|---|---|
| `convenant` | Alle artikelen relevant voor het convenant |
| `ouderschapsplan` | Artikelen over kinderaangelegenheden |
| `alimentatie` | Algemeen (beide soorten) |
| `partneralimentatie` | Specifiek partneralimentatie |
| `kinderalimentatie` | Specifiek kinderalimentatie |
| `jongmeerderjarigen` | Kinderen 18–21 jaar |
| `nihilbeding` | Nihilbeding partneralimentatie |
| `tremanormen` | Tremanormen-richtlijnen |
| `pensioen` | Pensioenverevening algemeen |
| `pensioenverevening` | Standaard pensioenverevening |
| `pensioenverevening_uitgesloten` | Afgeweken of uitgesloten verevening |
| `vermogen` | Vermogensverdeling |
| `verdeling` | Verdeling goederen |
| `gemeenschap_van_goederen` | Algehele gemeenschap (pre-2018) |
| `beperkte_gemeenschap` | Beperkte gemeenschap (post-2018) |
| `huwelijk_voor_2018` | Huwelijken gesloten vóór 1-1-2018 |
| `huwelijk_na_2018` | Huwelijken gesloten na 1-1-2018 |
| `huwelijkse_voorwaarden` | Huwelijkse voorwaarden (alle stelsels) |
| `koude_uitsluiting` | Koude uitsluiting |
| `verrekenbeding` | Verrekenbeding |
| `uitsluitingsclausule` | Uitsluitingsclausule / erfenissen |
| `woning` | Eigen woning (goederenrecht) |
| `eigen_woning` | Eigen woning (fiscaal) |
| `hypotheek` | Hypotheek en aansprakelijkheid |
| `fiscaal` | Fiscale aspecten (IB 2001) |
| `gezag` | Ouderlijk gezag |
| `gezamenlijk_gezag` | Gezamenlijk gezag |
| `omgang` | Omgang / contactregeling |
| `informatieplicht` | Informatie- en consultatieverplichting |
| `zorgregeling` | Zorgregeling / verblijfsregeling |
| `kinderen_minderjarig` | Minderjarige kinderen aanwezig |
| `geschillenregeling` | Geschillenregeling / mediationclausule |
| `volledigheid` | Formele volledigheid convenant/OP |
| `participatiewet` | Bijstand / gemeente |

---

*Bijgewerkt: juli 2026*
