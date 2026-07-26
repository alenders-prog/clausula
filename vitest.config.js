import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    coverage: {
      provider: 'v8',
      include:  ['api/**/*.js'],
      exclude:  ['api/analyseer.js', 'api/claude-edge.js'], // te groot / te externe afhankelijkheden
    },
  },
});
