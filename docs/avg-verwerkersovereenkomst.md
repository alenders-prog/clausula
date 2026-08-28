# Verwerkersovereenkomst — wat er nog in moet

Opgesteld 28 augustus 2026, naar aanleiding van het besluit om gebruiksgegevens per
gebruiker vast te leggen (`analyse_feiten`).

> Dit is een werklijst, geen juridisch advies. De formuleringen hieronder zijn bedoeld
> als vertrekpunt voor de jurist die de overeenkomst opstelt — niet om ongewijzigd over
> te nemen.

---

## Waarom dit niet kan wachten

Voor de inhoud van de documenten is Clausula **verwerker**: het mediationkantoor bepaalt
het doel, wij voeren uit. Zodra wij gebruiksgegevens gaan verwerken **voor onze eigen
doelen** — capaciteitsplanning, kostenbeheersing, verbetering van de dienst — doen we
iets anders: dan bepalen wij zelf doel en middelen.

Artikel 28 lid 10 AVG is daar streng in. Een verwerker die eigen doelen bepaalt zonder
dat dat is afgesproken, geldt voor dát deel als verwerkingsverantwoordelijke **zonder
grondslag**. De overtreding zit dan niet in wát er wordt opgeslagen, maar in het feit
dat het nergens is vastgelegd — en dat het kantoor de vragen van zijn eigen mediators
niet kan beantwoorden.

`analyse_feiten` bevat `gebruiker_id`. Dat verwijst via `auth.users` naar een
e-mailadres en dus naar een persoon. Gepseudonimiseerd is niet anoniem: de AVG geldt
onverkort.

---

## 1. Clausule: gebruiksgegevens als zelfstandige verwerking

Op te nemen als apart artikel, niet weggestopt in een bijlage.

> **Gebruiksgegevens.** Leverancier verwerkt gegevens over het gebruik van de dienst —
> aantallen analyses, tijdstippen, documenttypen, aantallen en categorieën van
> bevindingen, en verbruikte verwerkingscapaciteit — als **zelfstandig
> verwerkingsverantwoordelijke**, op grondslag van gerechtvaardigd belang.
>
> Deze verwerking dient uitsluitend voor: capaciteitsplanning en technisch beheer,
> facturering en licentiebewaking, beveiliging en misbruikdetectie, en verbetering van
> de dienst.
>
> Gebruiksgegevens bevatten **geen inhoud van cliëntdocumenten**: geen namen, geen
> passages, geen bevindingsteksten, geen bestandsnamen. Uitsluitend tellingen en
> classificaties.
>
> Leverancier gebruikt gebruiksgegevens **niet** om individuele medewerkers van
> opdrachtgever te beoordelen.

Die laatste zin is er niet voor de vorm. Zonder die grens is dit materieel
werknemersmonitoring door een externe partij, en dat heeft het kantoor niet gevraagd.

## 2. Clausule: bewaartermijn

> Gebruiksgegevens zijn na **18 maanden** niet langer herleidbaar tot een individuele
> gebruiker. Na die termijn wordt de gebruikersverwijzing verwijderd; de tellingen
> blijven geanonimiseerd bewaard voor statistische doeleinden.
>
> Bij beëindiging van een gebruikersaccount wordt de gebruikersverwijzing **direct**
> verwijderd.

Achttien maanden is een keuze, geen norm. Onderbouwing: capaciteitsplanning kijkt naar
het lopende en het vorige jaar; verder terug voegt niets toe. Twaalf is beter
verdedigbaar, vierentwintig ook nog te dragen. **Kies een getal en leg de reden vast** —
een termijn zonder motivering is bij een controle net zo lastig als geen termijn.

## 3. Clausule: statistieken op kantoorniveau

> Leverancier mag geaggregeerde, niet tot personen herleidbare statistieken over het
> gebruik van de dienst opstellen en gebruiken, ook na beëindiging van de overeenkomst.

Dit is de clausule die "doortellen ook als dossiers verwijderd zijn" mogelijk maakt.
Zonder deze bepaling is onduidelijk of de tellingen na opzegging mogen blijven staan.

## 4. Aanpassing van de privacyverklaring

De mediators moeten kunnen weten dat dit gebeurt. Niet met een melding in beeld, wel
vindbaar. Op te nemen in de privacyverklaring op clausula.nl én in de informatie die
een kantoor aan zijn medewerkers geeft:

> Wij houden bij hoe vaak en op welke momenten van de dienst gebruik wordt gemaakt, en
> hoeveel verwerkingscapaciteit dat kost. Deze gegevens zijn na 18 maanden niet meer
> tot u herleidbaar. Wij gebruiken ze niet om uw functioneren te beoordelen.

## 5. Verwerkingsregister

Gebruiksgegevens worden een aparte verwerking in het register, met eigen doel,
grondslag, categorieën en bewaartermijn. Dit is de plek waar de afweging van het
gerechtvaardigd belang wordt vastgelegd (de LIA).

---

## Nog te doen — bredere AVG-lijst

| Punt | Stand |
|---|---|
| Verwerkersovereenkomst met **Vercel** | nog te regelen |
| Verwerkersovereenkomst met **Supabase** | nog te regelen |
| Verwerkersovereenkomst met **Anthropic** | DPA staat in `docs/` (pdf), nog niet getekend/vastgelegd |
| Verwerkersovereenkomst met **Adobe** (PDF Services) | nog te regelen |
| Eigen verwerkersovereenkomst richting de **kantoren** | uit te breiden met de clausules hierboven |
| Privacyverklaring aanpassen | volgt op clausule 1 en 2 |
| Verwerkingsregister aanvullen | volgt op clausule 1 en 2 |
| **Sentry** (indien ingevoerd) | wordt een extra verwerker; EU-datalocatie Frankfurt bij aanmaken kiezen, achteraf niet te wijzigen |

Resend is vervallen — de uitnodigingsmail gaat via de eigen mailserver op clausula.nl.

---

## Twee dingen om te weten voordat de jurist ernaar kijkt

**De eenmanszaak.** `organisatie_id` is geen persoonsgegeven — een kantoor is geen
natuurlijk persoon, en daarom staat er ook geen bewaartermijn op de statistiek per
organisatie. Maar bij een eenmanszaak vallen kantoor en persoon samen. Zolang die
cijfers intern blijven is dat geen probleem; zodra u organisatiecijfers naar buiten
brengt, is het er wel een.

**Minimalisatie is hier al ingebouwd, en dat is het sterkste argument.** De tabel bevat
tellingen en geen tekst. Dat is niet alleen netjes — het is de reden dat de
geanonimiseerde regels ná de bewaartermijn onbeperkt mogen blijven staan, en dat een
verwijderverzoek van een cliënt de statistiek niet raakt.
