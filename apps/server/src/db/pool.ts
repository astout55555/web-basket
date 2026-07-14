import sql from 'mssql';

export interface DbConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/**
 * Dev-container defaults (docker-compose.dev.yml), overridable via the same
 * env vars production uses. Production config is parsed strictly in
 * config.ts (chunk 4) — this helper is for local dev and tests only, which is
 * why trusting the server's self-signed certificate is the default here.
 */
export function devDbConfig(): DbConfig {
  return {
    server: process.env.AZURE_SQL_SERVER ?? 'localhost',
    port: Number(process.env.AZURE_SQL_PORT ?? 1433),
    database: process.env.AZURE_SQL_DATABASE ?? 'webbasket',
    user: process.env.AZURE_SQL_USER ?? 'sa',
    password: process.env.AZURE_SQL_PASSWORD ?? 'LocalDev1!Passw0rd',
    encrypt: true,
    trustServerCertificate: (process.env.AZURE_SQL_TRUST_SERVER_CERT ?? 'true') === 'true',
  };
}

/** Open a connection pool. Callers own the pool and must close() it. */
export async function connectPool(config: DbConfig): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    pool: { max: 10, min: 0 },
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
    },
  });
  return pool.connect();
}
