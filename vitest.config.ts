import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
const isRemote = network !== 'local';

// For remote networks, source secrets (e.g. MIDNIGHT_PREVIEW_SEED) from
// .env.<network> so they don't need to be passed on the command line.
// Shell env still wins over file values.
const envFromFile = isRemote ? loadEnv(network, process.cwd(), '') : {};

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // No hook/test timeouts: wallet sync and DUST generation can take
    // arbitrarily long on a live network, so tests wait as long as needed.
    hookTimeout: Infinity,
    testTimeout: Infinity,
    env: envFromFile,
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    sequence: { concurrent: false },
  },
});
