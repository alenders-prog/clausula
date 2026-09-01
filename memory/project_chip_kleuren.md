---
name: project-chip-kleuren
description: Openstaande designdiscussie over categoriekleur in filter-chips; mockup-URL als referentie
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-23T09:52:06.354Z
---

Discussie over het kleurgebruik in de dimensie-filter-chips (JURIDISCH, VOLLEDIGHEID, etc.) is bewust uitgesteld voor later.

**Besluit tot nu toe:**
- Huidige chips: uniform donker navy icoonvlak (`#1B3050`), titelkleur volgt hoogste ernst (rood/oranje/groen).
- Voorstel: icoon + kopachtergrond krijgen categoriekleur (pastel), buitenrand + verticale scheidingslijn = donkere variant van die kleur. "Alle Issues"-chip blijft donker als anker.

**Why:** Categoriekleur geeft snellere visuele herkenning (icoonkleur = categorie, titelkleur = ernst = twee signalen in één chip). Risico: 8 chips × 8 kleuren kan druk ogen — nog te beoordelen in de echte UI.

**How to apply:** Bij het implementeren van de nieuwe analyse-wizard deze discussie oppakken en de chip-stijl definitief vaststellen vóór productie.

**Referentie mockup:** https://claude.ai/code/artifact/fc34e6e9-c487-45f2-a0c6-dd532dd275d5 (stap 3 "Chip-voorbeeld" toont Huidig vs. Voorstel naast elkaar).

**Lokaal mockup-bestand:** `C:\Users\alexx\AppData\Local\Temp\claude\c--Users-alexx-Dropbox-Documentscreening\aaf51451-00e7-4d88-ba07-0617a56385a7\scratchpad\mockup-analyse.html`
