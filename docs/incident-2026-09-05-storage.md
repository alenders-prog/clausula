# Incidentverslag — documentopslag was zonder inloggen bereikbaar

**Datum vaststelling:** 5 september 2026
**Datum herstel:** 5 september 2026, dezelfde dag
**Status:** gedicht en van buitenaf geverifieerd
**Opgesteld voor:** functionaris gegevensbescherming / juridisch adviseur

Dit verslag bevat de feiten. De juridische weging — of hier sprake is van een meldplichtig
datalek in de zin van art. 33 AVG — staat er bewust niet in; die hoort bij de FG of jurist,
en wat daarvoor nodig is staat in §7.

---

## 1. Samenvatting

De opslagmap met geüploade documenten (`documenten`-bucket, Supabase Storage) was
bereikbaar zonder in te loggen. Met de publieke sleutel die in elke bezoekersbrowser wordt
geladen, kon een willekeurige buitenstaander de mappen opsommen, de bestandsnamen opsommen
en een document downloaden.

Aangetroffen bij een controle op de volledigheid van de toegangsbeveiliging, uitgevoerd
naar aanleiding van een eerdere architectuurbeoordeling die dit punt als *ongetoetst* had
gemarkeerd. Niet gemeld door een derde en niet naar aanleiding van een storing.

Dezelfde dag hersteld en daarna van buitenaf opnieuw gemeten.

---

## 2. Wat er precies openstond

Op de tabel `storage.objects` stonden zes toegangsregels. Drie daarvan waren correct en
kwamen uit de eigen migratie `supabase/001_multitenancy.sql`: uitsluitend voor ingelogde
gebruikers (`authenticated`), en afgeschermd op de organisatiemap van die gebruiker.

Daarnaast stonden er drie op de **anonieme rol**:

| regel | bewerking |
|---|---|
| `allow anon download 1ljx2pw_0` | SELECT — lezen en downloaden |
| `allow anon signed url 1ljx2pw_0` | SELECT — ondertekende links aanmaken |
| `allow anon upload 1ljx2pw_0` | INSERT — bestanden plaatsen |

De naamsuffix is de vorm die de policywizard in het Supabase-dashboard genereert. Deze
regels zijn dus **handmatig via het dashboard aangeklikt** en komen niet uit de code of een
migratie.

De bucket zelf stond níét als publiek gemarkeerd; het publieke pad gaf een foutmelding. Het
waren uitsluitend deze drie regels.

---

## 3. Hoe het is vastgesteld

Gemeten met uitsluitend de publieke sleutel uit `config.js`. Die sleutel is naar zijn aard
niet geheim: hij wordt aan elke bezoeker van app.clausula.nl geserveerd, en dat bestand was
op het moment van meten publiek op te halen (HTTP 200). Er is niet ingelogd en er is geen
wachtwoord of geheime sleutel gebruikt.

| aanroep | uitkomst vóór herstel |
|---|---|
| mappen in de bucket opsommen | HTTP 200 — dossiermappen zichtbaar |
| bestanden in een map opsommen | HTTP 200 — 12 bestanden |
| een document downloaden | **HTTP 200 — 107.422 bytes** |
| een ondertekende link aanvragen | HTTP 200 |

**De INSERT-regel is niet getest.** Iets in een productieomgeving plaatsen om een gat aan te
tonen is geen aanvaardbare handeling. De regel stond er, dus anoniem plaatsen was mogelijk;
dat het niet is beproefd betekent niet dat het niet kon.

Er is geen documentinhoud opgehaald of bewaard. Alleen statuscodes en bestandsgroottes zijn
gelezen; van bestandsnamen is er één getoond, gemaskeerd.

---

## 4. Omvang

- **één organisatiemap**, met **twaalf bestanden**
- bestandsnamen bestaan uit een tijdstempel plus een willekeurige reeks; er staan geen
  namen van betrokkenen in de bestandsnaam zelf
- de inhoud van de documenten is niet bekeken

De toepassing is nog niet in gebruik genomen: er zijn geen klanten, er is niets verspreid
of aangeboden, en de toepassing is niet bekendgemaakt. De aanwezige bestanden zijn
testanalyses van de eigenaar.

> **Wat dit wel en niet betekent.** Onbekend is niet hetzelfde als onbereikbaar. De
> toepassing stond op het open internet (app.clausula.nl gaf HTTP 200, evenals
> clausula.nl), er was geen `robots.txt` die zoekmachines weerde, en de sleutel was
> publiek op te halen. Er was dus geen technische drempel — alleen de omstandigheid dat
> vrijwel niemand het adres kende. Dat verlaagt de kans aanzienlijk, maar het is een
> feitelijke omstandigheid en geen beveiligingsmaatregel.

---

## 5. Herstel en verificatie

1. De drie anonieme toegangsregels zijn verwijderd
   (`supabase/2026-09-05-storage-anon-dicht.sql`).
2. De drie juiste regels zijn ongewijzigd blijven staan: alleen ingelogde gebruikers, en
   alleen binnen de eigen organisatiemap.
3. Een controle-query bevestigt dat er nog precies drie regels over zijn, alle drie op
   `authenticated`.
4. Dezelfde vier aanroepen als in §3 zijn opnieuw uitgevoerd:

| aanroep | uitkomst ná herstel |
|---|---|
| mappen opsommen | HTTP 200, **lege lijst** |
| een document downloaden | **HTTP 400 — geweigerd** |
| ondertekende link | niet meer mogelijk |

Het opsommen levert nog wel een antwoord op, maar zonder inhoud: het verzoek mag langs,
de toegangsregels geven geen rijen terug.

Deze controle is vastgelegd als herhaalbaar script (`npm run check:storage`) en is
aantoonbaar in staat om alarm te slaan: met de waarden zoals ze vóór het herstel gemeten
zijn, meldt hij alle vier de aanroepen en eindigt hij met een foutcode.

---

## 6. Wat níét kan worden vastgesteld

**Of er in de voorafgaande periode toegang is geweest, is niet te achterhalen.**

De logbewaring van het gebruikte abonnement (Supabase, gratis plan) is **één dag**. De
toegangsregels stonden er aanzienlijk langer: de oudste gegevens in het project dateren van
27 juni 2026.

In het beschikbare venster van één dag is uitsluitend verkeer aangetroffen dat hoort bij de
controle van 5 september zelf, herkenbaar aan tijdstip en aan `curl` in de
gebruikersagent.

> Dit betekent: **er is geen aanwijzing voor toegang door derden, en er is evenmin bewijs
> dat die niet heeft plaatsgevonden.** De gegevens om dat uit te sluiten bestaan niet meer.
> Dat is een eigenschap van de infrastructuur, geen tekortkoming in het onderzoek — maar
> het moet in de weging worden meegenomen zoals het is.

---

## 7. Wat de beoordeling bepaalt

Twee vragen, in deze volgorde:

**7.1 Bevatten de twaalf bestanden persoonsgegevens van betrokkenen?**

Dit is de bepalende vraag en alleen de eigenaar kan hem beantwoorden. Gaat het om volledig
verzonnen testdocumenten, dan zijn er geen betrokkenen en verandert dat de weging
ingrijpend. Zijn er echte convenanten of ouderschapsplannen gebruikt — ook uit de eigen
praktijk, ook met toestemming — dan zijn er wél betrokkenen en is dit een verwerking die
onder de AVG valt.

**7.2 Zo ja: is er een risico voor die betrokkenen?**

Daarbij wegen mee: dat er geen aanwijzing voor toegang is, dat de toepassing niet
bekendgemaakt of aangeboden is, dat het om twaalf bestanden in één map gaat — en daar
tegenover dat de gegevens openbaar bereikbaar waren zonder enige drempel en dat een
uitsluiting op basis van logs niet mogelijk is.

De termijn van 72 uur uit art. 33 lid 1 AVG loopt vanaf het moment van bekend worden:
**5 september 2026**.

---

## 8. Wat er structureel is veranderd

De oorzaak was niet een fout in de code en niet een ontbrekende migratie — de juiste regels
stónden in de broncode en waren ook toegepast. Er waren er drie naast geklikt in het
beheerscherm.

> **Een wijziging via het Supabase-dashboard laat geen bestand achter.** Geen migratie, geen
> versiebeheer, geen automatische controle en geen collegiale toetsing kan er iets van zien.
> Alle bestaande controles in dit project kijken naar bestanden; deze wijziging stond
> daarbuiten.

Daarom is `npm run check:storage` toegevoegd: die leest geen instellingen en gaat niet af op
wat er hoort te staan, maar doet wat een willekeurige bezoeker doet en kijkt wat er
terugkomt. Hij haalt bewust geen documentinhoud op en schrijft niets. Bedoeld om na elke
wijziging aan de opslag te draaien, en verder periodiek.

**Aanbeveling voor de nabije toekomst:** de logbewaring van één dag is te kort gebleken om
een vraag als deze te kunnen beantwoorden. Een betaald abonnement biedt zeven dagen. Dat
lost dit incident niet op, maar voorkomt dat een volgende vraag opnieuw onbeantwoordbaar is.

---

## Bijlagen in het versiebeheer

| bestand | inhoud |
|---|---|
| `supabase/2026-09-05-storage-anon-dicht.sql` | het herstel, met controle-query |
| `scripts/storage-toegang-check.mjs` | de herhaalbare controle van buitenaf |
| `.claude/skills/avg-beleid/SKILL.md` | de vastgelegde les over dashboardwijzigingen |
| commit `d1d4c65` | de vondst, met de meetwaarden |
| commit `6cc4288` | correctie van de controle (vals alarm en foutcode) |
