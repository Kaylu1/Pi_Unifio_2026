import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAcademicFixture } from '../scripts/academic-fixture.mjs';

const PASSWORD = 'Oscar@2026!';
const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function request(fixture, path, { method = 'GET', body, email = 'gerente@oscar.local', password = PASSWORD, authenticated = true } = {}) {
  const headers = {};
  if (authenticated) headers.authorization = 'Basic ' + Buffer.from(email + ':' + password).toString('base64');
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(fixture.baseUrl + path, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const contentType = response.headers.get('content-type') || '';
  const data = response.status === 204 ? null : contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, response };
}

async function success(fixture, path, options) {
  const result = await request(fixture, path, options);
  assert.ok(result.status >= 200 && result.status < 300, path + ': ' + result.status + ' ' + JSON.stringify(result.data));
  return result.data;
}

test('MySQL local: integridade, API Basic e fluxos da oficina no banco real', async (t) => {
  const fixture = await createAcademicFixture();
  t.after(() => fixture.close());
  const { store } = fixture;
  const clients = await store.list('clients');
  const client = clients.find(item => item.email === 'cliente@oscar.local');
  const vehicle = (await store.list('vehicles')).find(item => item.clientId === client.id);
  const mechanic = (await store.list('users')).find(item => item.email === 'mecanico@oscar.local');
  const services = (await store.list('services')).filter(item => item.active);
  const service = services.find(item => item.purpose === 'execucao');
  const evaluation = services.find(item => item.purpose === 'avaliacao');
  const supplier = (await store.list('suppliers'))[0];

  await t.test('MySQL Community, FKs reais e rollback de transação aninhada', async () => {
    const identity = await store.db.prepare('SELECT VERSION() AS version, DATABASE() AS databaseName, @@bind_address AS bindAddress').get();
    assert.match(identity.version, /^8\./);
    assert.equal(identity.databaseName, 'oscar_test');
    assert.equal(identity.bindAddress, '127.0.0.1');
    const keys = await store.db.prepare(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, REFERENCED_TABLE_NAME AS target
      FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL`).all('oscar_test');
    assert.ok(keys.some(key => key.tableName === 'vehicles' && key.columnName === 'clientId' && key.target === 'clients'));
    assert.ok(keys.some(key => key.tableName === 'appointments' && key.target === 'users'));
    assert.ok(keys.some(key => key.tableName === 'service_requests' && key.target === 'appointments'));
    const before = (await store.list('services')).length;
    await assert.rejects(store.transaction(async () => {
      await store.save('services', { ...service, id: undefined, name: 'Não deve persistir no rollback' });
      throw new Error('rollback intencional');
    }), /rollback intencional/);
    assert.equal((await store.list('services')).length, before);
    assert.ok(!(await store.list('services')).some(item => item.name === 'Não deve persistir no rollback'));
    await assert.rejects(store.save('vehicles', { ...vehicle, id: undefined, clientId: 99999999,
      plate: 'FKS1A23', chassis: '9BWZZZ377VT004299' }), error => error.code === 'ER_NO_REFERENCED_ROW_2');
    assert.ok(!(await store.list('vehicles')).some(item => item.plate === 'FKS1A23'));
  });

  await t.test('HTTP Basic demonstra 401, 403, 400, 404 e 409', async () => {
    const anonymous = await request(fixture, '/clients', { authenticated: false });
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.response.headers.get('www-authenticate') || '', /Basic/i);
    assert.equal((await request(fixture, '/clients', { password: 'incorreta' })).status, 401);
    assert.equal((await request(fixture, '/services', { method: 'POST', email: mechanic.email, body: {} })).status, 403);
    assert.equal((await request(fixture, '/services', { method: 'POST', body: {} })).status, 400);
    assert.equal((await request(fixture, '/clients/99999999')).status, 404);
    assert.equal((await request(fixture, '/vehicles', { method: 'POST', body: {
      clientId: client.id, plate: vehicle.plate, chassis: vehicle.chassis, brand: 'Volkswagen', model: 'Polo', year: 2021, mileage: 1000,
    } })).status, 409);
  });

  await t.test('CRUD dos cadastros mantém relações e exclusão lógica', async () => {
    const createdClient = await success(fixture, '/clients', { method: 'POST', body: {
      name: 'Cliente da integração MySQL', cpf: '52998224725', phone: '14988887777', email: 'cliente.mysql@exemplo.local',
    } });
    assert.equal((await success(fixture, '/clients/' + createdClient.id)).name, createdClient.name);
    assert.equal((await success(fixture, '/clients/' + createdClient.id, { method: 'PUT', body: { phone: '14988887778' } })).phone, '14988887778');
    const createdVehicle = await success(fixture, '/vehicles', { method: 'POST', body: {
      clientId: createdClient.id, plate: 'MYS1A23', chassis: '9BWZZZ377VT004253', brand: 'Volkswagen', model: 'Gol', year: 2020, mileage: 1000,
    } });
    assert.equal((await success(fixture, '/vehicles/' + createdVehicle.id)).clientId, createdClient.id);
    assert.equal((await success(fixture, '/vehicles/' + createdVehicle.id, { method: 'PUT', body: { mileage: 1200 } })).mileage, 1200);
    assert.equal((await success(fixture, '/vehicles/' + createdVehicle.id, { method: 'DELETE', body: {} })).active, false);

    const longSupplierName = 'Fornecedor de integração '.padEnd(160, 'A');
    const catalogues = [
      ['services', { name: 'Revisão de integração', description: 'Conferência de teste', purpose: 'execucao', price: 80,
        durationMinutes: 30, inspectionItems: ['Conferência visual'] }, { price: 90 }, 'price', 90],
      ['suppliers', { name: longSupplierName, cnpj: '12345678000195', contact: 'compras@teste.local', leadDays: 2 }, { leadDays: 4 }, 'leadDays', 4],
      ['parts', { code: 'MYSQL-CRUD', description: 'Peça de integração', unit: 'UN', cost: 10, price: 20,
        supplierId: supplier.id, manualMinimum: 2 }, { price: 25 }, 'price', 25],
      ['users', { name: 'Auxiliar da integração', email: 'auxiliar.mysql@oscar.local', role: 'mecanico', password: PASSWORD },
        { name: 'Auxiliar MySQL atualizado' }, 'name', 'Auxiliar MySQL atualizado'],
    ];
    for (const [resource, body, update, field, expected] of catalogues) {
      const created = await success(fixture, '/' + resource, { method: 'POST', body });
      const path = '/' + resource + '/' + created.id;
      const read = await success(fixture, path);
      assert.equal(read.id, created.id);
      if (resource === 'suppliers') {
        assert.equal(read.name.length, 160);
        assert.equal(read.name, longSupplierName);
      }
      assert.equal((await success(fixture, path, { method: 'PUT', body: update }))[field], expected);
      assert.equal((await success(fixture, path, { method: 'DELETE', body: {} })).active, false);
    }
    const draft = (await store.list('budgets')).find(item => item.status === 'rascunho');
    await success(fixture, '/budgets/' + draft.id + '/publish', { method: 'POST', body: {} });
    const liveBudget = await store.get('budgets', draft.id);
    assert.equal(liveBudget.status, 'publicado');
    assert.ok(liveBudget.tokenHash && liveBudget.link);
    const invitation = (await store.list('emails')).find(item => item.to === createdClient.email && item.kind === 'convite');
    assert.match(invitation.link, /\/redefinir\//);
    await store.backup();
    const initialSnapshots = await store.db.prepare('SELECT payload FROM backups').all();
    for (const snapshot of initialSnapshots) {
      const payload = typeof snapshot.payload === 'string' ? JSON.parse(snapshot.payload) : snapshot.payload;
      const savedBudget = payload.records.budgets.find(item => item.id === draft.id);
      assert.equal(savedBudget.tokenHash, null);
      assert.equal(savedBudget.link, null);
      assert.equal(savedBudget.status, 'expirado');
      const savedInvitation = payload.records.emails.find(item => item.id === invitation.id);
      assert.equal(savedInvitation.link, null);
      const serialized = JSON.stringify(payload);
      for (const liveSecret of [liveBudget.tokenHash, liveBudget.link, invitation.link]) {
        assert.ok(!serialized.includes(liveSecret), 'Um link temporário ou seu token foi copiado para o snapshot.');
      }
    }
    const unchangedBudget = await store.get('budgets', draft.id);
    assert.equal(unchangedBudget.status, 'publicado');
    assert.equal(unchangedBudget.tokenHash, liveBudget.tokenHash);
    assert.equal(unchangedBudget.link, liveBudget.link);
    const erased = await success(fixture, '/clients/' + createdClient.id, { method: 'DELETE', body: { confirmation: 'ANONIMIZAR' } });
    assert.equal(erased.active, false);
    assert.ok(erased.anonymizedAt);
    assert.equal((await success(fixture, '/clients/' + createdClient.id)).cpf, '');
    const snapshots = await store.db.prepare('SELECT payload FROM backups').all();
    assert.ok(snapshots.length > 0);
    for (const snapshot of snapshots) {
      const payload = typeof snapshot.payload === 'string' ? snapshot.payload : JSON.stringify(snapshot.payload);
      for (const identifier of ['52998224725', 'cliente.mysql@exemplo.local', '14988887778', createdClient.name]) {
        assert.ok(!payload.includes(identifier), 'O snapshot ainda contém o identificador removido: ' + identifier);
      }
    }
  });

  await t.test('duas requisições concorrentes não reservam o mesmo mecânico e horário', async () => {
    const date = futureDate(365);
    const availability = await success(fixture, '/availability?date=' + date + '&serviceIds=' + service.id);
    const slot = availability.slots.find(item => item.mechanicId === mechanic.id);
    assert.ok(slot);
    const body = { clientId: client.id, vehicleId: vehicle.id, mechanicId: mechanic.id, serviceIds: [service.id], date, time: slot.time };
    const attempts = await Promise.all([
      request(fixture, '/appointments', { method: 'POST', body }),
      request(fixture, '/appointments', { method: 'POST', body, email: 'atendente@oscar.local' }),
    ]);
    assert.deepEqual(attempts.map(item => item.status).sort(), [201, 409]);
    const appointment = attempts.find(item => item.status === 201).data;
    const appointmentServices = await store.db.prepare('SELECT serviceId FROM appointment_services WHERE appointmentId=?').all(appointment.id);
    assert.deepEqual(appointmentServices.map(item => item.serviceId), [service.id]);
    const query = await success(fixture, '/queries/appointments?date=' + date + '&mechanicId=' + mechanic.id);
    assert.equal(query.items.filter(item => item.time === slot.time).length, 1);
    assert.equal(query.items.find(item => item.id === appointment.id).clientName, client.name);
    assert.equal(query.items.find(item => item.id === appointment.id).vehiclePlate, vehicle.plate);
    assert.equal((await success(fixture, '/appointments/' + appointment.id)).id, appointment.id);
    const changed = await success(fixture, '/appointments/' + appointment.id, { method: 'PUT', body: { date: futureDate(366), reason: 'Cliente pediu outro dia.' } });
    assert.equal(changed.date, futureDate(366));
    const deleted = await success(fixture, '/appointments/' + appointment.id, { method: 'DELETE', body: { reason: 'Cancelado no teste.' } });
    assert.equal(deleted.status, 'cancelado');
  });

  await t.test('estoque, movimentação corrigível e relatórios executam SQL no MySQL', async () => {
    const part = await success(fixture, '/parts', { method: 'POST', body: { code: 'MYSQL-ESTOQUE', description: 'Peça para verificar saldo',
      unit: 'UN', cost: 10, price: 20, supplierId: supplier.id, manualMinimum: 2 } });
    const date = new Date().toISOString().slice(0, 10);
    const entry = await success(fixture, '/stock/entries', { method: 'POST', body: { partId: part.id, supplierId: supplier.id, quantity: 3, date } });
    assert.equal((await success(fixture, '/movements/' + entry.id)).quantity, 3);
    await success(fixture, '/movements/' + entry.id, { method: 'PUT', body: { quantity: 4, notes: 'Conferência do recebimento.' } });
    assert.equal((await store.get('parts', part.id)).stock, 4);
    assert.equal((await request(fixture, '/movements/' + entry.id, { method: 'DELETE', body: {} })).status, 204);
    assert.equal((await store.get('parts', part.id)).stock, 0);
    await success(fixture, '/stock/entries', { method: 'POST', body: { partId: part.id, supplierId: supplier.id, quantity: 2, date } });
    const lowStock = await success(fixture, '/queries/parts/low-stock');
    assert.ok(lowStock.items.some(item => item.id === part.id && item.stock === 2));

    let order = await success(fixture, '/orders', { method: 'POST', body: { clientId: client.id, vehicleId: vehicle.id,
      mechanicId: mechanic.id, serviceIds: [service.id], approvalMethod: 'presencial' } });
    order = await success(fixture, '/orders/' + order.id + '/items', { method: 'POST', body: { partId: part.id, quantity: 3, approvalMethod: 'presencial' } });
    const impossible = order.items.find(item => item.partId === part.id);
    order = await success(fixture, '/orders/' + order.id + '/items', { method: 'POST', body: { partId: part.id, quantity: 1, approvalMethod: 'presencial' } });
    const possible = order.items.find(item => item.partId === part.id && item.id !== impossible.id);
    const components = await store.db.prepare('SELECT itemId, serviceId, partId FROM order_items WHERE orderId=? AND section=?').all(order.id, 'items');
    assert.equal(components.length, order.items.length);
    assert.ok(components.some(item => item.serviceId === service.id));
    assert.ok(components.some(item => item.partId === part.id));
    for (const status of ['inspecao', 'aguardando_aprovacao', 'execucao']) {
      await success(fixture, '/orders/' + order.id + '/status', { method: 'POST', body: { status } });
    }
    const beforeMovements = (await store.list('movements')).length;
    assert.equal((await request(fixture, '/orders/' + order.id + '/execute', { method: 'POST', body: { itemId: impossible.id } })).status, 409);
    assert.equal((await store.get('parts', part.id)).stock, 2);
    assert.equal((await store.list('movements')).length, beforeMovements);
    await success(fixture, '/orders/' + order.id + '/execute', { method: 'POST', body: { itemId: possible.id } });
    const serviceItem = order.items.find(item => item.serviceId === service.id);
    await success(fixture, '/orders/' + order.id + '/execute', { method: 'POST', body: { itemId: serviceItem.id } });
    assert.equal((await store.get('parts', part.id)).stock, 1);
    const report = await success(fixture, '/reports?from=2020-01-01&to=2099-12-31');
    assert.ok(report.services.some(item => item.orderId === order.id && item.clientName === client.name && item.vehiclePlate === vehicle.plate));
    assert.equal(report.parts.find(item => item.partId === part.id).quantity, 1);
    const csv = await request(fixture, '/reports?format=csv');
    assert.match(csv.response.headers.get('content-type'), /text\/csv/);
    assert.match(csv.data, /Cliente/);
  });

  await t.test('consulta SQL de reposição respeita mínimo automático e consumo líquido', async () => {
    const automaticSupplier = (await store.list('suppliers')).find(item => item.active && item.leadDays === 5);
    assert.ok(automaticSupplier);
    const part = await success(fixture, '/parts', { method: 'POST', body: { code: 'MYSQL-AUTOMATICO',
      description: 'Peça com mínimo calculado pelo histórico', unit: 'UN', cost: 8, price: 15,
      supplierId: automaticSupplier.id, manualMinimum: null } });
    const settings = await store.settings();
    await store.saveSettings({ ...settings, consumptionWindowDays: 30, defaultLeadDays: 5 });
    await store.save('parts', { ...await store.get('parts', part.id), stock: 3, manualMinimum: null,
      historyStartedAt: new Date(Date.now() - 60 * 86400000).toISOString() });
    const movementDate = new Date(Date.now() - 10 * 86400000).toISOString();
    await store.save('movements', { partId: part.id, orderId: null, supplierId: null,
      type: 'saida', quantity: 70, date: movementDate, notes: 'Consumo para verificar a política de reposição.' });
    await store.save('movements', { partId: part.id, orderId: null, supplierId: null,
      type: 'estorno', quantity: 10, date: movementDate, notes: 'Estorno deve reduzir o consumo líquido.' });
    const policy = await success(fixture, '/parts/' + part.id);
    assert.equal(policy.manualMinimum, null);
    assert.equal(policy.hasHistory, true);
    assert.equal(policy.averageDaily, 2);
    assert.equal(policy.minimum, 10);
    assert.equal(policy.suggested, 7);
    assert.equal(policy.lowStock, true);
    const lowStock = await success(fixture, '/queries/parts/low-stock');
    const found = lowStock.items.find(item => item.id === part.id);
    assert.ok(found, 'A consulta SQL deixou de incluir a peça com mínimo automático.');
    assert.equal(found.stock, 3);
    assert.equal(found.minimum, policy.minimum);
    assert.equal(found.lowStock, policy.lowStock);
  });

  await t.test('corte de 30 dias preserva horário ISO e exclui consumo anterior à janela', async () => {
    const automaticSupplier = (await store.list('suppliers')).find(item => item.active && item.leadDays === 5);
    const part = await success(fixture, '/parts', { method: 'POST', body: { code: 'MYSQL-LIMITE-JANELA',
      description: 'Peça com consumo na borda da janela', unit: 'UN', cost: 8, price: 15,
      supplierId: automaticSupplier.id, manualMinimum: null } });
    const referenceNow = Date.now();
    await store.save('parts', { ...await store.get('parts', part.id), stock: 3, manualMinimum: null,
      historyStartedAt: new Date(referenceNow - 60 * 86400000).toISOString() });
    const cutoff = referenceNow - 30 * 86400000;
    const insideIso = new Date(cutoff + 3600000).toISOString();
    const outsideIso = new Date(cutoff - 3600000).toISOString();
    const inside = await store.save('movements', { partId: part.id, orderId: null, supplierId: null,
      type: 'saida', quantity: 60, date: insideIso, notes: 'Uma hora depois do corte pertence à janela.' });
    const outside = await store.save('movements', { partId: part.id, orderId: null, supplierId: null,
      type: 'saida', quantity: 600, date: outsideIso, notes: 'Uma hora antes do corte deve ser excluída.' });
    assert.equal((await store.get('movements', inside.id)).date, insideIso);
    assert.equal((await store.get('movements', outside.id)).date, outsideIso);
    const sqlDate = await store.db.prepare('SELECT date FROM movements WHERE id=?').get(inside.id);
    assert.equal(sqlDate.date, insideIso.slice(0, 10));
    const policy = await success(fixture, '/parts/' + part.id);
    assert.equal(policy.averageDaily, 2);
    assert.equal(policy.minimum, 10);
    const query = await success(fixture, '/queries/parts/low-stock');
    const found = query.items.find(item => item.id === part.id);
    assert.ok(found);
    assert.equal(found.minimum, 10);
    assert.equal(found.minimum, policy.minimum);
  });

  await t.test('pedido do catálogo confirma agenda com cadastros provisórios e sem duplicação', async () => {
    const date = futureDate(370);
    const serviceIds = [service.id, evaluation.id];
    const created = await success(fixture, '/public/service-requests', { method: 'POST', authenticated: false, body: {
      name: 'Cliente vindo do catálogo MySQL', phone: '14977776666', vehicle: 'Chevrolet Onix 2021', plate: 'SQL9A21',
      symptoms: 'A luz de injeção acende ao acelerar.', serviceIds, preferredDate: date, preferredPeriod: 'manha',
    } });
    const availability = await success(fixture, '/availability?date=' + date + '&serviceIds=' + serviceIds.join(','));
    const slot = availability.slots.find(item => item.mechanicId === mechanic.id);
    const usersBefore = (await store.list('users')).length;
    const body = { date, time: slot.time, mechanicId: mechanic.id, contactConfirmed: true };
    const first = await request(fixture, '/service-requests/' + created.id + '/confirm', { method: 'POST', body });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const confirmed = first.data;
    assert.equal(confirmed.client.registrationStatus, 'provisorio');
    assert.equal(confirmed.client.cpf, '');
    assert.equal(confirmed.client.email, '');
    assert.equal(confirmed.vehicle.registrationStatus, 'provisorio');
    assert.equal(confirmed.vehicle.chassis, '');
    assert.equal(confirmed.request.appointmentId, confirmed.appointment.id);
    assert.equal(confirmed.appointment.serviceRequestId, created.id);
    assert.equal(confirmed.appointment.clientId, confirmed.client.id);
    assert.equal((await store.list('users')).length, usersBefore);
    const repeated = await request(fixture, '/service-requests/' + created.id + '/confirm', { method: 'POST', body });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.appointment.id, confirmed.appointment.id);
    const link = await store.db.prepare(`SELECT r.appointmentId, a.serviceRequestId, a.clientId, v.clientId AS ownerId
      FROM service_requests r JOIN appointments a ON a.id=r.appointmentId JOIN vehicles v ON v.id=a.vehicleId WHERE r.id=?`).get(created.id);
    assert.equal(link.appointmentId, confirmed.appointment.id);
    assert.equal(link.serviceRequestId, created.id);
    assert.equal(link.clientId, link.ownerId);
  });

  await t.test('gerenciamento de O.S., orçamento, chamado e pedido respeita o histórico', async () => {
    const body = { clientId: client.id, vehicleId: vehicle.id, mechanicId: mechanic.id, serviceIds: [service.id], approvalMethod: 'presencial' };
    const order = await success(fixture, '/orders', { method: 'POST', body });
    assert.equal((await success(fixture, '/orders/' + order.id)).order.id, order.id);
    assert.equal((await success(fixture, '/orders/' + order.id, { method: 'PUT', body: { assessmentNotes: 'Relato atualizado para conferência.' } })).assessmentNotes, 'Relato atualizado para conferência.');
    assert.equal((await success(fixture, '/orders/' + order.id, { method: 'DELETE', body: {} })).status, 'cancelada');

    const budgetOrder = await success(fixture, '/orders', { method: 'POST', body });
    await success(fixture, '/orders/' + budgetOrder.id + '/status', { method: 'POST', body: { status: 'inspecao' } });
    await success(fixture, '/orders/' + budgetOrder.id + '/findings', { method: 'POST', body: { serviceId: evaluation.id, justification: 'Verificar falha observada.' } });
    const budget = await success(fixture, '/budgets', { method: 'POST', body: { orderId: budgetOrder.id } });
    assert.equal((await success(fixture, '/budgets/' + budget.id)).id, budget.id);
    const changed = await success(fixture, '/budgets/' + budget.id, { method: 'PUT', body: { items: budget.items.map(item => ({ ...item, price: item.price + 10 })) } });
    assert.equal(changed.items[0].price, budget.items[0].price + 10);
    assert.equal((await request(fixture, '/budgets/' + budget.id, { method: 'DELETE', body: {} })).status, 204);

    const closedOrder = (await store.list('orders')).find(item => item.status === 'encerrada');
    const ticket = await success(fixture, '/tickets', { method: 'POST', body: { orderId: closedOrder.id, description: 'Conferência do atendimento.' } });
    assert.equal((await success(fixture, '/tickets/' + ticket.id)).id, ticket.id);
    assert.equal((await success(fixture, '/tickets/' + ticket.id, { method: 'PUT', body: { notes: 'Cliente contatado.' } })).notes, 'Cliente contatado.');
    assert.equal((await request(fixture, '/tickets/' + ticket.id, { method: 'DELETE', body: {} })).status, 204);

    const pending = await success(fixture, '/service-requests', { method: 'POST', body: { name: 'Pedido interno de teste', phone: '14966665555',
      vehicle: 'Fiat Argo', symptoms: 'Ruído ao frear.', serviceIds: [evaluation.id], preferredDate: futureDate(380), preferredPeriod: 'tarde' } });
    assert.equal((await success(fixture, '/service-requests/' + pending.id)).id, pending.id);
    assert.equal((await success(fixture, '/service-requests/' + pending.id, { method: 'PUT', body: { symptoms: 'Ruído ao frear em baixa velocidade.' } })).symptoms, 'Ruído ao frear em baixa velocidade.');
    assert.equal((await success(fixture, '/service-requests/' + pending.id, { method: 'DELETE', body: {} })).status, 'cancelada');
  });
});
