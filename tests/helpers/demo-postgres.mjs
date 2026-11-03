import { createStore } from '../../server/store.mjs';
import { ENTITY_RELATIONS } from '../../server/postgres-store.mjs';

/** Somente testes: copia dados fictícios para PostgreSQL WASM sem conexão externa. */
export async function seedPgDemo(fixture) {
  const legacy = createStore({ filename: ':memory:', seed: true });
  try {
    for (const [table, relations] of Object.entries(ENTITY_RELATIONS)) {
      for (const record of legacy.list(table).sort((a, b) => a.id - b.id)) {
        const columns = ['id', 'data', ...relations.map(key => key.toLowerCase())];
        const values = [record.id, JSON.stringify(record), ...relations.map(key => record[key] ?? null)];
        if (table === 'users') {
          columns.push('email', 'passwordhash');
          values.push(record.email, legacy.db.prepare('SELECT passwordHash FROM users WHERE id=?').get(record.id).passwordHash);
        }
        await fixture.db.query(`INSERT INTO oscar_private.${table} (${columns.join(',')}) VALUES (${values.map((_, index) => '$' + (index + 1)).join(',')})`, values);
      }
      const max = Math.max(0, ...legacy.list(table).map(record => record.id));
      await fixture.db.query("SELECT setval(pg_get_serial_sequence($1,'id'),$2,$3)", ['oscar_private.' + table, Math.max(1, max), max > 0]);
    }
    await fixture.store.saveSettings(legacy.settings());
  } finally { legacy.close(); }
}