import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../server/server.ts';
import { createMysqlFixture } from '../tests/helpers/mysql-fixture.mjs';

/** API real com MySQL descartável. Nunca usa nem limpa oscar_local. */
export async function createAcademicFixture({ port = 0, seed = true, origin = 'http://127.0.0.1:4201' } = {}) {
  const fixture = await createMysqlFixture({ seed });
  let api;
  let closed = false;
  try {
    api = createApi({ store: fixture.store, secureCookies: false, runMaintenance: false,
      allowedOrigins: [origin], appOrigin: origin });
    api.server.listen(port, '127.0.0.1');
    await once(api.server, 'listening');
    return { api, store: fixture.store, baseUrl: 'http://127.0.0.1:' + api.server.address().port + '/api',
      identity: fixture.identity,
      async close() {
        if (closed) return;
        closed = true;
        try { await api.close(); } finally { await fixture.release(); }
      } };
  } catch (error) {
    if (api?.server.listening) await api.close();
    else await fixture.store.close();
    await fixture.release();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await createAcademicFixture({ port: Number(process.env.OSCAR_ACADEMIC_PORT || 4302) });
  console.log('API para apresentação e Postman: ' + fixture.baseUrl);
  console.log('Banco reiniciado: oscar_test, MySQL ' + fixture.identity.version + '.');
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
