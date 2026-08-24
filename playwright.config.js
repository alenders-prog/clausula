import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 1,
  // Standaard wachttijd voor assertions — de enige plek waar die staat. Geef hem in
  // een test alleen expliciet mee als je bewust wilt afwijken, zoals de 45 seconden
  // op #dossierLijst waar de hele pagina nog moet laden.
  //
  // Waarom 20 en niet 5: de smoketests stonden op 5-10 seconden en werden af en toe
  // rood zonder dat er iets stuk was. Zie de toelichting bij `workers` hieronder voor
  // wat daar op 24 augustus 2026 achter zat. De wachttijd is niet wat een smoketest
  // toetst — dat is of het scherm überhaupt rendert — dus ruimer maken kost niets aan
  // zeggingskracht.
  //
  // Let op: `waitForSelector` leest deze waarde níét; die heeft zijn eigen standaard.
  // Daar blijft een expliciete timeout dus wél nodig.
  expect: { timeout: 20_000 },
  // Eén worker. Zeven tests draaien serieel in ~12 seconden, dus parallellisme levert
  // hier niets op — het kostte juist betrouwbaarheid: twee workers laadden tegelijk
  // een index.html van 700 kB op een koud gestarte testserver, en dan haalde een
  // assertie soms zijn wachttijd niet. Op 24 augustus 2026 viel een volle run daardoor
  // terug op vier van de zeven.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 60_000,
  },
  webServer: {
    command: 'npx serve . --listen 3001 --no-clipboard',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
