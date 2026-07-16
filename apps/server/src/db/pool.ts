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

/** Open a connection pool. Callers own the pool and must close() it. */
export async function connectPool(config: DbConfig): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    pool: { max: 10, min: 0 },
    connectionTimeout: config.connectTimeoutMs,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
    },
  });
  return pool.connect();
}
