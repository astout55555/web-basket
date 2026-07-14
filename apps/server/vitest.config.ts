import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests talk to the real SQL Server container; give the
    // drop/create/migrate setup room to breathe.
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
