import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests don't spin up the Cloudflare plugin.
export default defineConfig({
  test: { include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.ts'] },
});
