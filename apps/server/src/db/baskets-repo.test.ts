import sql from 'mssql';
import { describe, expect, it } from 'vitest';
import { isMissingBasketError } from './baskets-repo';

describe('isMissingBasketError', () => {
  it('is true only for a SQL Server 547 (constraint) RequestError', () => {
    const fk = new sql.RequestError('conflict');
    (fk as { number: number }).number = 547;
    expect(isMissingBasketError(fk)).toBe(true);
  });

  it('is false for other SQL errors and non-SQL errors', () => {
    const deadlock = new sql.RequestError('deadlock');
    (deadlock as { number: number }).number = 1205;
    expect(isMissingBasketError(deadlock)).toBe(false);
    expect(isMissingBasketError(new Error('nope'))).toBe(false);
    expect(isMissingBasketError(null)).toBe(false);
  });
});
