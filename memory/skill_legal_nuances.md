---
name: skill-legal-nuances
description: "Juridische nuances en correcte wetsartikelen voor veelvoorkomende screening-issues bij echtscheidingsdocumenten. Gebruik bij het beoordelen van Claude's issue-formulering of het verbeteren van prompts."
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-28T09:18:02.856Z
---

# Juridische nuances — screening-kwaliteit

## Hoofdverblijfplaats bij co-ouderschap (50/50)

**Hoe Claude het nu formuleert (bevinding):**  
"Hoofdverblijfplaats: beide kinderen bij moeder, zorgverdeling is 50/50 — motivering ontbreekt"  
Ernst: midden

**Beoordeling van de framing:**

### Wat klopt
- De keuze voor één ouder als hoofdverblijfouder is juridisch toegestaan bij 50/50-co-ouderschap.
- Één adres voor BRP-inschrijving is verplicht (art. 1.1 jo. 2.4 e.v. Wet BRP) — dubbele inschrijving is niet mogelijk.
- De aanduiding "hoofdverblijf" bij co-ouderschap heeft overwegend administratief karakter.

### Wat mis is in Claude's framing
- **Wetsartikelen kloppen niet:**
  - Art. 1:12 BW regelt de afgeleide woonplaats van de minderjarige, niet de keuze van hoofdverblijfouder.
  - Art. 826 Rv ziet op doorwerking van voorlopige voorzieningen — niet relevant hier.
  - **Juiste artikelen:** art. 815 lid 2 Rv (verplichte inhoud ouderschapsplan), art. 1:253a BW (rechterlijke beslissing bij geschil over hoofdverblijf), Wet BRP (inschrijvingsplicht).
- **Motiveringsplicht bestaat niet voor overeenkomsten:**
  - Een ouderschapsplan is een overeenkomst. Anders dan rechterlijke beslissingen (art. 30 Rv) geldt geen wettelijke motiveringsplicht.
  - "Ontbrekende motivering" is geen juridisch gebrek dat de geldigheid raakt.

### Hoe het wél geformuleerd moet worden
Het werkelijke risico is niet de ontbrekende motivering als zodanig, maar de **ontbrekende regeling van de financiële en administratieve gevolgen** van het hoofdverblijf bij co-ouderschap:

1. **Kinderbijslag (AKW):** bij co-ouderschap op verzoek 50/50 te verdelen tussen ouders (via SVB-aanvraag).
2. **Kindgebonden budget (WKB):** gaat naar de ouder die de kinderbijslag aanvraagt, inclusief alleenstaande-ouderkop (duizenden euro's/jaar). Bij twee kinderen kan kind-splitsing (per kind andere aanvrager) fiscaal gunstiger zijn.
3. **Inkomensafhankelijke combinatiekorting (IACK):** niet-inschrijvende ouder kan aanspraak maken mits kind ≥156 dagen/jaar bij hem/haar verblijft — dit moet aantoonbaar zijn.
4. Deze bedragen moeten doorwerken in de kinderalimentatieberekening/kinderrekening.

### Aanbevolen bepaling in het OP
Drie elementen:
1. Benoem administratief karakter: "De inschrijving is louter administratief en doet niets af aan de gelijkwaardige verdeling van de zorg."
2. Geef korte reden van de keuze (school, continuïteit, toeslagen, etc.).
3. Leg financiële doorwerking vast: wie vraagt kinderbijslag/WKB aan, hoe wordt dit verrekend?

### Ernst en conclusie
Ernst "midden" is verdedigbaar, maar de bevinding verdient **herformulering**: niet "motivering ontbreekt" (geen juridische plicht), maar "ontbrekende regeling van financiële en administratieve gevolgen bij co-ouderschap" (dit is het werkelijke risico).

**Why:** Gebruiker heeft een grondige juridische analyse gemaakt en aangetoond dat Claude's framing fout zit op wetsartikelen en het juridische concept van motiveringsplicht.  
**How to apply:** Bij het reviewen of verbeteren van issue-formulering voor hoofdverblijfplaats-vraagstukken bij co-ouderschap: gebruik bovenstaande framing en correcte wetsartikelen.

---

## Art. 1:88 BW — toestemming echtgenoot voor woning (geverifieerd 2026-08-05)

### Kritieke correctie wettekst
"Bewoont of kortgeleden heeft bewoond" staat **NIET** in de wettekst van art. 1:88 lid 1 sub a BW. De werkelijke wettekst gebruikt uitsluitend "bewoonde woning" (tegenwoordige tijd). Die parafrase is een fabricatie/hallucination die in AI-output voorkomt.

### Wat de wet zegt
Toestemming vereist voor "overeenkomsten strekkende tot vervreemding, bezwaring of **ingebruikgeving**" van de bewoonde woning. Ingebruikgeving aan een derde valt hier expliciet onder, ongeacht eigendomssituatie of huwelijkse voorwaarden.

### Grijs gebied: wanneer is bewoning beëindigd?
Of een echtgenoot die feitelijk is vertrokken de woning nog "bewoont" is een feitelijke vraag zonder vaste termijn. De rechtspraak legt het beschermingsgericht uit: vertrek in het kader van scheiding wordt niet snel als definitieve beëindiging aangemerkt, ook niet bij tijdelijke inschrijving elders.

**Praktijkadvies:** eis schriftelijke instemming van beide echtgenoten tot inschrijving echtscheidingsbeschikking, ongeacht wie er feitelijk woont.

### Aanvullende aandachtspunten
- **Art. 3:264 BW (hypotheekbeding):** staat los van art. 1:88. Vrijwel elke hypotheekakte verbiedt ingebruikgeving zonder schriftelijke banktoestemming.
- **Huurbescherming:** bruikleen (om niet) vs. huur (tegenprestatie). Tegenprestatie in natura (klusjes, boodschappen) kan al als huur kwalificeren → huurbescherming → problemen bij levering.
- **Na inschrijving echtscheiding:** art. 1:88 vervalt. Periode ná ontbinding maar vóór levering → uitsluitend contractuele grondslag, niet art. 1:88.

**Why:** Gebruiker verifieerde de wettekst en ontdekte dat "kortgeleden heeft bewoond" niet in de wet staat. Eerdere DOMEINKENNIS was onjuist op dit punt.  
**How to apply:** Bij art. 1:88-vraagstukken: nooit stellen dat vertrek bij inschrijving elders het vereiste opheft; altijd grijs gebied benoemen en schriftelijke instemming adviseren.
