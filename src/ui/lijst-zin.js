/**
 * src/ui/lijst-zin.js
 * Zet een lijst woorden om in een leesbare opsomming: "a, b en c".
 *
 * Klein, maar met genoeg randgevallen om te toetsen: nul, één, twee, en de vraag
 * waar de komma's ophouden en het voegwoord begint. Het alternatief — `join(', ')`
 * — levert "juridische toets, balans, grammatica" op, en dat leest als een
 * opsomming die halverwege is afgekapt.
 */

/**
 * @param {string[]} delen
 * @param {string} voegwoord  standaard "en"; "of" voor keuzes
 * @returns {string} lege string als er niets in zit
 */
export function lijstZin(delen, voegwoord = 'en') {
  const schoon = (delen || []).map(d => String(d ?? '').trim()).filter(Boolean);
  if (schoon.length === 0) return '';
  if (schoon.length === 1) return schoon[0];
  return `${schoon.slice(0, -1).join(', ')} ${voegwoord} ${schoon[schoon.length - 1]}`;
}
