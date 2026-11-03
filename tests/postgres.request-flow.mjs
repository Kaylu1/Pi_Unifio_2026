import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApi } from '../server/server.mjs';
import { createPgFixture } from './helpers/postgres-fixture.mjs';
import { seedPgDemo } from './helpers/demo-postgres.mjs';

async function fixture(t) {
  const pg = await createPgFixture();
  await seedPgDemo(pg);
  const api = createApi({ store: pg.store, runMaintenance: false, secureCookies: false });
  api.server.listen(0, '127.0.0.1');
  await once(api.server, 'listening');
  t.after(async () => {
    await api.close();
    await pg.close();
  });
  return { pg, base: `http://127.0.0.1:${api.server.address().port}/api` };
}

async function call(base, path, { method = 'GET', body, session } = {}) {
  const headers = {};
  if (session) {
    headers.cookie = session.cookie;
    headers['x-csrf-token'] = session.csrfToken;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), response };
}

async function ok(base, path, options) {
  const result = await call(base, path, options);
  assert.ok(result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

async function login(base, email) {
  const result = await call(base, '/login', {
    method: 'POST', body: { email, password: 'Oscar@2026!' },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { ...result.data, cookie: result.response.headers.get('set-cookie').split(';')[0] };
}

test('PostgreSQL local: pedido do catalogo percorre cadastro, agenda, cancelamento e O.S.', async t => {
  const { pg, base } = await fixture(t);
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const input = {
    name: 'Cliente de teste do catalogo', phone: '(14) 99999-7766',
    vehicle: 'Volkswagen Polo 2021', plate: 'ZZZ1A23',
    symptoms: 'Motor falha ao acelerar e acende a luz da injecao durante o trajeto.',
    serviceIds: [1, 5], preferredDate: future, preferredPeriod: 'manha',
  };
  const manager = await login(base, 'gerente@oscar.local');
  const mechanic = await login(base, 'mecanico@oscar.local');
  const originalUsers = (await pg.store.list('users')).length;
  const originalClients = (await pg.store.list('clients')).length;
  const originalVehicles = (await pg.store.list('vehicles')).length;
  const originalAppointments = (await pg.store.list('appointments')).length;

  const publicResult = await call(base, '/public/service-requests', {
    method: 'POST', body: input,
  });
  assert.equal(publicResult.status, 201, JSON.stringify(publicResult.data));
  const requestId = publicResult.data.id;
  assert.equal(publicResult.data.name, undefined, 'A resposta publica nao expoe dados pessoais.');
  const stored = await pg.store.get('service_requests', requestId);
  assert.equal(stored.status, 'pendente');
  assert.equal(stored.symptoms, input.symptoms);
  assert.deepEqual(stored.serviceIds, input.serviceIds);
  assert.equal((await ok(base, '/bootstrap', { session: manager })).serviceRequests.openCount, 1);
  assert.equal((await ok(base, '/service-requests/' + requestId, { session: mechanic })).id, requestId);

  const confirmation = { date: future, time: '09:00', mechanicId: mechanic.user.id, contactConfirmed: true };
  const withoutContact = await call(base, `/service-requests/${requestId}/confirm`, {
    method: 'POST', session: manager, body: { ...confirmation, contactConfirmed: false },
  });
  assert.equal(withoutContact.status, 422);
  assert.equal((await pg.store.list('clients')).length, originalClients);
  assert.equal((await pg.store.list('appointments')).length, originalAppointments);

  const confirmed = await call(base, `/service-requests/${requestId}/confirm`, {
    method: 'POST', session: manager, body: confirmation,
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  const { appointment, client, vehicle } = confirmed.data;
  assert.equal(confirmed.data.request.status, 'atendida');
  assert.equal(confirmed.data.request.appointmentId, appointment.id);
  assert.equal(appointment.serviceRequestId, requestId);
  assert.equal(appointment.clientId, client.id);
  assert.equal(appointment.vehicleId, vehicle.id);
  assert.deepEqual(appointment.serviceIds, input.serviceIds);
  assert.equal(client.registrationStatus, 'provisorio');
  assert.equal(vehicle.registrationStatus, 'provisorio');
  assert.equal(client.name, input.name);
  assert.equal(client.phone, '14999997766');
  assert.equal(vehicle.plate, input.plate);
  assert.ok(!client.cpf && !client.email && !vehicle.chassis,
    'Dados ausentes no pedido nao podem ser inventados.');
  assert.equal((await pg.store.list('users')).length, originalUsers,
    'Cliente provisorio nao recebe conta ou convite sem email real.');
  assert.equal((await pg.store.list('clients')).length, originalClients + 1);
  assert.equal((await pg.store.list('vehicles')).length, originalVehicles + 1);

  const repeated = await call(base, `/service-requests/${requestId}/confirm`, {
    method: 'POST', session: manager, body: confirmation,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.appointment.id, appointment.id);
  assert.equal((await pg.store.list('appointments')).length, originalAppointments + 1);

  const managerView = await ok(base, '/bootstrap', { session: manager });
  const mechanicView = await ok(base, '/bootstrap', { session: mechanic });
  for (const view of [managerView, mechanicView]) {
    assert.ok(view.appointments.some(row => row.id === appointment.id));
    assert.ok(view.clients.some(row => row.id === client.id),
      'A agenda atribuida precisa identificar o cliente ao mecanico.');
    assert.ok(view.vehicles.some(row => row.id === vehicle.id),
      'A agenda atribuida precisa identificar o veiculo ao mecanico.');
    assert.equal(view.serviceRequests.openCount, 0);
  }

  const cancelled = await call(base, `/appointments/${appointment.id}`, {
    method: 'PUT', session: manager, body: { status: 'cancelado', reason: 'Cliente pediu outro horario.' },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.status, 'cancelado');
  const reopened = await pg.store.get('service_requests', requestId);
  assert.equal(reopened.status, 'em_contato');
  assert.equal(reopened.appointmentId, null);
  assert.equal((await ok(base, '/bootstrap', { session: manager })).serviceRequests.openCount, 1);

  const reconfirmed = await call(base, `/service-requests/${requestId}/confirm`, {
    method: 'POST', session: manager, body: confirmation,
  });
  assert.equal(reconfirmed.status, 201, JSON.stringify(reconfirmed.data));
  assert.notEqual(reconfirmed.data.appointment.id, appointment.id);
  assert.equal(reconfirmed.data.client.id, client.id);
  assert.equal(reconfirmed.data.vehicle.id, vehicle.id);
  assert.equal((await pg.store.list('clients')).length, originalClients + 1);
  assert.equal((await pg.store.list('vehicles')).length, originalVehicles + 1);
  assert.equal((await ok(base, '/bootstrap', { session: manager })).serviceRequests.openCount, 0);

  const service = await pg.store.get('services', input.serviceIds[0]);
  await pg.store.save('services', { ...service, price: service.price + 100 });
  const wrongMechanic = await call(base, '/orders', {
    method: 'POST', session: manager,
    body: { appointmentId: reconfirmed.data.appointment.id, mechanicId: 6,
      serviceIds: input.serviceIds, approvalMethod: 'presencial' },
  });
  assert.equal(wrongMechanic.status, 409, 'A O.S. nao pode divergir do mecanico reservado.');
  const wrongServices = await call(base, '/orders', {
    method: 'POST', session: manager,
    body: { appointmentId: reconfirmed.data.appointment.id, serviceIds: [input.serviceIds[0]],
      approvalMethod: 'presencial' },
  });
  assert.equal(wrongServices.status, 409, 'A O.S. nao pode descartar servicos confirmados.');

  const order = await call(base, '/orders', {
    method: 'POST', session: manager,
    body: { appointmentId: reconfirmed.data.appointment.id, approvalMethod: 'presencial' },
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.appointmentId, reconfirmed.data.appointment.id);
  assert.equal(order.data.serviceRequestId, requestId);
  assert.equal(order.data.mechanicId, mechanic.user.id);
  assert.deepEqual(order.data.items.map(item => item.serviceId), input.serviceIds);
  assert.equal(order.data.items.find(item => item.serviceId === service.id).price, service.price,
    'A O.S. usa o valor confirmado, mesmo se o catalogo mudar depois.');
  assert.ok(order.data.inspections.length > 0);
  const detail = await ok(base, `/orders/${order.data.id}`, { session: manager });
  assert.equal(detail.sourceRequest.id, requestId);
  assert.equal(detail.sourceRequest.symptoms, input.symptoms);
  assert.deepEqual(detail.sourceRequest.services.map(item => item.id), input.serviceIds);
  assert.equal((await pg.store.get('appointments', reconfirmed.data.appointment.id)).status, 'atendido');

  const inspectionOrder = await call(base, `/orders/${order.data.id}/status`, {
    method: 'POST', session: mechanic, body: { status: 'inspecao' },
  });
  assert.equal(inspectionOrder.status, 200, JSON.stringify(inspectionOrder.data));
  const inspectionId = order.data.inspections[0].id;
  const inspected = await call(base, `/orders/${order.data.id}/inspection`, {
    method: 'POST', session: mechanic,
    body: { itemId: inspectionId, result: 'atencao', notes: 'Sintoma confirmado no teste local.' },
  });
  assert.equal(inspected.status, 200, JSON.stringify(inspected.data));
  const afterInspection = await ok(base, `/orders/${order.data.id}`, { session: mechanic });
  assert.equal(afterInspection.sourceRequest.symptoms, input.symptoms);
  assert.equal(afterInspection.order.inspections.find(item => item.id === inspectionId).result, 'atencao');
});
