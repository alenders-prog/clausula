# MfN-normtoets: toetsingskader

> **Structuur**: de MfN-normtoets levert GEEN gewone issues op. De structuur-call
> retourneert een apart `mfn_score` object met elementen (status: aanwezig/onvolledig/ontbreekt)
> en een totaalscore. Zie de MfN-elementenlijsten in `api/analyseer.js` (`MFN_ELEMENTEN`).

---

Toets documenten (m.n. mediationovereenkomst-verwijzingen en procesbepalingen in
convenant/ouderschapsplan) tegen deze kernnormen uit de MfN-gedragsregels en het
MfN-mediationreglement.

## Kernnormen

1. **Vrijwilligheid** — partijen nemen vrijwillig deel en kunnen de mediation te allen
   tijde beëindigen. Bepalingen die beëindiging feitelijk onmogelijk of bestraft maken
   → ontbreekt/onvolledig (en eventueel een issue in `juridisch` als het dwingend recht raakt).

2. **Vertrouwelijkheid/geheimhouding** — het document behoort een geheimhoudingsbepaling
   te bevatten of correct naar de mediationovereenkomst te verwijzen. Uitzonderingen
   (bijv. overlegging aan de rechter t.b.v. homologatie) moeten expliciet zijn.

3. **Onpartijdigheid en onafhankelijkheid mediator** — formuleringen waarin de mediator
   adviseert, partij kiest, of een uitkomst "aanbeveelt" compromitteren de neutraliteit.

4. **Informed consent** — bij afwijking van wettelijke maatstaven behoort uit het
   document te blijken dat partijen geïnformeerd zijn. Raakvlak met `balans`; gebruik
   `mfn_score` element als het de rol/verplichting van de mediator betreft.

5. **Rolzuiverheid** — de mediator stelt op/begeleidt, maar treedt niet op als
   advocaat of adviseur van één partij. Let op formuleringen als "op advies van de
   mediator heeft de vrouw...".

## MfN-score elementen per documenttype

De volledige elementenlijsten staan in `api/analyseer.js` (`MFN_ELEMENTEN`).
Ze bevatten verplichte onderdelen voor respectievelijk het convenant en het
ouderschapsplan die de MfN als minimumvereiste beschouwt.

## Praktisch

- Verwijs in bevindingen naar de relevante gedragsregel in algemene termen
  ("MfN-gedragsregel inzake onpartijdigheid") tenzij het exacte regelnummer zeker is.
- Kwesties die primair juridisch zijn (nietigheid e.d.) horen in `juridisch`, niet in de MfN-score.
- De MfN-score beïnvloedt de gewogen score in de UI (score_aanwezig / score_totaal).

> NB: startpunt — vul aan met de actuele tekst van de MfN-gedragsregels en het
> reglement, en met kantoorspecifieke afspraken binnen de Zorgzaam Scheiden-formule.
