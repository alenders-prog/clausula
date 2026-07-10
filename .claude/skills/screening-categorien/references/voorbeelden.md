# Voorbeeldbevindingen: goed vs. slecht

Veldnamen zijn exact zoals in het tool-schema: `onderwerp`, `ernst`, `dimensies`,
`bevinding`, `aanbeveling`, `passage`.

---

## juridisch

**Goed (ernst: hoog):**
```json
{
  "onderwerp": "Afstand van kinderalimentatie is nietig",
  "ernst": "hoog",
  "dimensies": ["juridisch"],
  "bevinding": "Artikel 4.2 bepaalt dat de vrouw afziet van kinderalimentatie. Ouders kunnen geen afstand doen van kinderalimentatie; dit is in strijd met art. 1:400 lid 2 BW en de bepaling is nietig. De rechter zal dit bij homologatie niet accepteren.",
  "aanbeveling": "Partijen stellen de bijdrage in de kosten van verzorging en opvoeding vast op € [bedrag] per kind per maand, conform de behoefteberekening in bijlage [X].",
  "passage": "De vrouw ziet af van iedere aanspraak op kinderalimentatie, nu en in de toekomst."
}
```

**Slecht (waarom fout):**
> "Artikel 4.2 lijkt mogelijk juridisch problematisch en verdient nadere aandacht."

Fout: geen wetsartikel, geen uitleg waarom het fout is, geen citaat, geen handelingsperspectief.
Vage bevindingen ondermijnen het vertrouwen in de screening.

---

## conflicten

**Goed (ernst: midden):**
```json
{
  "onderwerp": "Tegenstrijdige ingangsdata partneralimentatie",
  "ernst": "midden",
  "dimensies": ["conflicten"],
  "bevinding": "Artikel 3.1 noemt als ingangsdatum 1 maart 2026, artikel 3.4 noemt 'de datum van inschrijving van de beschikking'. Deze data kunnen maanden uiteenlopen; bij het afgesproken bedrag is het verschil ca. € 950 per maand. Dit is een voorzienbaar geschilpunt.",
  "aanbeveling": "Kies één ingangsdatum en pas beide artikelen consistent aan, bijv. '1 maart 2026 dan wel — indien later — de datum van inschrijving van de echtscheidingsbeschikking'.",
  "passage": "met ingang van 1 maart 2026 / vanaf de datum van inschrijving van de echtscheidingsbeschikking"
}
```

---

## volledigheid

**Goed (ernst: hoog, verplicht onderdeel ontbreekt):**
```json
{
  "onderwerp": "Geschillenregeling informatie-uitwisseling ontbreekt",
  "ernst": "hoog",
  "dimensies": ["volledigheid"],
  "bevinding": "Het ouderschapsplan bevat geen bepaling over de wijze van informatie-uitwisseling en consultatie over gewichtige aangelegenheden. Dit is een verplicht onderdeel op grond van art. 815 lid 2 Rv; de rechter kan homologatie weigeren als het ontbreekt.",
  "aanbeveling": "Voeg toe: 'Ouders informeren elkaar tijdig en volledig over belangrijke zaken betreffende de kinderen en plegen overleg over beslissingen van gewicht. Bij verschil van mening raadplegen zij een mediator.'",
  "passage": ""
}
```

**Goed (ernst: laag, verwijzing naar ander document klopt):**
```json
{
  "onderwerp": "Kinderalimentatie geregeld in OP — voeg OP als bijlage toe",
  "ernst": "laag",
  "dimensies": ["volledigheid"],
  "bevinding": "Het convenant verwijst voor kinderalimentatie naar het ouderschapsplan. Het ouderschapsplan is aanwezig en bevat een alimentatiebepaling — de verwijzing is inhoudelijk correct. Voor juridische volledigheid is het gebruikelijk het ouderschapsplan als genummerde bijlage bij het convenant te hechten.",
  "aanbeveling": "Voeg toe: 'De kinderalimentatie is geregeld in het Ouderschapsplan d.d. [datum], gehecht als Bijlage [X] bij dit convenant.'",
  "passage": "De afspraken omtrent kinderalimentatie zijn neergelegd in het ouderschapsplan."
}
```

---

## balans

**Goed (ernst: midden):**
```json
{
  "onderwerp": "Ongemotiveerde afwijking van pensioenverevening",
  "ernst": "midden",
  "dimensies": ["balans"],
  "bevinding": "Artikel 7 sluit verevening van het tijdens huwelijk opgebouwde pensioen van de man volledig uit, zonder compensatie of motivering. Afwijken van de Wvps is toegestaan, maar zonder vastgelegde afweging is niet toetsbaar of de vrouw dit geïnformeerd heeft aanvaard.",
  "aanbeveling": "Leg de afweging van partijen vast: 'Partijen zien bewust af van pensioenverevening omdat [reden]. Partijen verklaren zich bewust te zijn van de financiële consequentie hiervan op langere termijn.'",
  "passage": "Partijen zien af van pensioenverevening."
}
```

**Slecht (waarom fout):**
> "Deze afspraak is oneerlijk voor de vrouw."

Fout: normerend oordeel over partijen in plaats van signalering aan de mediator.
Afwijken mág — het ontbreken van motivering is het punt.

---

## grammatica

**Goed (ernst: laag, gebundeld):**
```json
{
  "onderwerp": "Diverse tekstuele onvolkomenheden (gebundeld)",
  "ernst": "laag",
  "dimensies": ["grammatica"],
  "bevinding": "Het document bevat enkele typfouten zonder betekenisgevolg: 'aliminatie' (art. 3.2), 'echtscheidingscovenant' (kop hoofdstuk 1), dubbele spatie in art. 5.3. Daarnaast wisselt de aanduiding tussen 'de man' en 'partij A' — kies één vorm consequent door.",
  "aanbeveling": "Corrigeer genoemde typfouten en vervang 'partij A' overal door 'de man' (of omgekeerd).",
  "passage": "aliminatie / echtscheidingscovenant"
}
```

**Slecht (waarom fout):** zes losse laag-bevindingen voor zes typfouten. Dat vervuilt het
rapport en verdringt de aandacht van echte risico's.

---

## Algemene anti-patronen

- Zelfde probleem in twee dimensies melden (kies er één via de voorrangsvolgorde in SKILL.md)
- `passage` parafraseren in plaats van letterlijk overnemen (breekt UI-highlighting)
- `aanbeveling` die zelf juridisch onjuist of te specifiek is voor de bekende feiten
- Bevindingen over zaken die het document bewust openlaat én als zodanig benoemt
- Engelse termen in bevindingen of aanbevelingen; alles in professioneel Nederlands
- `ernst: hoog` gebruiken voor iets dat inhoudelijk klopt maar beter kan → dat is `laag`
- Pseudonimiseringsplaceholders (`[PERSOON_A]`, `[IBAN]`) als format-probleem melden
