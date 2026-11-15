// D1-style database for hosts without Cloudflare D1 (Vercel): the same prepare/bind/first/all/run and
// batch calls the Worker code uses, over Turso's SQLite-compatible libSQL client.
import { createClient } from '@libsql/client';

const plain = result => result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]])));

/** `migrations` is [[fileName, sql], ...] in order. They run once per database, recorded in local_migrations. */
export function tursoDB({ url, authToken, migrations = [] }) {
  const client = createClient({ url, authToken });
  let ready = null;
  const migrate = () => ready ??= (async () => {
    await client.execute('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY NOT NULL)');
    const done = new Set((await client.execute('SELECT tag FROM local_migrations')).rows.map(row => row.tag));
    for (const [tag, sql] of migrations) {
      if (done.has(tag)) continue;
      await client.executeMultiple(sql);
      await client.execute({ sql: 'INSERT OR IGNORE INTO local_migrations (tag) VALUES (?)', args: [tag] });
    }
  })().catch(error => { ready = null; throw error; });
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...values) => statement(sql, values),
    async first() { await migrate(); return plain(await client.execute({ sql, args }))[0] ?? null; },
    async all() { await migrate(); return { results: plain(await client.execute({ sql, args })) }; },
    async run() { await migrate(); return { meta: { changes: (await client.execute({ sql, args })).rowsAffected } }; },
  });
  return {
    client, migrate,
    withSession() { return this; },
    prepare: sql => statement(sql),
    // One transaction, like D1's batch: all statements apply or none do.
    async batch(statements) {
      await migrate();
      const results = await client.batch(statements.map(({ sql, args }) => ({ sql, args })), 'write');
      return results.map(result => ({ meta: { changes: result.rowsAffected } }));
    },
  };
}
