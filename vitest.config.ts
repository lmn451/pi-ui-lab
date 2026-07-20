import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    // pi-test-harness@1.0.3 expects the compatibility model catalog while
    // newer pi-ai publishes it as a subpath.
    alias: {
      '@earendil-works/pi-ai/compat': fileURLToPath(new URL('./node_modules/@earendil-works/pi-ai/dist/compat.js', import.meta.url)),
      '@earendil-works/pi-ai': fileURLToPath(new URL('./node_modules/@earendil-works/pi-ai/dist/compat.js', import.meta.url)),
    },
  },
  ssr: { noExternal: ['@gaodes/pi-test-harness', '@earendil-works/pi-ai'] },
});
