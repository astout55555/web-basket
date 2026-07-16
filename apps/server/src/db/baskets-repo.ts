import sql from 'mssql';
import { generateBasketAddress } from '../address';

export interface BasketRow {
  id: number;
  address: string;
  createdAt: Date;
  lastActivityAt: Date;
}

interface RawBasketRow {
  id: string | number; // tedious returns BIGINT as string
  address: string;
  created_at: Date;
  last_activity_at: Date;
}

function mapBasket(row: RawBasketRow): BasketRow {
  return {
    // Safe while ids stay below 2^53; fine at this app's scale.
    id: Number(row.id),
    address: row.address,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  };
}

/** SQL Server error numbers for unique-constraint violations. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof sql.RequestError && (err.number === 2627 || err.number === 2601);
}

/**
 * SQL Server error 547 = a constraint violation. On a request INSERT the only
 * constraint that can fire is the foreign key to baskets, so this means the
 * basket was deleted between lookup and insert.
 */
export function isMissingBasketError(err: unknown): boolean {
  return err instanceof sql.RequestError && err.number === 547;
}

/**
 * Insert a basket with a fresh random address. Collisions are ~impossible
 * (71 bits of entropy) but cheap to handle: rely on the UNIQUE constraint and
 * retry with a new address rather than check-then-insert (which would race).
 */
export async function createBasket(
  pool: sql.ConnectionPool,
  generate: () => string = generateBasketAddress,
): Promise<BasketRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const address = generate();
    try {
      const result = await pool
        .request()
        .input('address', sql.NVarChar(32), address)
        .query<RawBasketRow>('INSERT INTO baskets (address) OUTPUT INSERTED.* VALUES (@address)');
      const row = result.recordset[0];
      if (!row) throw new Error('INSERT returned no row');
      return mapBasket(row);
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error('could not generate a unique basket address after 5 attempts');
}

export async function findBasketByAddress(
  pool: sql.ConnectionPool,
  address: string,
): Promise<BasketRow | null> {
  const result = await pool
    .request()
    .input('address', sql.NVarChar(32), address)
    .query<RawBasketRow>('SELECT TOP (1) * FROM baskets WHERE address = @address');
  const row = result.recordset[0];
  return row ? mapBasket(row) : null;
}

/** Delete a basket (requests cascade). Returns false if it did not exist. */
export async function deleteBasket(pool: sql.ConnectionPool, address: string): Promise<boolean> {
  const result = await pool
    .request()
    .input('address', sql.NVarChar(32), address)
    .query('DELETE FROM baskets WHERE address = @address');
  return (result.rowsAffected[0] ?? 0) > 0;
}

/** TTL sweep: remove baskets idle for more than ttlDays. Returns the deleted
 * addresses (so callers can close their live SSE connections). */
export async function deleteExpiredBaskets(
  pool: sql.ConnectionPool,
  ttlDays: number,
): Promise<string[]> {
  const result = await pool
    .request()
    .input('ttlDays', sql.Int, ttlDays)
    .query<{ address: string }>(
      `DELETE FROM baskets
       OUTPUT DELETED.address
       WHERE last_activity_at < DATEADD(day, -@ttlDays, SYSUTCDATETIME())`,
    );
  return result.recordset.map((r) => r.address);
}
