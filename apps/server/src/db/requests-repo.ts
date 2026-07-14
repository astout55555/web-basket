import type { RequestRecord } from '@web-basket/shared';
import sql from 'mssql';

/** What the sink captures — everything but the DB-assigned id/timestamp. */
export interface NewRequest {
  basketId: number;
  method: string;
  path: string;
  query: string | null;
  headers: Record<string, string | string[]>;
  body: Buffer | null;
  bodySize: number;
  truncated: boolean;
  contentType: string | null;
  remoteIp: string | null;
  /** Ring-buffer cap: prune the basket to this many rows after inserting. */
  requestCap: number;
}

/** A request as read back from the database (body still raw bytes). */
export interface StoredRequest {
  id: number;
  basketId: number;
  method: string;
  path: string;
  query: string | null;
  headers: Record<string, string | string[]>;
  body: Buffer | null;
  bodySize: number;
  truncated: boolean;
  contentType: string | null;
  remoteIp: string | null;
  receivedAt: Date;
}

/** Convert a stored request to the shared wire DTO (bytes → base64). */
export function toRequestRecord(stored: StoredRequest): RequestRecord {
  return {
    id: stored.id,
    method: stored.method,
    path: stored.path,
    query: stored.query,
    headers: stored.headers,
    bodyBase64: stored.body ? stored.body.toString('base64') : null,
    bodySize: stored.bodySize,
    truncated: stored.truncated,
    contentType: stored.contentType,
    remoteIp: stored.remoteIp,
    receivedAt: stored.receivedAt.toISOString(),
  };
}

/**
 * Record one sink hit. A single transaction covers: insert the request, bump
 * the basket's last_activity_at (feeds TTL expiry), and prune the basket to
 * its newest `requestCap` rows (spec §9 ring buffer).
 */
export async function insertRequest(
  pool: sql.ConnectionPool,
  req: NewRequest,
): Promise<StoredRequest> {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const inserted = await new sql.Request(tx)
      .input('basketId', sql.BigInt, req.basketId)
      .input('method', sql.NVarChar(16), req.method)
      .input('path', sql.NVarChar(2048), req.path)
      .input('query', sql.NVarChar(sql.MAX), req.query)
      .input('headers', sql.NVarChar(sql.MAX), JSON.stringify(req.headers))
      .input('body', sql.VarBinary(sql.MAX), req.body)
      .input('bodySize', sql.Int, req.bodySize)
      .input('truncated', sql.Bit, req.truncated)
      .input('contentType', sql.NVarChar(256), req.contentType)
      .input('remoteIp', sql.NVarChar(64), req.remoteIp)
      .query<{ id: string | number; received_at: Date }>(
        `INSERT INTO requests
           (basket_id, method, path, query, headers, body, body_size, truncated, content_type, remote_ip)
         OUTPUT INSERTED.id, INSERTED.received_at
         VALUES (@basketId, @method, @path, @query, @headers, @body, @bodySize, @truncated, @contentType, @remoteIp)`,
      );

    await new sql.Request(tx)
      .input('basketId', sql.BigInt, req.basketId)
      .query('UPDATE baskets SET last_activity_at = SYSUTCDATETIME() WHERE id = @basketId');

    await new sql.Request(tx)
      .input('basketId', sql.BigInt, req.basketId)
      .input('cap', sql.Int, req.requestCap)
      .query(
        `DELETE FROM requests
         WHERE basket_id = @basketId
           AND id NOT IN (
             SELECT TOP (@cap) id FROM requests
             WHERE basket_id = @basketId
             ORDER BY received_at DESC, id DESC
           )`,
      );

    await tx.commit();

    const row = inserted.recordset[0];
    if (!row) throw new Error('INSERT returned no row');
    return {
      id: Number(row.id),
      basketId: req.basketId,
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
      bodySize: req.bodySize,
      truncated: req.truncated,
      contentType: req.contentType,
      remoteIp: req.remoteIp,
      receivedAt: row.received_at,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

interface RawRequestRow {
  id: string | number;
  basket_id: string | number;
  method: string;
  path: string;
  query: string | null;
  headers: string;
  body: Buffer | null;
  body_size: number;
  truncated: boolean;
  content_type: string | null;
  remote_ip: string | null;
  received_at: Date;
}

/** Newest requests first, capped at `limit`. */
export async function listRequests(
  pool: sql.ConnectionPool,
  basketId: number,
  limit: number,
): Promise<StoredRequest[]> {
  const result = await pool
    .request()
    .input('basketId', sql.BigInt, basketId)
    .input('limit', sql.Int, limit)
    .query<RawRequestRow>(
      `SELECT TOP (@limit) *
       FROM requests
       WHERE basket_id = @basketId
       ORDER BY received_at DESC, id DESC`,
    );

  return result.recordset.map((row) => ({
    id: Number(row.id),
    basketId: Number(row.basket_id),
    method: row.method,
    path: row.path,
    query: row.query,
    // Written by us via JSON.stringify (ISJSON-checked in the schema), so a
    // plain parse+cast is safe here.
    headers: JSON.parse(row.headers) as Record<string, string | string[]>,
    body: row.body,
    bodySize: row.body_size,
    truncated: row.truncated,
    contentType: row.content_type,
    remoteIp: row.remote_ip,
    receivedAt: row.received_at,
  }));
}
