import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
// Local-only D1 adapter: the hosted Worker uses the platform's real D1 binding.
export function localSyncDB() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_crew_sync.sql',import.meta.url),'utf8'));
  return {sqlite, withSession(){return this;}, prepare(sql){
    const statement=sqlite.prepare(sql);
    return {bind(...args){return {async first(){return statement.get(...args)||null;},async run(){return {meta:{changes:statement.run(...args).changes}};}};}};
  },async batch(statements){sqlite.exec('BEGIN'); try {const results=[]; for(const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results;} catch(e){sqlite.exec('ROLLBACK'); throw e;}}};
}
