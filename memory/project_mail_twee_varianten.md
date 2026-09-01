---
name: mail-twee-varianten
description: "Twee-varianten clausule mail-flow — concept besproken, implementatie gedaan, review nog gewenst"
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-28T13:40:34.828Z
---

In juli 2026 is de AI Assistent clausule-generatie flow uitgebreid met twee-varianten support en een bijbehorende mail-aanpak.

**Wat is geïmplementeerd:**
- Pre-flight vraag "Clausule-variant": Enkelvoudig / Conditioneel (twee varianten) / Inclusief-Exclusief
- Pre-flight vraag "Positie in document" (optioneel tekstveld)
- Genereer-knop vervangt auto-trigger (eerst alle vragen beantwoorden)
- Mail/klanttekst: extra pre-flight vraag "Wat leg ik de partijen voor?" bij twee-varianten clausule:
  - "Beide varianten — zij bepalen" → Claude schrijft keuze-mail met Optie A + B + risico's
  - "Variant A is van toepassing" → normale akkoord-mail voor A
  - "Variant B is van toepassing" → normale akkoord-mail voor B

**Staat van de code:**
- Volledig geïmplementeerd in `index.html`
- `_assist.lastVarianten` bijgehouden zodat klanttekst-flow weet of er twee varianten waren
- Functies: `_assistKlanttekstMailAanpakKiezen`, `_assistKlanttekstCheckAllAnswered`, `_assistKlanttekstGenereer`
- Prompt in `_assistGenKlanttekstEnMail` splitst op `pk.mailAanpak === 'beide'` vs variant A/B

**Wat nog niet is gereviewd:**
- Gebruiker wil dit in de praktijk testen voordat verdere aanpassingen worden gedaan
- Eventuele edge case: wat als de twee varianten heel anders zijn dan A/B (bijv. drie situaties)?

**Why:** Mediator wil partijen soms beide opties voorleggen zonder zelf al een keuze te maken — de mail is het beslismoment.

**How to apply:** Als de gebruiker vraagt om aanpassingen aan de clausule-generatie of mail-flow, kijk dan eerst of `lastVarianten`, `mailAanpak` en de prompt-splitsing in `_assistGenKlanttekstEnMail` kloppen.
