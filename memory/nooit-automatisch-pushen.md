---
name: nooit-automatisch-pushen
description: Gebruiker wil nooit automatisch een git push — alleen pushen als expliciet gevraagd
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
---

Nooit automatisch `git push` uitvoeren na een commit. Alleen pushen als de gebruiker dit expliciet vraagt (bv. door "push" te typen).

Dit staat ook in CLAUDE.md: "Nooit automatisch pushen. Alleen pushen als de gebruiker dat expliciet vraagt."

**Why:** De gebruiker wil controle houden over wanneer code naar de remote gaat.

**How to apply:** Na elke commit: stop. Wacht op een expliciete push-instructie van de gebruiker.
