import type sql from 'mssql';
import { deleteExpiredBaskets } from './db/baskets-repo';

/** Structural subset of pino's logger — keeps tests free of pino fakes. */
export interface RetentionLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface RetentionOpts {
  pool: sql.ConnectionPool;
  ttlDays: number;
  /** Sweep cadence; defaults to hourly (spec §9). */
  intervalMs?: number;
  log: RetentionLogger;
}

/**
 * TTL expiry lives in the app because Azure SQL Database has no SQL Agent
 * (spec §9). One immediate sweep on boot (a server that was down past a TTL
 * boundary catches up right away), then an interval. A failed sweep logs and
 * waits for the next tick — a transient DB error must never crash the server
 * over housekeeping.
 *
 * Returns a stop function for shutdown.
 */
export function startRetentionSweep(opts: RetentionOpts): () => void {
  const intervalMs = opts.intervalMs ?? 60 * 60 * 1000;

  const sweep = async () => {
    try {
      const deleted = await deleteExpiredBaskets(opts.pool, opts.ttlDays);
      if (deleted > 0) {
        opts.log.info({ deleted, ttlDays: opts.ttlDays }, 'expired baskets removed');
      }
    } catch (err) {
      opts.log.error({ err }, 'retention sweep failed; will retry next interval');
    }
  };

  void sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
