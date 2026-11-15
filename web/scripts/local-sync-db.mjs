import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
// Local-only D1 adapter: the hosted Worker uses the platform's real D1 binding.
// Pass a file path to keep accounts and journal entries across restarts.
export function localSyncDB(path=':memory:') {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const sqlite=new DatabaseSync(path), folder=new URL('../drizzle/',import.meta.url);
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY NOT NULL)');
  for(const file of readdirSync(folder).filter(name=>name.endsWith('.sql')).sort()) {
    if(sqlite.prepare('SELECT tag FROM local_migrations WHERE tag = ?').get(file)) continue;
    sqlite.exec(readFileSync(new URL(file,folder),'utf8')); sqlite.prepare('INSERT INTO local_migrations (tag) VALUES (?)').run(file);
  }
  return {sqlite, withSession(){return this;}, prepare(sql){
    const statement=sqlite.prepare(sql);
    return {bind(...args){return {async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:statement.run(...args).changes}};}};}};
  },async batch(statements){sqlite.exec('BEGIN'); try {const results=[]; for(const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results;} catch(e){sqlite.exec('ROLLBACK'); throw e;}}};
}
