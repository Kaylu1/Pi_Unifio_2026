import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApi } from '../server/server.mjs';
import { createVercelHandler } from '../api/index.ts';
import { partPolicy } from '../server/common.mjs';
import { createPgFixture } from './helpers/postgres-fixture.mjs';
import { seedPgDemo } from './helpers/demo-postgres.mjs';

const DAY = 86400000;
const basic = (email = 'gerente@oscar.local') => 'Basic ' + Buffer.from(email + ':Oscar@2026!').toString('base64');

test('PostgreSQL serverless mantém CRUD e consultas da API acadêmica', async t => {
  const fixture = await createPgFixture();
  await seedPgDemo(fixture);
  let api;
  const environment = {
    APP_ORIGIN: 'https://oscar.example.test',
    DATABASE_URL: 'postgresql://fixture:local-password@127.0.0.1:6543/postgres',
    CRON_SECRET: 'fixture-postgres-academic-maintenance-secret',
  };
  const handler = createVercelHandler({ env: environment,
    loadApi: async () => ({ createApi: options => (api = createApi({ ...options, emailTransport: async () => undefined })) }),
    loadStore: async () => ({ createPostgresStore: async () => fixture.store }),
    waitUntil: promise => void promise.catch(() => undefined),
  });
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await api?.close();
    await fixture.close();
  });
  async function request(path, { method = 'GET', body, authorization = basic() } = {}) {
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const payload = body === undefined && !mutation ? undefined : JSON.stringify(body ?? {});
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api' + path, method,
        headers: { host: 'oscar.example.test', origin: environment.APP_ORIGIN,
          ...(authorization ? { authorization } : {}),
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, data: text ? JSON.parse(text) : null });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }
  async function ok(path, method = 'GET', body, expected = 200) {
    const response = await request(path, { method, body });
    assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(response.data));
    return response.data;
  }

  await t.test('HTTP Basic e exclusão de rascunho, entrada e chamado funcionam no adaptador PostgreSQL', async () => {
    assert.equal((await request('/clients', { authorization: null })).status, 401);
    assert.equal((await request('/services', { method: 'POST', body: { name: 'Restrito' }, authorization: basic('mecanico@oscar.local') })).status, 403);
    const order = await ok('/orders', 'POST', { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' }, 201);
    await ok('/orders/' + order.id, 'PUT', { assessmentNotes: 'Conferência da API publicada.' });
    await ok('/orders/' + order.id + '/status', 'POST', { status: 'inspecao' });
    const budget = await ok('/budgets', 'POST', { orderId: order.id,
      items: [{ serviceId: 2, quantity: 1, justification: 'Revisão complementar identificada na inspeção.' }] }, 201);
    await ok('/budgets/' + budget.id, 'PUT', { items: [{ serviceId: 2, quantity: 1, price: 290, justification: 'Valor atualizado ainda em rascunho.' }] });
    await ok('/budgets/' + budget.id, 'DELETE', undefined, 204);
    assert.equal((await request('/budgets/' + budget.id)).status, 404);

    const before = (await fixture.store.get('parts', 1)).stock;
    const date = new Date().toISOString().slice(0, 10);
    const movement = await ok('/movements', 'POST', { partId: 1, supplierId: 1, quantity: 3, date, notes: 'Entrada para conferência.' }, 201);
    await ok('/movements/' + movement.id, 'PUT', { quantity: 4, date, notes: 'Quantidade corrigida antes do consumo.' });
    assert.equal((await fixture.store.get('parts', 1)).stock, before + 4);
    await ok('/movements/' + movement.id, 'DELETE', undefined, 204);
    assert.equal((await fixture.store.get('parts', 1)).stock, before);
    assert.equal((await request('/movements/' + movement.id)).status, 404);

    const ticket = await ok('/tickets', 'POST', { orderId: 6, description: 'Solicitação de conferência após a entrega.' }, 201);
    await ok('/tickets/' + ticket.id, 'PUT', { status: 'aberto', notes: 'Cliente contatado para análise.' });
    await ok('/tickets/' + ticket.id, 'DELETE', undefined, 204);
    assert.equal((await request('/tickets/' + ticket.id)).status, 404);
  });

  await t.test('remoção respeita chaves estrangeiras e rollback sem aceitar tabela ou ID arbitrários', async () => {
    await assert.rejects(() => fixture.store.remove('clients', 1), error => error.code === '23503');
    assert.ok(await fixture.store.get('clients', 1));
    await assert.rejects(() => fixture.store.remove('clients; DROP SCHEMA oscar_private', 1), /Tabela não permitida/);
    await assert.rejects(() => fixture.store.remove('clients', -1), /Identificador inválido/);
    const draft = await fixture.store.save('budgets', { orderId: 1, number: 29001, status: 'rascunho', items: [] });
    assert.equal(await fixture.store.remove('budgets', draft.id), true);
    assert.equal(await fixture.store.remove('budgets', draft.id), false);
  });

  await t.test('consulta de agenda usa data, mecânico e nomes das tabelas relacionadas', async () => {
    const appointment = await fixture.store.save('appointments', { clientId: 1, vehicleId: 1, mechanicId: 3,
      serviceIds: [1], date: '2040-01-02', time: '09:00', durationMinutes: 45, status: 'agendado', reason: 'Consulta por mecânico.' });
    await fixture.store.save('appointments', { clientId: 2, vehicleId: 2, mechanicId: 6,
      serviceIds: [1], date: '2040-01-02', time: '10:00', durationMinutes: 45, status: 'agendado', reason: 'Outro mecânico.' });
    const result = await ok('/queries/appointments?date=2040-01-02&mechanicId=3');
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, appointment.id);
    assert.equal(result.items[0].clientName, 'Mariana Oliveira');
    assert.equal(result.items[0].vehiclePlate, 'ABC1D23');
    assert.equal(result.items[0].mechanicName, 'Rafael Lima');
    assert.equal((await request('/queries/appointments?date=2040-02-30')).status, 400);
    assert.equal((await request('/queries/appointments?date=2040-01-02', { authorization: basic('mecanico@oscar.local') })).status, 403);
  });

  await t.test('consulta de reposição coincide com a política de estoque manual e automático na borda da janela', async () => {
    const now = Date.now();
    const historyStartedAt = new Date(now - 60 * DAY).toISOString();
    const part = await fixture.store.save('parts', { supplierId: 2, code: 'PG-AUTO', description: 'Peça de consumo calculado',
      unit: 'UN', cost: 1, price: 2, stock: 3, manualMinimum: null, historyStartedAt, active: true });
    for (const [type, quantity, offset] of [['saida', 70, 30 * DAY - 3600000], ['saida', 600, 30 * DAY + 3600000], ['estorno', 10, 3600000]]) {
      await fixture.store.save('movements', { partId: part.id, orderId: null, supplierId: 2, type, quantity,
        date: new Date(now - offset).toISOString(), notes: 'Janela de consumo.' });
    }
    const manual = await fixture.store.save('parts', { ...part, id: undefined, code: 'PG-MANUAL-ZERO', manualMinimum: 0 });
    const recent = await fixture.store.save('parts', { ...part, id: undefined, code: 'PG-HISTORICO-RECENTE', historyStartedAt: new Date(now - 29 * DAY).toISOString() });
    await fixture.store.save('movements', { partId: recent.id, orderId: null, supplierId: 2, type: 'saida', quantity: 1000,
      date: new Date(now - 3600000).toISOString(), notes: 'Histórico insuficiente.' });
    const inactive = await fixture.store.save('parts', { ...part, id: undefined, code: 'PG-INATIVA', stock: 0, manualMinimum: 10, active: false });
    const expected = await partPolicy(fixture.store, part);
    assert.equal(expected.averageDaily, 2);
    assert.equal(expected.minimum, 10);
    const result = await ok('/queries/parts/low-stock');
    const actual = result.items.find(item => item.id === part.id);
    assert.ok(actual);
    assert.equal(actual.minimum, expected.minimum);
    assert.equal(actual.lowStock, true);
    assert.equal(result.items.find(item => item.id === 2).minimum, 5);
    assert.ok(!result.items.some(item => [manual.id, recent.id, inactive.id].includes(item.id)));
    assert.equal((await fixture.store.get('movements', (await fixture.store.list('movements')).find(item => item.partId === part.id && item.quantity === 70).id)).date,
      new Date(now - 30 * DAY + 3600000).toISOString());
  });
});
