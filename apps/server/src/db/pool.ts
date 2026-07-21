import sql from 'mssql';

export interface DbConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectTimeoutMs: number;
}

/**
 * Build the mssql driver config. The cold-start budget (connectTimeoutMs)
 * must cover BOTH timers that race an Azure SQL serverless resume: tedious's
 * connectionTimeout AND tarn's pool acquireTimeoutMillis — the latter
 * defaults to 30s, which is shorter than a resume (30-60s), so without it
 * the first request after every auto-pause failed with a 500.
 */
export function mssqlConfigFrom(config: DbConfig): sql.config {
  return {
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    pool: { max: 10, min: 0, acquireTimeoutMillis: config.connectTimeoutMs },
    connectionTimeout: config.connectTimeoutMs,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
    },
  };
}

/** Open a connection pool. Callers own the pool and must close() it. */
export async function connectPool(config: DbConfig): Promise<sql.ConnectionPool> {
  return new sql.ConnectionPool(mssqlConfigFrom(config)).connect();
}
