/**
 * src/verificatie/stroom-status.js
 * Houdt bij of een streamend antwoord af is, en splitst het in analyse + voorstel.
 *
 * Aanleiding (23 augustus 2026). De extra verificatie leest de SSE-stroom van
 * `/api/claude-edge` uit en stapelt hem op in één string. Werd die stroom halverwege
 * afgekapt — de functie loopt over zijn tijdslimiet, of Claude raakt `max_tokens` —
 * dan eindigde de leeslus gewoon met `done: true`. Niet te onderscheiden van een
 * normaal einde.
 *
 * De code toonde de halve analyse alsof hij compleet was, vond het afsluitende
 * `---VOORSTEL---`-blok niet, en liet `_voorstel` op null staan. De knop "issue
 * aanpassen op basis van deze analyse" deed dan niets. Geen melding, geen logregel,
 * geen enkel spoor.
 *
 * Anthropic zégt het wel: `message_delta` draagt de `stop_reason`, en `message_stop`
 * sluit af. Ontbreken die, dan is het antwoord onderweg afgebroken.
 */

const SCHEIDING = '\n---VOORSTEL---\n';

/**
 * Splitst de opgestapelde tekst in het leesbare deel en het JSON-voorstel.
 * Werkt ook halverwege de stroom: is de scheiding nog niet binnen, dan is alles
 * analyse.
 */
export function splitsAnalyse(ruw) {
  const tekst = String(ruw ?? '');
  const i = tekst.indexOf(SCHEIDING);
  if (i === -1) {
    // De scheiding kan half binnen zijn ("\n---VOOR"). Toon die restanten niet.
    const staart = tekst.slice(-SCHEIDING.length);
    for (let n = SCHEIDING.length - 1; n > 2; n--) {
      if (staart.endsWith(SCHEIDING.slice(0, n))) return { analyse: tekst.slice(0, tekst.length - n), voorstelRuw: '' };
    }
    return { analyse: tekst, voorstelRuw: '' };
  }
  return {
    analyse:     tekst.slice(0, i).trim(),
    voorstelRuw: tekst.slice(i + SCHEIDING.length).trim(),
  };
}

/** Leest het voorstel-JSON, of geeft null als het er niet (compleet) is. */
export function leesVoorstel(voorstelRuw) {
  const t = String(voorstelRuw ?? '').trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Bepaalt of het antwoord af is, en zo nee: wat de gebruiker moet weten.
 *
 * @param {{stopReason?: string|null, kreegStop?: boolean, heeftVoorstel?: boolean}} status
 * @returns {{compleet: boolean, melding: string｜null}}
 */
export function beoordeelAfronding({ stopReason = null, kreegStop = false, heeftVoorstel = false } = {}) {
  if (stopReason === 'max_tokens') {
    return {
      compleet: false,
      melding: 'Deze analyse is afgekapt omdat hij de maximale lengte bereikte. '
             + 'Wat hierboven staat klopt, maar het slot ontbreekt — en er is geen '
             + 'voorstel om het issue mee aan te passen.',
    };
  }

  if (!kreegStop) {
    return {
      compleet: false,
      melding: 'De verbinding viel weg voordat de analyse af was. Wat hierboven staat '
             + 'klopt, maar is onvolledig. Probeer het opnieuw.',
    };
  }

  // Het antwoord is netjes afgerond, maar het voorstel-blok ontbreekt of was
  // onleesbaar. Dan is de analyse bruikbaar en de aanpasknop niet.
  if (!heeftVoorstel) {
    return {
      compleet: true,
      melding: 'Deze analyse bevat geen voorstel om het issue mee aan te passen; '
             + 'je kunt hem wel als toelichting gebruiken.',
    };
  }

  return { compleet: true, melding: null };
}
