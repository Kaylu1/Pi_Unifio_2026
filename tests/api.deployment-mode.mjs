import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApi, createConfiguredPostgresStore } from '../server/server.ts';

const target = 'postgresql://postgres.kotiorssahochknggjzc:temporary-test-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

test('preparo PostgreSQL aceita somente o projeto dedicado e preserva CA e pool de uma conexão', async () => {
  let received;
  const repository = { dialect: 'postgres' };
  const factory = async options => { received = options; return repository; };
  assert.equal(await createConfiguredPostgresStore({ connectionString: target, sslCa: 'certificate-from-local-config' }, factory), repository);
  assert.deepEqual(received, { connectionString: target, sslCa: 'certificate-from-local-config', max: 1 });

  let connections = 0;
  await assert.rejects(() => createConfiguredPostgresStore({ connectionString: target.replace('kotiorssahochknggjzc', 'otherprojectreference') },
    async () => { connections++; return repository; }), /projeto Supabase exclusivo do OScar/);
  assert.equal(connections, 0, 'o alvo inválido deve ser recusado antes da conexão');
});

test('health distingue ambiente de implantação do driver de banco', async t => {
  for (const { database, deploymentMode, expected } of [
    { database: 'mysql', expected: 'local' },
    { database: 'postgres', expected: 'local' },
    { database: 'postgres', deploymentMode: 'cloud', expected: 'cloud' },
  ]) {
    await t.test(database + '/' + expected, async () => {
      const api = createApi({ store: { dialect: database, close: async () => {} }, runMaintenance: false,
        ...(deploymentMode ? { deploymentMode } : {}) });
      api.server.listen(0, '127.0.0.1');
      await once(api.server, 'listening');
      try {
        const response = await fetch('http://127.0.0.1:' + api.server.address().port + '/api/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok', mode: expected, database });
      } finally { await api.close(); }
    });
  }
});
