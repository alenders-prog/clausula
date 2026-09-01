---
name: project_golden_tests
description: Herinnering om sample-output JSON toe te voegen aan golden schema tests na echte screenings
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-07-26T15:47:46.849Z
---

Golden schema tests in `tests/golden/schema.test.js` zijn klaar maar hebben nog geen testdata.

**Wat er ontbreekt:** `tests/golden/fixtures/sample-output-{naam}.json` bestanden met echte analyse-output.

**Hoe toevoegen:** Na een echte screening de JSON-output van de analyse opslaan als zo'n bestand. De test valideert dan automatisch het schema, passage-kwaliteit en dedup.

**Why:** Zonder deze bestanden slaat de test zichzelf over (`it.skip`). Met bestanden fungeren ze als regressiebescherming bij prompt-wijzigingen.

**How to apply:** Vraag de gebruiker hier regelmatig naar — zeker na sesies waarbij een nieuwe screening is gedaan of na prompt-aanpassingen.
