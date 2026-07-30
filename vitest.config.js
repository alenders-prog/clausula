import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    exclude:     ['**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include:  ['api/**/*.js', 'src/**/*.js'],
      exclude:  ['api/analyseer.js', 'api/claude-edge.js'], // te groot / te externe afhankelijkheden
    },
  },
});
