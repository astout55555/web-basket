import { describe, expect, it } from 'vitest';
import type { DbConfig } from './pool';
import { mssqlConfigFrom } from './pool';

const config: DbConfig = {
  server: 'db.example.test',
  port: 1433,
  database: 'webbasket',
  user: 'app',
  password: 'pw',
  encrypt: true,
  trustServerCertificate: false,
  connectTimeoutMs: 60_000,
};

describe('mssqlConfigFrom', () => {
  it('applies the cold-start budget to BOTH the connection and the pool acquire', () => {
    const cfg = mssqlConfigFrom(config);
    expect(cfg.connectionTimeout).toBe(60_000);
    // Azure SQL serverless resume takes 30-60s; tarn's default 30s acquire
    // timeout fired first and 500'd the first request after every pause
    // (verified in prod 2026-07-20: 500 in 30.5s, immediate retry 201).
    expect(cfg.pool?.acquireTimeoutMillis).toBe(60_000);
  });

  it('passes through the connection fields', () => {
    const cfg = mssqlConfigFrom(config);
    expect(cfg.server).toBe('db.example.test');
    expect(cfg.database).toBe('webbasket');
    expect(cfg.options?.encrypt).toBe(true);
    expect(cfg.options?.trustServerCertificate).toBe(false);
  });
});
