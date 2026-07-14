import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies dev-friendly defaults when env is empty', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.publicBaseUrl).toBe('http://localhost:3000');
    expect(config.bodyMaxBytes).toBe(262_144);
    expect(config.basketRequestCap).toBe(200);
    expect(config.basketTtlDays).toBe(7);
    expect(config.db.server).toBe('localhost');
    expect(config.db.database).toBe('webbasket');
  });

  it('defaults trustServerCertificate to false (secure); dev opts in explicitly', () => {
    expect(loadConfig({}).db.trustServerCertificate).toBe(false);
    expect(loadConfig({ AZURE_SQL_TRUST_SERVER_CERT: 'true' }).db.trustServerCertificate).toBe(
      true,
    );
  });

  it('coerces numeric env strings', () => {
    const config = loadConfig({ PORT: '8080', BODY_MAX_BYTES: '1024' });
    expect(config.port).toBe(8080);
    expect(config.bodyMaxBytes).toBe(1024);
  });

  it('rejects garbage numeric values instead of silently defaulting', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow();
    expect(() => loadConfig({ BASKET_TTL_DAYS: '-1' })).toThrow();
  });

  it('rejects a malformed PUBLIC_BASE_URL', () => {
    expect(() => loadConfig({ PUBLIC_BASE_URL: 'not a url' })).toThrow();
  });
});
