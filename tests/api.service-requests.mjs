import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/server.mjs';
import { createStore } from '../server/store.mjs';

async function fixture(t) {
 const api = createApi({ filename: ':memory:', runMaintenance: false });
 api.server.listen(0, '127.0.0.1');
 await once(api.server, 'listening');
 t.after(() => api.close());
 return { ...api, base: 'http://127.0.0.1:' + api.server.address().port + '/api' };
}

async function request(a, path, { method = 'GET', body, session } = {}) {
 const headers = {};
 if (session) { headers.cookie = session.cookie; headers['x-csrf-token'] = session.csrfToken; }
 if (body !== undefined) headers['content-type'] = 'application/json';
 const response = await fetch(a.base + path, {
  method, headers, body: body === undefined ? undefined : JSON.stringify(body),
 });
 return { status: response.status, data: await response.json(), response };
}

async function login(a, email = 'atendente@oscar.local') {
 const result = await request(a, '/login', { method: 'POST', body: { email, password: 'Oscar@2026!' } });
 assert.equal(result.status, 200);
 return { ...result.data, cookie: result.response.headers.get('set-cookie').split(';')[0] };
}

const input = {
 name: 'Cliente Teste',
 phone: '(14) 99999-1111',
 vehicle: 'Honda Civic 2019',
 plate: 'ABC1D23',
 symptoms: 'Luz da injeção acesa e carro falhando ao acelerar.',
 serviceIds: [1, 5],
 preferredDate: '2030-06-12',
 preferredPeriod: 'manha',
};

test('Solicitação pública soma preços do catálogo, fica pendente e chega apenas à equipe', async t => {
 const a = await fixture(t);
 const catalogue = await request(a, '/public/services');
 assert.equal(catalogue.status, 200);
 assert.equal(catalogue.data.find(service => service.id === 5).purpose, 'avaliacao');
 const created = await request(a, '/public/service-requests', {
  method: 'POST', body: { ...input, total: 0, status: 'atendida', services: [{ id: 1, price: 0 }] },
 });
 assert.equal(created.status, 201, JSON.stringify(created.data));
 assert.equal(created.data.status, 'pendente');
 assert.equal(created.data.total, 270);
 assert.equal(created.data.durationMinutes, 105);
 assert.equal(created.data.name, undefined);
 assert.equal((await request(a, '/service-requests')).status, 401);
 const client = await login(a, 'cliente@oscar.local');
 assert.equal((await request(a, '/service-requests', { session: client })).status, 403);
 const staff = await login(a);
 const list = await request(a, '/service-requests?page=1&pageSize=100', { session: staff });
 assert.equal(list.status, 200);
 assert.equal(list.data.total, 1);
 const record = list.data.items[0];
 assert.equal(record.id, created.data.id);
 assert.equal(record.name, input.name);
 assert.equal(record.phone, input.phone);
 assert.equal(record.preferredDate, input.preferredDate);
 assert.equal(record.preferredPeriod, input.preferredPeriod);
 assert.deepEqual(record.services.map(service => service.name), ['Troca de óleo', 'Diagnóstico eletrônico']);
 assert.equal(record.total, 270);
 assert.equal((await request(a, '/appointments', { session: staff })).data.total, 3);
 const contacted = await request(a, '/service-requests/' + record.id, {
  method: 'PUT', session: staff, body: { status: 'em_contato', total: 0 },
 });
 assert.equal(contacted.status, 200);
 assert.equal(contacted.data.total, 270);
 assert.equal(contacted.data.status, 'em_contato');
 assert.equal((await request(a, '/service-requests/' + record.id, {
  method: 'PUT', session: staff, body: { status: 'pendente' },
 })).status, 409);
 const done = await request(a, '/service-requests/' + record.id, {
  method: 'PUT', session: staff, body: { status: 'atendida' },
 });
 assert.equal(done.status, 200);
 assert.equal((await request(a, '/appointments', { session: staff })).data.total, 3);
});

test('Solicitação rejeita seleção inválida, serviço inativo, diagnóstico sem relato e data passada', async t => {
 const a = await fixture(t);
 async function submit(body) {
  return await request(a, '/public/service-requests', { method: 'POST', body });
 }
 assert.equal((await submit({ ...input, serviceIds: [] })).status, 422);
 assert.equal((await submit({ ...input, serviceIds: [1, 1] })).status, 422);
 assert.equal((await submit({ ...input, serviceIds: ['1'] })).status, 422);
 assert.equal((await submit({ ...input, serviceIds: [5], symptoms: '' })).status, 422);
 assert.equal((await submit({ ...input, phone: '123' })).status, 422);
 assert.equal((await submit({ ...input, preferredDate: '2020-01-01' })).status, 422);
 assert.equal((await submit({ ...input, preferredPeriod: 'noite' })).status, 422);
 assert.equal((await a.store.list('service_requests')).length, 0);
 const inactive = await a.store.get('services', 1);
 await a.store.save('services', { ...inactive, active: false });
 assert.equal((await submit({ ...input, serviceIds: [1] })).status, 422);
});
test('Solicitação enviada permanece na base SQLite após reiniciar a API', async t => {
 const directory = mkdtempSync(join(tmpdir(), 'oscar-request-'));
 t.after(() => rmSync(directory, { recursive: true, force: true }));
 const filename = join(directory, 'oscar.sqlite');
 const first = createApi({ filename, runMaintenance: false });
 first.server.listen(0, '127.0.0.1');
 await once(first.server, 'listening');
 const a = { ...first, base: 'http://127.0.0.1:' + first.server.address().port + '/api' };
 const created = await request(a, '/public/service-requests', { method: 'POST', body: input });
 assert.equal(created.status, 201);
 await first.close();
 const second = createApi({ filename, runMaintenance: false });
 assert.equal((await second.store.list('service_requests')).length, 1);
 assert.equal((await second.store.get('service_requests', created.data.id)).total, 270);
 await second.store.close();
});

test('gerente anonimiza solicitação e cópia local sem permitir restauração por mudança de status', async t => {
 const directory = mkdtempSync(join(tmpdir(), 'oscar-request-privacy-'));
 const filename = join(directory, 'oscar.sqlite');
 const api = createApi({ filename, runMaintenance: false });
 api.server.listen(0, '127.0.0.1');
 await once(api.server, 'listening');
 t.after(async () => { await api.close(); rmSync(directory, { recursive: true, force: true }); });
 const a = { ...api, base: 'http://127.0.0.1:' + api.server.address().port + '/api' };
 const created = await request(a, '/public/service-requests', { method: 'POST', body: input });
 assert.equal(created.status, 201);
 const backup = api.store.backup();
 const path = '/service-requests/' + created.data.id + '/anonymize';
 assert.equal((await request(a, path, { method: 'POST', body: {} })).status, 401);
 const staff = await login(a);
 assert.equal((await request(a, path, { method: 'POST', session: staff, body: {} })).status, 403);
 const manager = await login(a, 'gerente@oscar.local');
 const removed = await request(a, path, { method: 'POST', session: manager, body: {} });
 assert.equal(removed.status, 200, JSON.stringify(removed.data));
 assert.equal(removed.data.backupPurge.processed, 1);
 assert.equal(removed.data.name, 'Solicitação anonimizada');
 assert.equal(removed.data.phone, '');
 assert.equal(removed.data.status, 'cancelada');
 const active = await api.store.get('service_requests', created.data.id);
 assert.equal(active.symptoms, '');
 assert.equal(active.plate, '');
 assert.equal((await request(a, '/service-requests/' + created.data.id,
  { method: 'PUT', session: staff, body: { status: 'em_contato' } })).status, 409);
 const copy = createStore({ filename: join(directory, 'backups', backup.filename), seed: false });
 try {
  const saved = copy.get('service_requests', created.data.id);
  assert.equal(saved.name, 'Solicitação anonimizada');
  assert.equal(saved.phone, '');
  assert.equal(saved.symptoms, '');
 } finally { copy.close(); }
 assert.equal((await request(a, path, { method: 'POST', session: manager, body: {} })).status, 200);
});

test('anonimizar cliente também expurga sua solicitação das cópias SQLite', async t => {
 const directory = mkdtempSync(join(tmpdir(), 'oscar-client-request-privacy-'));
 const filename = join(directory, 'oscar.sqlite');
 const api = createApi({ filename, runMaintenance: false });
 api.server.listen(0, '127.0.0.1');
 await once(api.server, 'listening');
 t.after(async () => { await api.close(); rmSync(directory, { recursive: true, force: true }); });
 const a = { ...api, base: 'http://127.0.0.1:' + api.server.address().port + '/api' };
 const created = await request(a, '/public/service-requests', {
  method: 'POST', body: { ...input, name: 'Titular da solicitação', phone: '14999990001' },
 });
 assert.equal(created.status, 201);
 const backup = api.store.backup();
 const manager = await login(a, 'gerente@oscar.local');
 const removed = await request(a, '/clients/1/anonymize', {
  method: 'POST', session: manager, body: { confirmation: 'ANONIMIZAR' },
 });
 assert.equal(removed.status, 200, JSON.stringify(removed.data));
 assert.equal((await api.store.get('service_requests', created.data.id)).phone, '');
 const copy = createStore({ filename: join(directory, 'backups', backup.filename), seed: false });
 try {
  const saved = copy.get('service_requests', created.data.id);
  assert.equal(saved.name, 'Solicitação anonimizada');
  assert.equal(saved.symptoms, '');
 } finally { copy.close(); }
});
