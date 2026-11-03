import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApi } from '../server/server.mjs';
import { createVercelHandler } from '../api/index.mjs';
import { createPgFixture } from './helpers/postgres-fixture.mjs';
import { seedPgDemo } from './helpers/demo-postgres.mjs';

const env = { DATABASE_URL: 'postgresql://fixture:local-password@127.0.0.1:6543/postgres?sslmode=require', APP_ORIGIN: 'https://oscar.example.invalid', CRON_SECRET: 'fixture-local-maintenance-secret-1234567890' };

test('HTTP serverless + PostgreSQL local: aprovação, concorrência, estoque, permissões e privacidade', async t => {
  const fixture = await createPgFixture();
  await seedPgDemo(fixture);
  let api;
  const handler = createVercelHandler({ env,
    loadApi: async () => ({ createApi(options) { api = createApi(options); return api; } }),
    loadStore: async () => ({ createPostgresStore: async () => fixture.store }),
  });
  // Simula o JSON já processado pela camada serverless. Os demais testes cobrem o stream HTTP bruto.
  const server = http.createServer(async (req, res) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    }
    await handler(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await api?.close(); await fixture.close();
  });
  function request(path, { method = 'GET', body, session, headers = {} } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port,
        path: '/api/index?__oscar_path=' + encodeURIComponent(path.replace(/^\//, '')),
        method, headers: { host: 'oscar.example.invalid', origin: env.APP_ORIGIN,
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrfToken } : {}), ...headers } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
          const raw = Buffer.concat(chunks).toString(); let data;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      }); req.on('error', reject); req.end(payload);
    });
  }
  async function ok(path, options) { const result = await request(path, options); assert.ok(result.status < 300, path + ': ' + result.status + ' ' + JSON.stringify(result.data)); return result.data; }
  async function login(email = 'gerente@oscar.local') {
    const result = await request('/login', { method: 'POST', body: { email, password: 'Oscar@2026!' } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.match(result.headers['set-cookie'][0], /Secure/);
    return { ...result.data, cookie: result.headers['set-cookie'][0].split(';')[0] };
  }
  const health = await ok('/health'); assert.equal(health.database, 'postgres');
  assert.equal((await request('/bootstrap')).status, 401);
  const manager = await login();
  let order, partItem, stock;
  await t.test('RN06/RN10/RN11: aprovação complementar e encerramento protegido', async () => {
    stock = (await fixture.store.get('parts', 1)).stock;
    order = await ok('/orders', { method: 'POST', session: manager, body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } });
    order = await ok(`/orders/${order.id}/items`, { method: 'POST', session: manager, body: { partId: 1, quantity: 2, approvalMethod: 'presencial' } });
    order = await ok(`/orders/${order.id}/status`, { method: 'POST', session: manager, body: { status: 'inspecao' } });
    await ok(`/orders/${order.id}/findings`, { method: 'POST', session: manager, body: { serviceId: 4, justification: 'Verificação complementar fictícia' } });
    const budget = await ok(`/orders/${order.id}/budgets`, { method: 'POST', session: manager, body: {} });
    const published = await ok(`/budgets/${budget.id}/publish`, { method: 'POST', session: manager, body: {} });
    const token = published.link.split('/').at(-1);
    const view = await ok('/public/budgets/' + token);
    for (const secret of ['12345678909', 'cliente@oscar.local', 'ABC1D23']) assert.ok(!JSON.stringify(view).includes(secret));
    await ok('/public/budgets/' + token, { method: 'POST', body: { decisions: budget.items.map(item => ({ itemId: item.id, decision: 'aprovado' })) } });
    assert.ok((await request('/public/budgets/' + token)).status >= 400);
    order = (await ok(`/orders/${order.id}`, { session: manager })).order;
    assert.equal(order.status, 'execucao');
    assert.equal((await request(`/orders/${order.id}/status`, { method: 'POST', session: manager, body: { status: 'concluida' } })).status, 409);
    partItem = order.items.find(item => item.partId === 1);
  });
  await t.test('Requisições concorrentes baixam a peça uma única vez; estorno devolve o saldo', async () => {
    assert.ok(order && partItem, 'O fluxo anterior precisa ter sido aprovado.');
    const operation = () => request(`/orders/${order.id}/execute`, { method: 'POST', session: manager, body: { itemId: partItem.id } });
    const results = await Promise.all([operation(), operation()]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal((await fixture.store.get('parts', 1)).stock, stock - 2);
    await ok(`/orders/${order.id}/reverse`, { method: 'POST', session: manager, body: { itemId: partItem.id, reason: 'Teste de devolução' } });
    assert.equal((await fixture.store.get('parts', 1)).stock, stock);
    for (const item of order.items.filter(item => item.decision === 'aprovado')) await ok(`/orders/${order.id}/execute`, { method: 'POST', session: manager, body: { itemId: item.id } });
    await ok(`/orders/${order.id}/status`, { method: 'POST', session: manager, body: { status: 'concluida' } });
    order = await ok(`/orders/${order.id}/status`, { method: 'POST', session: manager, body: { status: 'encerrada' } });
    assert.equal(order.warrantyDays, 90); assert.ok(order.closedAt);
  });
  await t.test('Cliente acessa apenas seus registros e não ganha acesso ao banco privado', async () => {
    const client = await login('cliente@oscar.local');
    assert.equal((await request('/orders/2', { session: client })).status, 404);
    assert.equal((await request('/emails', { session: client })).status, 403);
    const data = await ok('/bootstrap', { session: client });
    assert.ok(data.orders.every(item => item.clientId === 1));
    assert.ok(!JSON.stringify(data).includes('passwordHash'));
    assert.equal(data.emails.length, 0);
  });
  await t.test('Snapshot privado e anonimização preservam a exclusão no PostgreSQL', async () => {
    const backup = await ok('/backup', { method: 'POST', session: manager, body: {} });
    assert.ok(backup); assert.ok((await fixture.db.query('SELECT id FROM oscar_private.backups')).rows.length > 0);
    await ok('/clients/1/anonymize', { method: 'POST', session: manager, body: { confirmation: 'ANONIMIZAR' } });
    const serialized = JSON.stringify((await fixture.db.query('SELECT data FROM oscar_private.backups')).rows);
    for (const secret of ['12345678909', 'cliente@oscar.local', 'ABC1D23']) assert.ok(!serialized.includes(secret), secret);
    assert.equal((await fixture.store.get('clients', 1)).active, false);
  });
  await t.test('Manutenção exige segredo e não aparece como página Angular', async () => {
    assert.equal((await request('/_maintenance')).status, 401);
    const result = await request('/_maintenance', { headers: { authorization: 'Bearer ' + env.CRON_SECRET } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal((await request('/endpoint-inexistente', { session: manager })).status, 404);
  });
});