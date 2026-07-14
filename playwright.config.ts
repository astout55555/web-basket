import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke: runs against the BUILT app (tsup server serving the Vite dist),
 * i.e. the same shape production runs — not the dev servers. Needs the dev
 * SQL Server container up (docker compose -f docker-compose.dev.yml up -d).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3100',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'pnpm build && pnpm --filter @web-basket/server db:migrate && node apps/server/dist/server.js',
    url: 'http://localhost:3100/healthz',
    env: {
      PORT: '3100',
      AZURE_SQL_DATABASE: 'webbasket_e2e',
      AZURE_SQL_TRUST_SERVER_CERT: 'true',
      WEB_DIST_DIR: 'apps/web/dist',
    },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
