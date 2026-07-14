import { z } from 'zod';
import type { DbConfig } from './db/pool';

/**
 * All configuration enters through here, validated once at boot. Defaults are
 * dev-friendly (they match docker-compose.dev.yml) EXCEPT the security-
 * sensitive trustServerCertificate, which defaults to false — the dev script
 * opts in explicitly. A prod deployment overrides everything via .env.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  BODY_MAX_BYTES: z.coerce.number().int().positive().default(262_144),
  BASKET_REQUEST_CAP: z.coerce.number().int().positive().default(200),
  BASKET_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BASKET_CREATE_PER_MINUTE: z.coerce.number().int().positive().default(10),
  // Where the built SPA lives; relative paths resolve from the server's cwd.
  WEB_DIST_DIR: z.string().default('../web/dist'),
  // Behind a reverse proxy (Caddy in prod), req.ip must come from
  // X-Forwarded-For. Off by default: that header is attacker-settable when
  // clients reach the app directly.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  AZURE_SQL_SERVER: z.string().default('localhost'),
  AZURE_SQL_PORT: z.coerce.number().int().positive().default(1433),
  AZURE_SQL_DATABASE: z.string().default('webbasket'),
  AZURE_SQL_USER: z.string().default('sa'),
  AZURE_SQL_PASSWORD: z.string().default('LocalDev1!Passw0rd'),
  AZURE_SQL_TRUST_SERVER_CERT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Azure SQL serverless auto-pauses when idle; resuming can take ~30-60s,
  // longer than the driver's 15s default. Prod sets this higher.
  AZURE_SQL_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export interface AppConfig {
  port: number;
  bodyMaxBytes: number;
  basketRequestCap: number;
  basketTtlDays: number;
  basketCreatePerMinute: number;
  webDistDir: string;
  trustProxy: boolean;
  db: DbConfig;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    bodyMaxBytes: parsed.BODY_MAX_BYTES,
    basketRequestCap: parsed.BASKET_REQUEST_CAP,
    basketTtlDays: parsed.BASKET_TTL_DAYS,
    basketCreatePerMinute: parsed.BASKET_CREATE_PER_MINUTE,
    webDistDir: parsed.WEB_DIST_DIR,
    trustProxy: parsed.TRUST_PROXY,
    db: {
      server: parsed.AZURE_SQL_SERVER,
      port: parsed.AZURE_SQL_PORT,
      database: parsed.AZURE_SQL_DATABASE,
      user: parsed.AZURE_SQL_USER,
      password: parsed.AZURE_SQL_PASSWORD,
      encrypt: true,
      trustServerCertificate: parsed.AZURE_SQL_TRUST_SERVER_CERT,
      connectTimeoutMs: parsed.AZURE_SQL_CONNECT_TIMEOUT_MS,
    },
  };
}
