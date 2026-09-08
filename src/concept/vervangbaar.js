/**
 * src/concept/vervangbaar.js — mag deze conceptwijziging überhaupt gezocht worden?
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * Een mediator meldde dat van twee identieke correcties er één niet werd doorgevoerd. De
 * console liet het zien: van twaalf wijzigingen werden er elf gelogd, item 11 ontbrak.
 *
 *     [concept] Vervangen item 10 » Indien vader/moeder gaat samenwonen…
 *     [concept] Vervangen item 12 » etc.:
 *
 * De oorzaak stond in één regel: `if (!normOrig || normOrig.length < 5) continue;`
 *
 * De ene correctie zocht `etc.:` (vijf tekens, ging door), de andere `etc:` (vier tekens,
 * viel eronder). Er werd niets gelogd, dus van buiten leek het alsof de wijziging gewoon
 * niet nodig was — terwijl de kaart in het rapport hem wél toonde.
 *
 * ── DE GRENS BLIJFT, MAAR LAGER, EN NOOIT MEER STIL ─────────────────────────
 *
 * Er moet een ondergrens zijn. De zoekopdracht vervangt het eerste voorkomen, dus een
 * origineel van twee tekens ("de") zou het eerste beste woord in het document raken. Dat
 * is erger dan een overgeslagen correctie: dan staat er iets fout in het concept en niemand
 * die het aanwijst.
 *
 * Drie tekens laat de gevallen door die zich in de praktijk voordoen — `etc:`, `etc.`,
 * `nr:` — en houdt lidwoorden en voorzetsels buiten. Het is een grens en geen wet; wie hem
 * verlaagt moet bedenken dat het risico niet lengte is maar dubbelzinnigheid.
 *
 * **Wat hier niet wordt opgelost.** Twee correcties die precies hetzelfde zoeken werken
 * omdat de eerste vervanging het eerste voorkomen wegneemt, waarna de tweede het volgende
 * vindt. Dat is toeval dat goed uitpakt, geen ontwerp. Wie dit echt sluitend wil, moet het
 * model om context rond de te vervangen tekst vragen in plaats van om de tekst alleen.
 *
 * De reden komt altijd terug, zodat de aanroeper hem kan loggen. Stil overslaan is wat
 * deze fout een half jaar onzichtbaar hield.
 */

/** Onder deze lengte is "het eerste voorkomen" te vaak het verkeerde voorkomen. */
export const MIN_LENGTE = 3;

/**
 * @param {string} normOrig  de genormaliseerde te zoeken tekst
 * @returns {{ok: boolean, reden: string}} reden is leeg als het mag
 */
export function magZoeken(normOrig) {
  const t = String(normOrig ?? '');
  if (!t.trim()) return { ok: false, reden: 'lege originele tekst' };
  if (t.length < MIN_LENGTE) {
    return { ok: false, reden: `originele tekst is ${t.length} teken(s), minder dan ${MIN_LENGTE} — te kort om het juiste voorkomen aan te wijzen` };
  }
  return { ok: true, reden: '' };
}
