---
name: feedback-mobiel-sync
description: Wijzigingen in de desktop-assistent ook altijd doorvoeren in assistent-mobiel.html
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-08-06T09:52:02.143Z
---

Wijzigingen aan de desktop-assistent (in `index.html`) moeten ook doorgevoerd worden in `assistent-mobiel.html`, voor zover van toepassing op de mobiele context.

**Why:** De gebruiker wil dat beide versies in sync blijven qua logica én opmaak. Zonder expliciete sync-stap lopen ze uiteen en kost inhalen extra werk.

**How to apply:** Controleer na elke wijziging aan de assistent-gerelateerde code in `index.html` of de wijziging ook relevant is voor `assistent-mobiel.html`. Werk dan meteen ook `assistent-mobiel.html` bij in dezelfde sessie — niet als nagedachte, maar als vaste stap. Denk aan: labels, CSS-variabelen, vervolgacties-handlers, `assistent-core.js` updates, en styling-regels.
