// Gedeelde meldfunctie voor de PostToolUse-hooks.
//
// Waarom dit bestaat (24 augustus 2026). Alle hooks hier schreven hun boodschap met
// console.log naar stdout en sloten af met exitcode 0. Dat is per ontwerp ONZICHTBAAR:
// een geslaagde hook laat niets achter in de UI, en de tekst bereikt ook de assistent
// niet. Ze draaiden dus keurig — gemeten met een spoorbestand op schijf — en hun
// meldingen kwamen bij niemand aan.
//
// Dat is dezelfde fout als de hook die alleen naar stdout keek terwijl de bevindingen
// op stderr stonden, en als de embedder die gewijzigde chunks nooit oppakte: de regel
// bestaat, draait, en heeft geen ontvanger.
//
// Het contract dat wél aankomt is JSON op stdout:
//   systemMessage                          → de gebruiker ziet het in de UI
//   hookSpecificOutput.additionalContext   → de assistent krijgt het in zijn context
//
// Let op: als een hook JSON teruggeeft, mag er niets ánders op stdout staan — anders
// is het geen geldige JSON meer en valt de melding alsnog stil. Print dus uitsluitend
// via deze functie.

/**
 * Meldt een boodschap aan zowel de gebruiker als de assistent.
 * Roep hem hoogstens één keer per hook aan, en zwijg als er niets te melden is.
 */
export function meld(boodschap) {
  const tekst = String(boodschap).trim();
  if (!tekst) return;
  process.stdout.write(JSON.stringify({
    systemMessage: tekst,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: tekst,
    },
  }));
}
