import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgFixture } from './helpers/postgres-fixture.mjs';
import { seedPgDemo } from './helpers/demo-postgres.mjs';
import { createPublicServiceRequest, serviceRequestRoutes } from '../server/service-requests.mjs';
import { orderRoutes } from '../server/order-routes.mjs';
import { anonymizeClient, purgeClientBackups } from '../server/privacy.mjs';

test('PGlite: exclusao de cliente apaga pedido vinculado dos snapshots antigos e impede restore de PII', async t => {
  const fixture = await createPgFixture();
  t.after(() => fixture.close());
  await seedPgDemo(fixture);
  const { store, db } = fixture;
  const manager = await store.get('users', 1);
  const privateText = 'Relato sigiloso de um pedido vinculado por identificador';
  const request = await store.transaction(() => createPublicServiceRequest(store, {
    name: 'Pessoa do pedido PostgreSQL', phone: '14999997766', vehicle: 'Polo informado',
    plate: '', symptoms: privateText, serviceIds: [1],
  }));
  const otherClient = await store.get('clients', 2);
  const owner = await store.get('clients', 1);
  const otherText = 'Relato preservado do outro titular PostgreSQL';
  const otherRequest = await store.save('service_requests', {
    name: otherClient.name, phone: owner.phone, vehicle: 'Veiculo de outro titular',
    plate: (await store.get('vehicles', 1)).plate, symptoms: otherText,
    clientId: otherClient.id, vehicleId: 2,
    serviceIds: [], services: [], total: 0, durationMinutes: 0, status: 'atendida',
  });
  const before = await store.backup({ day: '2026-11-01' });
  const original = (await db.query('SELECT data FROM oscar_private.backups WHERE id=$1', [before.id])).rows[0].data;
  assert.equal(original.records.service_requests.find(row => row.id === request.id).clientId, undefined);

  const confirmed = await store.transaction(() => serviceRequestRoutes({
    s: store, route: `/service-requests/${request.id}/confirm`, method: 'POST', user: manager,
    body: { clientId: 1, vehicleId: 1, date: '2030-06-12', time: '09:00',
      mechanicId: 3, contactConfirmed: true, acceptIdentityMismatch: true },
  }));
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.request.clientId, 1);
  assert.notEqual(confirmed.data.request.phone, (await store.get('clients', 1)).phone);
  const orderNote = 'Relato pessoal anotado na ordem PostgreSQL';
  const order = await store.transaction(() => orderRoutes({
    s: store, route: '/orders', method: 'POST', user: manager,
    body: { appointmentId: confirmed.data.appointment.id, approvalMethod: 'presencial',
      assessmentNotes: orderNote },
  }));
  assert.equal(order.status, 201);
  const after = await store.backup({ day: '2026-11-02' });
  const linkedSnapshot = (await db.query('SELECT data FROM oscar_private.backups WHERE id=$1', [after.id])).rows[0].data;
  assert.equal(linkedSnapshot.records.service_requests.find(row => row.id === request.id).clientId, 1);

  await store.transaction(() => anonymizeClient(store, 1, manager));
  assert.equal((await store.get('service_requests', request.id)).symptoms, '');
  assert.equal((await store.get('service_requests', request.id)).phone, '');
  assert.equal((await store.get('service_requests', otherRequest.id)).symptoms, otherText);
  assert.equal((await store.get('orders', order.data.id)).assessmentNotes, '');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM oscar_private.service_request_tombstones')).rows[0].n, 1);
  const purge = await purgeClientBackups(store, 1, manager);
  assert.equal(purge.processed, 2);
  for (const backupId of [before.id, after.id]) {
    const snapshot = (await db.query('SELECT data FROM oscar_private.backups WHERE id=$1', [backupId])).rows[0].data;
    const saved = snapshot.records.service_requests.find(row => row.id === request.id);
    assert.equal(saved.symptoms, '');
    assert.equal(saved.phone, '');
    assert.equal(JSON.stringify(snapshot).includes(privateText), false);
    assert.equal(JSON.stringify(snapshot).includes(orderNote), false);
    assert.equal(snapshot.records.service_requests.find(row => row.id === otherRequest.id).symptoms, otherText);
  }

  // Simula a importacao de uma copia anterior ao vinculo. Tombstones continuam fora do snapshot.
  await db.query('UPDATE oscar_private.backups SET data=$1 WHERE id=$2', [JSON.stringify(original), before.id]);
  await store.restoreBackup(before.id);
  const restored = await store.get('service_requests', request.id);
  assert.equal(restored.symptoms, '');
  assert.equal(restored.phone, '');
  assert.equal(restored.name, 'Solicitação anonimizada');
  assert.equal((await store.get('clients', 1)).active, false);
  assert.equal((await store.get('service_requests', otherRequest.id)).symptoms, otherText);
});
