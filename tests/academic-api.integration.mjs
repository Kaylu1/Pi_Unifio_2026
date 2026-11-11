import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../server/server.ts';

async function fixture(t) {
  const api = createApi({ filename: ':memory:', runMaintenance: false, secureCookies: false });
  await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
  t.after(() => api.close());
  const base = 'http://127.0.0.1:' + api.server.address().port + '/api';
  const basic = email => 'Basic ' + Buffer.from(email + ':Oscar@2026!').toString('base64');
  const call = async (path, { method = 'GET', body, user = 'gerente@oscar.local', headers = {} } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(user ? { Authorization: basic(user) } : {}),
      ...(['POST', 'PUT', 'DELETE'].includes(method) ? { 'Content-Type': 'application/json' } : {}), ...headers,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  };
  return { api, call };
}

test('HTTP Basic diferencia 401 e 403 e mantém sessão Angular com proteção CSRF', async t => {
  const { call } = await fixture(t);
  const unauthenticated = await call('/clients', { user: null });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /Basic realm="OScar"/);
  assert.equal((await call('/clients', { headers: { Authorization: 'Basic ' + Buffer.from('gerente@oscar.local:errada').toString('base64') } })).status, 401);
  assert.equal((await call('/users', { method: 'POST', user: 'mecanico@oscar.local', body: {} })).status, 403);
  assert.equal((await call('/clients')).status, 200);
  const login = await call('/login', { method: 'POST', user: null, body: { email: 'gerente@oscar.local', password: 'Oscar@2026!' } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/settings', { method: 'PUT', user: null, headers: { Cookie: cookie }, body: { warrantyDays: 100 } })).status, 403);
  assert.equal((await call('/settings', { method: 'PUT', user: null, headers: { Cookie: cookie, 'X-CSRF-Token': login.data.csrfToken }, body: { warrantyDays: 100 } })).status, 200);
});

test('CRUD de cadastro, validação 400, inexistente 404 e regra 409', async t => {
  const { call } = await fixture(t);
  assert.equal((await call('/services', { method: 'POST', body: {} })).status, 400);
  assert.equal((await call('/services/999999')).status, 404);
  const created = await call('/services', { method: 'POST', body: { name: 'Teste de bateria', description: 'Verificar tensão e capacidade.', price: 70, durationMinutes: 30, inspectionItems: ['Medir tensão'], purpose: 'avaliacao' } });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await call('/services/' + id)).data.name, 'Teste de bateria');
  assert.equal((await call('/services/' + id, { method: 'PUT', body: { price: 90 } })).data.price, 90);
  assert.equal((await call('/services/' + id, { method: 'DELETE', body: {} })).data.active, false);
  assert.equal((await call('/users/1', { method: 'DELETE', body: {} })).status, 409);
});

test('agenda e ordem possuem atualização e exclusão respeitando o estado do atendimento', async t => {
  const { call } = await fixture(t);
  const appointment = await call('/appointments', { method: 'POST', body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], date: '2035-01-10', time: '08:00' } });
  assert.equal(appointment.status, 201);
  const id = appointment.data.id;
  assert.equal((await call('/queries/appointments?date=2035-01-10&mechanicId=3')).data.items[0].id, id);
  assert.equal((await call('/appointments/' + id, { method: 'PUT', body: { time: '10:00', reason: 'Cliente solicitou outro horário.' } })).status, 200);
  assert.equal((await call('/appointments/' + id, { method: 'DELETE', body: {} })).data.status, 'cancelado');
  const order = await call('/orders', { method: 'POST', body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } });
  assert.equal(order.status, 201);
  assert.equal((await call('/orders/' + order.data.id, { method: 'PUT', body: { assessmentNotes: 'Relato conferido com o cliente.' } })).data.assessmentNotes, 'Relato conferido com o cliente.');
  assert.equal((await call('/orders/' + order.data.id, { method: 'DELETE', body: {} })).data.status, 'cancelada');
  assert.equal((await call('/orders/' + order.data.id, { method: 'PUT', body: {} })).status, 409);
});

test('orçamento rascunho, movimento de entrada e solicitação têm CRUD reversível', async t => {
  const { api, call } = await fixture(t);
  const order = (await call('/orders', { method: 'POST', body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } })).data;
  assert.equal((await call('/orders/' + order.id + '/status', { method: 'POST', body: { status: 'inspecao' } })).status, 200);
  const budget = await call('/budgets', { method: 'POST', body: { orderId: order.id, items: [{ serviceId: 2, quantity: 1 }], validityHours: 48 } });
  assert.equal(budget.status, 201);
  assert.equal((await call('/budgets/' + budget.data.id, { method: 'PUT', body: { items: [{ ...budget.data.items[0], price: 123 }] } })).status, 200);
  assert.equal((await call('/budgets/' + budget.data.id, { method: 'DELETE', body: {} })).status, 204);
  assert.equal((await call('/budgets/' + budget.data.id)).status, 404);
  const stock = (await api.store.get('parts', 1)).stock;
  const movement = await call('/stock/entries', { method: 'POST', body: { partId: 1, supplierId: 1, quantity: 3, date: new Date().toISOString().slice(0, 10) } });
  assert.equal(movement.status, 201);
  assert.equal((await call('/movements/' + movement.data.id, { method: 'PUT', body: { quantity: 5 } })).status, 200);
  assert.equal((await api.store.get('parts', 1)).stock, stock + 5);
  assert.equal((await call('/movements/' + movement.data.id, { method: 'DELETE', body: {} })).status, 204);
  assert.equal((await api.store.get('parts', 1)).stock, stock);
  assert.equal((await call('/queries/parts/low-stock')).status, 200);
  const request = await call('/service-requests', { method: 'POST', body: { name: 'Cliente de apresentação', phone: '14999998888', vehicle: 'Fiat Uno', plate: 'ABC1D23', serviceIds: [1], symptoms: '', preferredDate: '', preferredPeriod: '' } });
  assert.equal(request.status, 201);
  assert.equal((await call('/service-requests/' + request.data.id, { method: 'PUT', body: { name: 'Nome corrigido' } })).data.name, 'Nome corrigido');
  assert.equal((await call('/service-requests/' + request.data.id, { method: 'DELETE', body: {} })).data.status, 'cancelada');
  const closed = (await api.store.list('orders')).find(row => row.status === 'encerrada');
  const ticket = await call('/tickets', { method: 'POST', body: { orderId: closed.id, description: 'Ruído depois da entrega.' } });
  assert.equal(ticket.status, 201);
  assert.equal((await call('/tickets/' + ticket.data.id, { method: 'DELETE', body: {} })).status, 204);
});

test('cancelar O.S. de pedido confirmado libera a agenda e devolve solicitação ao contato', async t => {
  const { call } = await fixture(t);
  const request = await call('/service-requests', { method: 'POST', body: {
    name: 'Cliente do catálogo', phone: '14999998888', vehicle: 'Fiat Uno', plate: '', serviceIds: [1],
    symptoms: '', preferredDate: '', preferredPeriod: '',
  } });
  const confirmed = await call('/service-requests/' + request.data.id + '/confirm', { method: 'POST', body: {
    date: '2035-01-11', time: '08:00', mechanicId: 3, contactConfirmed: true,
  } });
  assert.equal(confirmed.status, 201);
  const appointmentId = confirmed.data.appointment.id;
  const order = await call('/orders', { method: 'POST', body: { appointmentId, approvalMethod: 'presencial' } });
  assert.equal(order.status, 201);
  assert.equal((await call('/orders/' + order.data.id, { method: 'DELETE', body: {} })).status, 200);
  const after = (await call('/service-requests/' + request.data.id)).data;
  assert.equal(after.status, 'em_contato');
  assert.equal(after.appointmentId, null);
  assert.equal(after.confirmedAt, null);
  assert.equal((await call('/appointments/' + appointmentId)).data.status, 'cancelado');
});
