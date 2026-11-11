import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApi } from '../server/server.mjs';

async function fixture(t) {
  const api = createApi({ filename: ':memory:', runMaintenance: false });
  api.server.listen(0, '127.0.0.1');
  await once(api.server, 'listening');
  t.after(() => api.close());
  return { ...api, base: `http://127.0.0.1:${api.server.address().port}/api` };
}

async function call(a, path, { method = 'GET', body, session } = {}) {
  const headers = {};
  if (session) {
    headers.cookie = session.cookie;
    headers['x-csrf-token'] = session.csrfToken;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(a.base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), response };
}

async function login(a, email = 'atendente@oscar.local') {
  const result = await call(a, '/login', {
    method: 'POST', body: { email, password: 'Oscar@2026!' },
  });
  assert.equal(result.status, 200);
  return { ...result.data, cookie: result.response.headers.get('set-cookie').split(';')[0] };
}

const requestBody = {
  name: 'Cliente Pedido Confirmado',
  phone: '(14) 99999-8888',
  vehicle: 'Chevrolet Onix 2021',
  plate: 'XYZ9A21',
  symptoms: 'O motor perde potência e a luz de injeção acende ao acelerar.',
  serviceIds: [1, 5],
  preferredDate: '2030-06-12',
  preferredPeriod: 'manha',
};

const bookingBody = {
  date: '2030-06-12',
  time: '09:00',
  mechanicId: 3,
  contactConfirmed: true,
};

test('pedido público confirmado cria cliente, veículo e agenda vinculados numa transação', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', { method: 'POST', body: requestBody });
  assert.equal(created.status, 201);
  const before = {
    clients: (await a.store.list('clients')).length,
    vehicles: (await a.store.list('vehicles')).length,
    appointments: (await a.store.list('appointments')).length,
    users: (await a.store.list('users')).length,
    emails: (await a.store.list('emails')).length,
  };
  const session = await login(a);
  const confirmed = await call(a, `/service-requests/${created.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.request.status, 'atendida');
  assert.equal(confirmed.data.request.appointmentId, confirmed.data.appointment.id);
  assert.equal(confirmed.data.appointment.serviceRequestId, created.data.id);
  assert.equal(confirmed.data.appointment.clientId, confirmed.data.client.id);
  assert.equal(confirmed.data.appointment.vehicleId, confirmed.data.vehicle.id);
  assert.deepEqual(confirmed.data.appointment.serviceIds, requestBody.serviceIds);
  assert.equal(confirmed.data.client.registrationStatus, 'provisorio');
  assert.equal(confirmed.data.client.cpf, '');
  assert.equal(confirmed.data.client.email, '');
  assert.equal(confirmed.data.vehicle.registrationStatus, 'provisorio');
  assert.equal(confirmed.data.vehicle.chassis, '');
  assert.equal((await a.store.list('clients')).length, before.clients + 1);
  assert.equal((await a.store.list('vehicles')).length, before.vehicles + 1);
  assert.equal((await a.store.list('appointments')).length, before.appointments + 1);
  assert.equal((await a.store.list('users')).length, before.users);
  assert.equal((await a.store.list('emails')).length, before.emails);

  const repeated = await call(a, `/service-requests/${created.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.appointment.id, confirmed.data.appointment.id);
  assert.equal((await a.store.list('appointments')).length, before.appointments + 1);

  const mechanic = await login(a, 'mecanico@oscar.local');
  const mechanicBootstrap = await call(a, '/bootstrap', { session: mechanic });
  assert.ok(mechanicBootstrap.data.clients.some(row => row.id === confirmed.data.client.id));
  assert.ok(mechanicBootstrap.data.vehicles.some(row => row.id === confirmed.data.vehicle.id));

  const currentService = await a.store.get('services', requestBody.serviceIds[0]);
  await a.store.save('services', { ...currentService, price: currentService.price + 99, active: false });
  const wrongMechanic = await call(a, '/orders', { method: 'POST', session, body: {
    appointmentId: confirmed.data.appointment.id, mechanicId: 6, approvalMethod: 'presencial',
  } });
  assert.equal(wrongMechanic.status, 409);
  const wrongService = await call(a, '/orders', { method: 'POST', session, body: {
    appointmentId: confirmed.data.appointment.id, serviceIds: [2], approvalMethod: 'presencial',
  } });
  assert.equal(wrongService.status, 409);
  const order = await call(a, '/orders', { method: 'POST', session, body: {
    appointmentId: confirmed.data.appointment.id, approvalMethod: 'presencial',
  } });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.serviceRequestId, created.data.id);
  assert.equal(order.data.items.find(item => item.serviceId === currentService.id).price,
    confirmed.data.appointment.confirmedServices.find(service => service.id === currentService.id).price);
  const detail = await call(a, `/orders/${order.data.id}`, { session });
  assert.equal(detail.data.sourceRequest.id, created.data.id);
  assert.equal(detail.data.sourceRequest.symptoms, requestBody.symptoms);

  const completedClient = await call(a, `/clients/${confirmed.data.client.id}`, {
    method: 'PUT', session, body: {
      cpf: '52998224725', email: 'pedido.confirmado@exemplo.local',
    },
  });
  assert.equal(completedClient.status, 200, JSON.stringify(completedClient.data));
  assert.equal(completedClient.data.registrationStatus, 'completo');
  assert.equal((await a.store.list('users')).length, before.users + 1);
  assert.equal((await a.store.list('emails')).length, before.emails + 1);
  assert.ok((await a.store.list('users')).some(user =>
    user.clientId === confirmed.data.client.id && user.email === 'pedido.confirmado@exemplo.local'));
  assert.ok((await a.store.list('emails')).some(email =>
    email.to === 'pedido.confirmado@exemplo.local' && email.kind === 'convite'));
  const completedVehicle = await call(a, `/vehicles/${confirmed.data.vehicle.id}`, {
    method: 'PUT', session, body: {
      chassis: '9BWZZZ377VT004252', brand: 'Chevrolet', model: 'Onix',
      year: 2021, mileage: 25000,
    },
  });
  assert.equal(completedVehicle.status, 200, JSON.stringify(completedVehicle.data));
  assert.equal(completedVehicle.data.registrationStatus, 'completo');
});

test('O.S. de avaliação vinculada usa finalidade confirmada mesmo se o catálogo mudar', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, serviceIds: [5] },
  });
  assert.equal(created.status, 201);
  const session = await login(a);
  const confirmed = await call(a, `/service-requests/${created.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.appointment.confirmedServices[0].purpose, 'avaliacao');
  const service = await a.store.get('services', 5);
  await a.store.save('services', { ...service, purpose: 'execucao', active: false });
  const order = await call(a, '/orders', { method: 'POST', session, body: {
    appointmentId: confirmed.data.appointment.id,
    startMode: 'servicos', approvalMethod: 'presencial',
  } });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.startMode, 'avaliacao');
  assert.deepEqual(order.data.evaluationServiceIds, [5]);
});

test('cancelar e reconfirmar pedido sem placa reaproveita cliente e veículo provisórios', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, plate: '' },
  });
  assert.equal(created.status, 201);
  const session = await login(a);
  const path = `/service-requests/${created.data.id}/confirm`;
  const first = await call(a, path, { method: 'POST', session, body: bookingBody });
  assert.equal(first.status, 201);
  const originalService = await a.store.get('services', requestBody.serviceIds[0]);
  await a.store.save('services', { ...originalService,
    durationMinutes: originalService.durationMinutes + 90, active: false });
  const availability = await call(a,
    `/availability?date=2030-06-13&serviceIds=${requestBody.serviceIds.join(',')}&excludeAppointmentId=${first.data.appointment.id}`,
    { session });
  assert.equal(availability.status, 200);
  assert.equal(availability.data.durationMinutes, first.data.appointment.durationMinutes);
  assert.equal((await call(a, `/appointments/${first.data.appointment.id}`, {
    method: 'PUT', session, body: { date: '2030-06-13', time: '09:00',
      serviceIds: [2], reason: 'Troca de dia.' },
  })).status, 409);
  assert.equal((await call(a, `/appointments/${first.data.appointment.id}`, {
    method: 'PUT', session, body: { date: '2030-06-13', time: '09:00',
      clientId: 2, reason: 'Troca de dia.' },
  })).status, 409);
  const rescheduled = await call(a, `/appointments/${first.data.appointment.id}`, {
    method: 'PUT', session, body: { date: '2030-06-13', time: '09:00',
      reason: 'Cliente pediu outra data.' },
  });
  assert.equal(rescheduled.status, 200, JSON.stringify(rescheduled.data));
  assert.equal(rescheduled.data.serviceRequestId, created.data.id);
  assert.equal(rescheduled.data.durationMinutes, first.data.appointment.durationMinutes);
  const cancelled = await call(a, `/appointments/${first.data.appointment.id}`, {
    method: 'PUT', session, body: { status: 'cancelado', reason: 'Cliente pediu outra data.' },
  });
  assert.equal(cancelled.status, 200);
  const reopened = await call(a, `/service-requests/${created.data.id}`, { session });
  assert.equal(reopened.data.status, 'em_contato');
  assert.equal(reopened.data.appointmentId, null);
  await a.store.save('services', { ...originalService,
    durationMinutes: originalService.durationMinutes + 90, active: true });
  const second = await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, date: '2030-06-14', acceptCatalogChanges: true } });
  assert.equal(second.status, 201);
  assert.equal(second.data.client.id, first.data.client.id);
  assert.equal(second.data.vehicle.id, first.data.vehicle.id);
  assert.notEqual(second.data.appointment.id, first.data.appointment.id);
  assert.equal((await a.store.list('clients')).filter(row => row.id === first.data.client.id).length, 1);
  assert.equal((await a.store.list('vehicles')).filter(row => row.clientId === first.data.client.id).length, 1);
});

test('trocar cliente após cancelamento cria veículo provisório sem duplicar a placa anterior', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: requestBody,
  });
  assert.equal(created.status, 201);
  const session = await login(a);
  const path = `/service-requests/${created.data.id}/confirm`;
  const first = await call(a, path, { method: 'POST', session, body: bookingBody });
  assert.equal(first.status, 201);
  const cancelled = await call(a, `/appointments/${first.data.appointment.id}`, {
    method: 'PUT', session, body: { status: 'cancelado', reason: 'Cliente corrigiu o cadastro.' },
  });
  assert.equal(cancelled.status, 200);
  const otherClient = await call(a, '/clients', { method: 'POST', session, body: {
    name: requestBody.name, phone: requestBody.phone,
    cpf: '52998224725', email: 'cadastro.corrigido@exemplo.local',
  } });
  assert.equal(otherClient.status, 201, JSON.stringify(otherClient.data));
  const vehiclesBefore = (await a.store.list('vehicles')).length;
  const unacknowledged = await call(a, path, { method: 'POST', session, body: {
    ...bookingBody, clientId: otherClient.data.id,
  } });
  assert.equal(unacknowledged.status, 409);
  assert.equal((await a.store.list('vehicles')).length, vehiclesBefore);
  assert.equal((await a.store.get('service_requests', created.data.id)).status, 'em_contato');
  const second = await call(a, path, { method: 'POST', session, body: {
    ...bookingBody, clientId: otherClient.data.id, acceptIdentityMismatch: true,
  } });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  assert.equal(second.data.request.clientId, otherClient.data.id);
  assert.equal(second.data.request.vehicleId, second.data.vehicle.id);
  assert.equal(second.data.request.plate, requestBody.plate);
  assert.equal(second.data.vehicle.clientId, otherClient.data.id);
  assert.equal(second.data.vehicle.registrationStatus, 'provisorio');
  assert.equal(second.data.vehicle.plate, '');
  assert.equal(second.data.vehicle.model, requestBody.vehicle);
  assert.notEqual(second.data.vehicle.id, first.data.vehicle.id);
  assert.equal((await a.store.get('vehicles', first.data.vehicle.id)).clientId, first.data.client.id);
  assert.equal((await a.store.get('appointments', first.data.appointment.id)).vehicleId,
    first.data.vehicle.id);
  assert.equal((await a.store.list('vehicles')).length, vehiclesBefore + 1);
});

test('espaços repetidos no nome do pedido não exigem revisão de identidade', async t => {
  const a = await fixture(t);
  const session = await login(a);
  const client = await call(a, '/clients', { method: 'POST', session, body: {
    name: 'Maria Silva', phone: '14999995555',
    cpf: '52998224725', email: 'maria.silva@exemplo.local',
  } });
  assert.equal(client.status, 201);
  const created = await call(a, '/public/service-requests', { method: 'POST', body: {
    ...requestBody, name: 'Maria  Silva', phone: '14999995555', plate: '',
  } });
  assert.equal(created.status, 201);
  const confirmed = await call(a, `/service-requests/${created.data.id}/confirm`, {
    method: 'POST', session, body: { ...bookingBody, clientId: client.data.id },
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.client.id, client.data.id);
});

test('sem contato confirmado, serviço inativo ou mudança de catálogo, confirmação não cria cadastros parciais', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: requestBody,
  });
  const session = await login(a);
  const path = `/service-requests/${created.data.id}/confirm`;
  const initial = {
    clients: (await a.store.list('clients')).length,
    vehicles: (await a.store.list('vehicles')).length,
    appointments: (await a.store.list('appointments')).length,
  };
  assert.equal((await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, contactConfirmed: false } })).status, 400);
  const service = await a.store.get('services', requestBody.serviceIds[0]);
  await a.store.save('services', { ...service, price: service.price + 50,
    durationMinutes: service.durationMinutes + 30 });
  assert.equal((await call(a, path, { method: 'POST', session, body: bookingBody })).status, 409);
  assert.equal((await a.store.list('clients')).length, initial.clients);
  assert.equal((await a.store.list('vehicles')).length, initial.vehicles);
  assert.equal((await a.store.list('appointments')).length, initial.appointments);
  const confirmed = await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, acceptCatalogChanges: true } });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.appointment.confirmedServices[0].price, service.price + 50);
  assert.equal(confirmed.data.appointment.durationMinutes, created.data.durationMinutes + 30);
  assert.equal(confirmed.data.request.services[0].price, service.price);

  const other = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, name: 'Outra Pessoa', phone: '14999997777', plate: 'QWE4R56' },
  });
  await a.store.save('services', { ...service, active: false });
  const beforeInactive = (await a.store.list('clients')).length;
  assert.equal((await call(a, `/service-requests/${other.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  })).status, 400);
  assert.equal((await a.store.list('clients')).length, beforeInactive);
});

test('perfis e vínculo existentes exigem confirmação de identidade e horário futuro', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, plate: 'ABC1D23' },
  });
  const path = `/service-requests/${created.data.id}/confirm`;
  const mechanic = await login(a, 'mecanico@oscar.local');
  assert.equal((await call(a, path, { method: 'POST', session: mechanic,
    body: bookingBody })).status, 403);
  const client = await login(a, 'cliente@oscar.local');
  assert.equal((await call(a, path, { method: 'POST', session: client,
    body: bookingBody })).status, 403);
  const session = await login(a);
  assert.equal((await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, date: '2020-01-01', clientId: 1, vehicleId: 1,
      acceptIdentityMismatch: true } })).status, 400);
  assert.equal((await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, clientId: 1, vehicleId: 1 } })).status, 409);
  const confirmed = await call(a, path, { method: 'POST', session,
    body: { ...bookingBody, clientId: 1, vehicleId: 1,
      acceptIdentityMismatch: true } });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.client.id, 1);
  assert.equal(confirmed.data.vehicle.id, 1);
  assert.equal((await call(a, '/availability?date=2020-01-01&serviceIds=1',
    { session })).status, 400);
  assert.equal((await call(a, '/appointments', { method: 'POST', session, body: {
    clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1],
    date: '2020-01-01', time: '09:00',
  } })).status, 400);
  const order = await call(a, '/orders', { method: 'POST', session, body: {
    appointmentId: confirmed.data.appointment.id, approvalMethod: 'presencial',
  } });
  assert.equal(order.status, 201);
  const clientDetail = await call(a, `/orders/${order.data.id}`, { session: client });
  assert.equal(clientDetail.status, 200);
  assert.equal(clientDetail.data.sourceRequest, null);
});

test('confirmar em paralelo cria uma só reserva; conflito de horário reverte cadastros provisórios', async t => {
  const a = await fixture(t);
  const session = await login(a);
  const firstRequest = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, plate: '' },
  });
  const path = `/service-requests/${firstRequest.data.id}/confirm`;
  const before = {
    clients: (await a.store.list('clients')).length,
    vehicles: (await a.store.list('vehicles')).length,
    appointments: (await a.store.list('appointments')).length,
  };
  const results = await Promise.all([
    call(a, path, { method: 'POST', session, body: bookingBody }),
    call(a, path, { method: 'POST', session, body: bookingBody }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  assert.equal(results[0].data.appointment.id, results[1].data.appointment.id);
  assert.equal((await a.store.list('clients')).length, before.clients + 1);
  assert.equal((await a.store.list('vehicles')).length, before.vehicles + 1);
  assert.equal((await a.store.list('appointments')).length, before.appointments + 1);

  const conflictRequest = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, name: 'Outro cliente no mesmo horário',
      phone: '14999996666', plate: 'RFG7H89' },
  });
  const conflict = await call(a, `/service-requests/${conflictRequest.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  });
  assert.equal(conflict.status, 409);
  assert.equal((await a.store.list('clients')).length, before.clients + 1);
  assert.equal((await a.store.list('vehicles')).length, before.vehicles + 1);
  assert.equal((await a.store.list('appointments')).length, before.appointments + 1);
  assert.equal((await a.store.get('service_requests', conflictRequest.data.id)).status, 'pendente');
});

test('cliente provisório permite agenda comum e cancelamento sem gerar mensagem para e-mail vazio', async t => {
  const a = await fixture(t);
  const created = await call(a, '/public/service-requests', {
    method: 'POST', body: { ...requestBody, plate: '' },
  });
  const session = await login(a);
  const confirmed = await call(a, `/service-requests/${created.data.id}/confirm`, {
    method: 'POST', session, body: bookingBody,
  });
  assert.equal(confirmed.status, 201);
  const emailsBefore = (await a.store.list('emails')).length;
  const generic = await call(a, '/appointments', { method: 'POST', session, body: {
    clientId: confirmed.data.client.id, vehicleId: confirmed.data.vehicle.id,
    mechanicId: 3, serviceIds: [1], date: '2030-06-20', time: '09:00',
  } });
  assert.equal(generic.status, 201);
  const moved = await call(a, `/appointments/${generic.data.id}`, { method: 'PUT', session,
    body: { date: '2030-06-21', time: '09:00', reason: 'Nova preferência.' } });
  assert.equal(moved.status, 200);
  const cancelled = await call(a, `/appointments/${generic.data.id}`, { method: 'PUT', session,
    body: { status: 'cancelado', reason: 'Cliente desistiu.' } });
  assert.equal(cancelled.status, 200);
  assert.equal((await a.store.list('emails')).length, emailsBefore);
});
