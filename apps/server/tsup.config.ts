import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Workspace packages ship TS source, so they must be bundled into the output.
  noExternal: ['@web-basket/shared'],
});
