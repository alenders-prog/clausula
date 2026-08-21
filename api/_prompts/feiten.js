/**
 * api/_prompts/feiten.js — vaststaande dossierfeiten voor de analyse
 *
 * Aanleiding (21 augustus 2026): een ouderschapsplan kreeg het issue "Ontbinding
 * geregistreerd partnerschap vermeld, terwijl document een huwelijk betreft", met
 * het advies om overal "huwelijk" van te maken. Partijen zijn geregistreerd
 * partners — het convenant zegt dat met zoveel woorden.
 *
 * Het model leidde de relatievorm af uit twee dingen: het woord "echtscheiding"
 * elders in de tekst, en een sectie "Bruiloft van familie en ouders" die gaat over
 * de mógelijkheid dat een ouder later trouwt. Een voorwaardelijke passage over de
 * toekomst, gelezen als een feit over het heden.
 *
 * De oorzaak is structureel: `situatie_kenmerken` werd alleen gebruikt om
 * wetsartikelen te selecteren en de checklist te filteren. In de prompt zelf stond
 * nergens wat er al vaststaat, dus moest het model het afleiden — en in een
 * ouderschapsplan staat de relatievorm meestal helemaal niet.
 */

// Alleen kenmerken die een fout oordeel kunnen veroorzaken als het model ze zelf
// moet raden. De volledige taxonomie hier herhalen maakt de prompt lang zonder dat
// het iets toevoegt.
const FEIT_PER_KENMERK = {
  // Relatievorm — juridisch bepalend voor terminologie én toepasselijke artikelen
  huwelijk:                    'Partijen zijn gehuwd. De juiste term is "echtscheiding".',
  geregistreerd_partnerschap:  'Partijen hebben een GEREGISTREERD PARTNERSCHAP, geen huwelijk. '
                             + 'De juiste term is "ontbinding van het geregistreerd partnerschap".',
  samenwonend_met_contract:    'Partijen wonen samen met een samenlevingscontract; er is geen huwelijk '
                             + 'of geregistreerd partnerschap.',
  samenwonend_zonder_contract: 'Partijen wonen samen zonder samenlevingscontract; er is geen huwelijk '
                             + 'of geregistreerd partnerschap.',

  // Vermogensregime
  gemeenschap_van_goederen:    'Er is een gemeenschap van goederen.',
  huwelijkse_voorwaarden:      'Er zijn huwelijkse voorwaarden of partnerschapsvoorwaarden.',
  huwelijk_voor_2018:          'De verbintenis dateert van vóór 1-1-2018 (algehele gemeenschap, oud recht).',
  huwelijk_na_2018:            'De verbintenis dateert van ná 1-1-2018 (beperkte gemeenschap, art. 1:94 BW nieuw).',

  // Gezin
  geen_kinderen:               'Er zijn geen minderjarige kinderen.',
  kinderen_minderjarig:        'Er zijn minderjarige kinderen.',
};

/**
 * Bouwt het feitenblok. Leeg als er geen bruikbare kenmerken zijn — dan verandert
 * er niets aan het bestaande gedrag.
 */
export function bouwFeitenBlok(situatieKenmerken) {
  const kenmerken = Array.isArray(situatieKenmerken) ? situatieKenmerken : [];
  const feiten = kenmerken.map(k => FEIT_PER_KENMERK[k]).filter(Boolean);
  if (!feiten.length) return '';

  return `VASTSTAANDE FEITEN OVER DIT DOSSIER:
Deze gegevens zijn vastgesteld bij de intake en gelden voor álle documenten in dit dossier,
ook als het document dat je nu beoordeelt ze niet noemt.
${feiten.map(f => `- ${f}`).join('\n')}

Behandel deze feiten als gegeven:
1. Spreek ze NOOIT tegen en stel nooit voor om het document eraan aan te passen in de
   andere richting. Wijkt de terminologie in het document af van de vastgestelde
   relatievorm, dan is het DOCUMENT wat gecorrigeerd moet worden — nooit het feit.
2. Leid ze NIET opnieuw af uit de tekst. Een document dat de relatievorm niet noemt is
   daarmee niet onvolledig op dit punt, en zeker geen bewijs voor een andere vorm.
3. VOORWAARDELIJKE EN TOEKOMSTIGE PASSAGES ZEGGEN NIETS OVER DE HUIDIGE SITUATIE.
   Een bepaling die begint met "indien", "mocht", "in de toekomst" of die gaat over wat
   een ouder later zou kunnen doen — hertrouwen, samenwonen, verhuizen — beschrijft een
   scenario, geen feit. Baseer daar nooit een conclusie op over de status van partijen.`;
}
