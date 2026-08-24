import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 1,
  // Ruime standaard voor assertie-wachttijden. De testserver start koud op en er
  // draaien twee workers; met de oude waarden van 5-10s viel die marge soms weg en
  // werd een test af en toe rood zonder dat er iets stuk was. Een test die soms
  // faalt leert je zijn uitslag te negeren.
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
