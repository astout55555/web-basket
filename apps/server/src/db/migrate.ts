import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';

/**
 * Minimal forward-only migration runner: applies each not-yet-applied
 * `*.sql` file in `dir` (lexicographic order) inside its own transaction and
 * records it in `schema_migrations`. No down-migrations, no GO batches —
 * deliberately small; each file must be a single valid T-SQL batch.
 *
 * Returns the file names applied in this run.
 */
export async function runMigrations(pool: sql.ConnectionPool, dir: string): Promise<string[]> {
  await pool.request().batch(
    `IF OBJECT_ID('schema_migrations', 'U') IS NULL
       CREATE TABLE schema_migrations (
         name       NVARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
       );`,
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const appliedResult = await pool
    .request()
    .query<{ name: string }>('SELECT name FROM schema_migrations');
  const alreadyApplied = new Set(appliedResult.recordset.map((r) => r.name));

  const appliedNow: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const script = await readFile(path.join(dir, file), 'utf8');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).batch(script);
      await new sql.Request(tx)
        .input('name', sql.NVarChar(255), file)
        .query('INSERT INTO schema_migrations (name) VALUES (@name)');
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw new Error(`migration ${file} failed`, { cause: err });
    }
    appliedNow.push(file);
  }
  return appliedNow;
}
