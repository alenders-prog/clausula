# Verplichte en gebruikelijke onderdelen per documenttype

Gebruik deze checklist voor de dimensie `volledigheid`.
- "Verplicht" ontbrekend → `hoog`
- "Gebruikelijk" ontbrekend zonder aanwijsbare reden in het document → `midden`
- Aantoonbaar niet van toepassing → géén bevinding

> **Cross-document**: als een onderdeel ontbreekt in dit document maar geregeld is in een
> ánder document in het dossier (bijv. kinderalimentatie staat in het OP, niet in het convenant),
> en het document verwijst daar correct naar → GEEN `volledigheid`-issue (of hooguit `laag`
> over het formeel als bijlage toevoegen van dat andere document).

---

## Ouderschapsplan — verplicht (art. 815 lid 2 Rv)
- [ ] Verdeling van zorg- en opvoedingstaken (zorgregeling/omgangsregeling)
- [ ] Wijze van informatie-uitwisseling en consultatie over gewichtige aangelegenheden
- [ ] Kosten van verzorging en opvoeding (kinderalimentatie)

## Ouderschapsplan — gebruikelijk
- [ ] Hoofdverblijf en inschrijving BRP (art. 826 Rv)
- [ ] Vakantie- en feestdagenregeling
- [ ] Wijze van betrokkenheid van de kinderen bij het plan (art. 815 lid 4 Rv)
- [ ] Kinderrekening of verrekensystematiek indien van toepassing
- [ ] Indexering kinderalimentatie (art. 1:402a BW geldt van rechtswege — vermelding voorkomt geschil)
- [ ] Evaluatiemoment / wijzigingsprocedure
- [ ] Geschillenregeling (bijv. eerst mediation, art. 1:253a BW)

---

## Echtscheidingsconvenant — gebruikelijk (situatie-afhankelijk)
- [ ] Partneralimentatie: bedrag of nihilbeding, duur, ingangsdatum, indexering,
      niet-wijzigingsbeding (art. 1:159 BW) indien gewenst
- [ ] Eigen woning: toedeling/verkoop, hypotheek, ontslag hoofdelijke aansprakelijkheid,
      eigenwoningreserve
- [ ] Verdeling gemeenschap / afwikkeling huwelijkse voorwaarden, peildatum
- [ ] Pensioen: verevening (Wvps), conversie, of schriftelijke afwijking met motivering
- [ ] Kinderalimentatie: bedrag conform Tremanormen of gemotiveerde afwijking, indexering
      (ook als dit geregeld is in een bijgevoegd ouderschapsplan — dan is bijlage vereist)
- [ ] Bankrekeningen, schulden, verzekeringen (o.a. overlijdensrisico gekoppeld aan alimentatie)
- [ ] Inboedelverdeling of kwijting
- [ ] Fiscale paragraaf (verrekening, aangifte jaar van scheiding, fiscaal partnerschap tot welke datum)
- [ ] Finale kwijting en vrijwaring
- [ ] Kosten mediation/procedure

---

## MfN-score elementen

De MfN-score wordt berekend via een apart `mfn_score` object (niet via issues).
De exacte elementenlijsten per documenttype staan in `api/analyseer.js` (`MFN_ELEMENTEN`).
Raadpleeg `references/mfn-normen.md` voor de onderliggende gedragsregels.

---

> NB: dit bestand is een startpunt. Vul aan met eigen kantoorpraktijk en houd
> wetswijzigingen bij (o.a. alimentatieduur, pensioenwetgeving, Wvps-aanpassingen).
