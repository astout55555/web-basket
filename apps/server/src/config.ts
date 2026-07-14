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
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  BODY_MAX_BYTES: z.coerce.number().int().positive().default(262_144),
  BASKET_REQUEST_CAP: z.coerce.number().int().positive().default(200),
  BASKET_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BASKET_CREATE_PER_MINUTE: z.coerce.number().int().positive().default(10),
  AZURE_SQL_SERVER: z.string().default('localhost'),
  AZURE_SQL_PORT: z.coerce.number().int().positive().default(1433),
  AZURE_SQL_DATABASE: z.string().default('webbasket'),
  AZURE_SQL_USER: z.string().default('sa'),
  AZURE_SQL_PASSWORD: z.string().default('LocalDev1!Passw0rd'),
  AZURE_SQL_TRUST_SERVER_CERT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export interface AppConfig {
  port: number;
  publicBaseUrl: string;
  bodyMaxBytes: number;
  basketRequestCap: number;
  basketTtlDays: number;
  basketCreatePerMinute: number;
  db: DbConfig;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    bodyMaxBytes: parsed.BODY_MAX_BYTES,
    basketRequestCap: parsed.BASKET_REQUEST_CAP,
    basketTtlDays: parsed.BASKET_TTL_DAYS,
    basketCreatePerMinute: parsed.BASKET_CREATE_PER_MINUTE,
    db: {
      server: parsed.AZURE_SQL_SERVER,
      port: parsed.AZURE_SQL_PORT,
      database: parsed.AZURE_SQL_DATABASE,
      user: parsed.AZURE_SQL_USER,
      password: parsed.AZURE_SQL_PASSWORD,
      encrypt: true,
      trustServerCertificate: parsed.AZURE_SQL_TRUST_SERVER_CERT,
    },
  };
}
