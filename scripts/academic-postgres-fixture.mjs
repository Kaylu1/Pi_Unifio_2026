import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../server/server.ts';
import { createPgFixture } from '../tests/helpers/postgres-fixture.mjs';
import { seedPgDemo } from '../tests/helpers/demo-postgres.mjs';

/** PostgreSQL local efêmero: aplica as migrações do Supabase em PGlite, sem conexão externa. */
export async function createAcademicPostgresFixture({ port = 0, seed = true, origin = 'http://127.0.0.1:4201' } = {}) {
  const fixture = await createPgFixture();
  let api;
  let closed = false;
  try {
    if (seed) await seedPgDemo(fixture);
    api = createApi({ store: fixture.store, secureCookies: false, runMaintenance: false,
      allowedOrigins: [origin], appOrigin: origin, emailTransport: async () => undefined });
    api.server.listen(port, '127.0.0.1');
    await once(api.server, 'listening');
    return {
      api, store: fixture.store,
      baseUrl: 'http://127.0.0.1:' + api.server.address().port + '/api',
      identity: { database: 'postgres', runtime: 'pglite', fixtureName: 'postgres_test', schema: 'oscar_private', remote: false },
      async close() {
        if (closed) return;
        closed = true;
        try { await api.close(); } finally { await fixture.close(); }
      },
    };
  } catch (error) {
    if (api) await api.close();
    await fixture.close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await createAcademicPostgresFixture({ port: Number(process.env.OSCAR_ACADEMIC_PORT || 4302) });
  console.log('API PostgreSQL para Postman: ' + fixture.baseUrl);
  console.log('Ambiente postgres_test: PGlite local, com migrações do Supabase e dados fictícios. Nenhum banco remoto foi acessado.');
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
