import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createPublicServiceRequest, serviceRequestRoutes } from '../server/service-requests.mjs';
import { orderRoutes } from '../server/order-routes.mjs';
import { anonymizeClient, purgeClientBackups } from '../server/privacy.mjs';

test('SQLite: excluir cliente apaga pedido vinculado mesmo com telefone diferente e backup anterior ao vinculo', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'oscar-linked-privacy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createStore({ filename: join(directory, 'oscar.sqlite') });
  try {
    const manager = store.get('users', 1);
    const request = await store.transaction(() => createPublicServiceRequest(store, {
      name: 'Pessoa do pedido', phone: '14999997766', vehicle: 'Polo informado',
      plate: '', symptoms: 'Relato privado do pedido vinculado', serviceIds: [1],
    }));
    const backup = store.backup();
    const original = createStore({ filename: join(directory, 'backups', backup.filename), seed: false });
    try {
      assert.equal(original.get('service_requests', request.id).clientId, undefined);
    } finally { original.close(); }

    const confirmed = await store.transaction(() => serviceRequestRoutes({
      s: store, route: `/service-requests/${request.id}/confirm`, method: 'POST', user: manager,
      body: { clientId: 1, vehicleId: 1, date: '2030-06-12', time: '09:00',
        mechanicId: 3, contactConfirmed: true, acceptIdentityMismatch: true },
    }));
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.data.request.clientId, 1);
    assert.notEqual(confirmed.data.request.phone, store.get('clients', 1).phone);
    const order = await store.transaction(() => orderRoutes({
      s: store, route: '/orders', method: 'POST', user: manager,
      body: { appointmentId: confirmed.data.appointment.id, approvalMethod: 'presencial',
        assessmentNotes: 'Relato pessoal anotado na ordem' },
    }));
    assert.equal(order.status, 201);

    await store.transaction(() => anonymizeClient(store, 1, manager));
    assert.equal(store.get('service_requests', request.id).symptoms, '');
    assert.equal(store.get('service_requests', request.id).phone, '');
    assert.equal(store.get('orders', order.data.id).assessmentNotes, '');
    const purged = await purgeClientBackups(store, 1, manager);
    assert.equal(purged.processed, 1);
    const copy = createStore({ filename: join(directory, 'backups', backup.filename), seed: false });
    try {
      const saved = copy.get('service_requests', request.id);
      assert.equal(saved.symptoms, '');
      assert.equal(saved.phone, '');
      assert.equal(saved.name, 'Solicitação anonimizada');
    } finally { copy.close(); }
  } finally { store.close(); }
});

test('SQLite: contato e placa compartilhados nao apagam pedido vinculado a outro cliente', async () => {
  const store = createStore({ filename: ':memory:' });
  try {
    const manager = store.get('users', 1);
    const owner = store.get('clients', 1);
    const other = store.get('clients', 2);
    const plate = store.get('vehicles', 1).plate;
    const otherRequest = store.save('service_requests', {
      name: other.name, phone: owner.phone, vehicle: 'Veiculo de outro titular', plate,
      symptoms: 'Relato do outro titular', clientId: other.id, vehicleId: 2,
      serviceIds: [], services: [], total: 0, durationMinutes: 0, status: 'atendida',
    });
    const legacyRequest = store.save('service_requests', {
      name: owner.name, phone: owner.phone, vehicle: 'Veiculo sem vinculo', plate: '',
      symptoms: 'Relato legado do titular', serviceIds: [], services: [],
      total: 0, durationMinutes: 0, status: 'pendente',
    });
    await store.transaction(() => anonymizeClient(store, owner.id, manager));
    assert.equal(store.get('service_requests', otherRequest.id).symptoms, 'Relato do outro titular');
    assert.equal(store.get('service_requests', otherRequest.id).clientId, other.id);
    assert.equal(store.get('service_requests', legacyRequest.id).symptoms, '');
  } finally { store.close(); }
});
