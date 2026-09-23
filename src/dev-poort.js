/**
 * src/dev-poort.js — de poort van de lokale dev-server, op één plek
 *
 * ── AANLEIDING (22 september 2026) ──────────────────────────────────────────
 *
 * Clausula en de MfN-trainer draaiden allebei op 3000. Dat gaat goed tot er één
 * toevallig aanstaat: dan krijg je op `localhost:3000` gewoon de ándere app, met een
 * 200 en zonder enige foutmelding. Het kostte twee mislukte draaien van
 * `scripts/toon-vergelijking.mjs`, die keurig meldde dat `#dossierLijst` niet verscheen
 * — wat klopte, want dat element bestaat daar niet.
 *
 * Een waarschuwing in een bestand ondervangt dat niet; die moet je elke keer onthouden.
 * Een eigen vaste poort wel.
 *
 * ── WAAROM 3200 ─────────────────────────────────────────────────────────────
 *
 * 3000 blijft van de trainer, die daar zijn standaard heeft. 3100 gebruikte hij als
 * tijdelijke uitwijk zolang wij 3000 bezet hielden, dus die is ook bezet geweest. 3001
 * is hier al van de statische server van Playwright (zie `playwright.config.js`).
 * 3200 is vrij en blijft dat.
 *
 * ── DIT IS DE BRON ──────────────────────────────────────────────────────────
 *
 * Alles wat de lokale server aanspreekt leest hieruit: de eval, het toonscript, en de
 * `dev`-opdracht in `package.json`. Die laatste kan geen JS importeren, dus daar staat
 * het getal opnieuw — `tests/unit/dev-poort.test.js` bewaakt dat de twee gelijk zijn.
 * Zonder die wachter drijft het npm-script stil af van de rest.
 */

/** De poort waarop `npm run lokaal` luistert. */
export const DEV_POORT = 3200;

/** Het adres van de lokale dev-server. */
export const DEV_ADRES = `http://localhost:${DEV_POORT}`;
