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
    const response = await fetch(a.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), response };
}
async function ok(a, path, options) {
    const result = await request(a, path, options);
    assert.ok(result.status < 300, path + ': ' + result.status + ' ' + JSON.stringify(result.data));
    return result.data;
}
async function login(a, email = 'gerente@oscar.local') {
    const result = await request(a, '/login', { method: 'POST', body: { email, password: 'Oscar@2026!' } });
    assert.equal(result.status, 200);
    return { ...result.data, cookie: result.response.headers.get('set-cookie').split(';')[0] };
}
const orderInput = { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [5], startMode: 'avaliacao', approvalMethod: 'presencial' };

test('Avaliação: finalidade configurável preserva valor do cadastro e atualizações parciais', async t => {
    const a = await fixture(t), manager = await login(a);
    const demo = await a.store.get('services', 5);
    assert.equal(demo.purpose, 'avaliacao');
    assert.equal(demo.price, 150);
    const evaluation = await ok(a, '/services', { method: 'POST', session: manager, body: { name: 'Avaliação de ruído', description: 'Inspeção para localizar a origem do ruído.', purpose: 'avaliacao', price: 237.45, durationMinutes: 45, inspectionItems: ['Teste de rodagem'] } });
    const edited = await ok(a, '/services/' + evaluation.id, { method: 'PUT', session: manager, body: { description: 'Diagnóstico de ruído relatado pelo cliente.' } });
    assert.equal(edited.purpose, 'avaliacao');
    assert.equal(edited.price, 237.45);
    const order = await ok(a, '/orders', { method: 'POST', session: manager, body: { ...orderInput, serviceIds: [evaluation.id], price: 0 } });
    assert.equal(order.items[0].price, 237.45);
    assert.equal(order.items[0].servicePurpose, 'avaliacao');
    assert.deepEqual(order.evaluationServiceIds, [evaluation.id]);
    assert.equal((await request(a, '/services/' + evaluation.id, { method: 'PUT', session: manager, body: { purpose: 'gratis' } })).status, 422);
    const zero = await ok(a, '/services/' + evaluation.id, { method: 'PUT', session: manager, body: { price: 0 } });
    assert.equal(zero.price, 0);
    assert.equal(zero.purpose, 'avaliacao');
    const freeOrder = await ok(a, '/orders', { method: 'POST', session: manager, body: { ...orderInput, serviceIds: [evaluation.id] } });
    assert.equal(freeOrder.items[0].price, 0);
    // Editing a catalog later does not rewrite an existing authorization or amount.
    assert.equal((await ok(a, '/orders/' + order.id, { session: manager })).order.items[0].price, 237.45);
});

test('Avaliação HTTP: diagnóstico → necessidades → orçamento → aprovação → aplicação da peça', async t => {
    const a = await fixture(t), manager = await login(a), attendant = await login(a, 'atendente@oscar.local'), mechanic = await login(a, 'mecanico@oscar.local'), consultant = await login(a, 'consultor@oscar.local');
    await ok(a, '/services/5', { method: 'PUT', session: manager, body: { price: 317.45 } });
    const initialStock = (await a.store.get('parts', 3)).stock;
    let order = await ok(a, '/orders', { method: 'POST', session: attendant, body: { ...orderInput, assessmentNotes: 'Luz de falha acesa e ruído na frenagem.' } });
    const id = order.id;
    assert.equal(order.startMode, 'avaliacao');
    assert.equal(order.assessmentNotes, 'Luz de falha acesa e ruído na frenagem.');
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].price, 317.45);
    assert.equal(order.items[0].decision, 'aprovado');
    assert.equal(order.items[0].approvalBy, attendant.user.id);
    assert.ok(order.items[0].approvedAt);
    assert.equal(order.inspections.length, 3);
    order = await ok(a, '/orders/' + id + '/status', { method: 'POST', session: mechanic, body: { status: 'inspecao' } });
    await ok(a, '/orders/' + id + '/inspection', { method: 'POST', session: mechanic, body: { itemId: order.inspections[0].id, result: 'atencao', notes: 'Falha registrada no scanner.' } });
    await ok(a, '/orders/' + id + '/findings', { method: 'POST', session: mechanic, body: { partId: 3, quantity: 1, justification: 'Pastilha dianteira abaixo da espessura mínima.', decision: 'aprovado', approvalMethod: 'presencial' } });
    order = await ok(a, '/orders/' + id + '/findings', { method: 'POST', session: mechanic, body: { serviceId: 4, justification: 'Revisar o conjunto de freios.' } });
    assert.equal(order.items.length, 1);
    assert.ok(order.findings.every(item => item.decision === 'pendente' && !item.approvedAt));
    assert.equal((await request(a, '/orders/' + id + '/items', { method: 'POST', session: attendant, body: { partId: 3, approvalMethod: 'presencial' } })).status, 409);
    assert.equal((await request(a, '/orders/' + id + '/budgets', { method: 'POST', session: mechanic, body: {} })).status, 403);
    let budget = await ok(a, '/orders/' + id + '/budgets', { method: 'POST', session: consultant, body: {} });
    budget = await ok(a, '/budgets/' + budget.id + '/publish', { method: 'POST', session: consultant, body: {} });
    order = (await ok(a, '/orders/' + id, { session: manager })).order;
    const pendingPart = order.items.find(item => item.partId === 3);
    assert.equal(order.status, 'aguardando_aprovacao');
    assert.equal(pendingPart.decision, 'pendente');
    assert.equal((await request(a, '/orders/' + id + '/execute', { method: 'POST', session: mechanic, body: { itemId: pendingPart.id } })).status, 409);
    assert.equal((await request(a, '/orders/' + id + '/status', { method: 'POST', session: mechanic, body: { status: 'execucao' } })).status, 409);
    assert.equal((await a.store.get('parts', 3)).stock, initialStock);
    assert.equal((await a.store.list('movements')).filter(m => m.orderId === id).length, 0);
    const token = budget.link.split('/').at(-1);
    const publicView = await ok(a, '/public/budgets/' + token);
    assert.equal(publicView.items.length, 2);
    assert.ok(!JSON.stringify(publicView).includes(order.assessmentNotes));
    await ok(a, '/public/budgets/' + token, { method: 'POST', body: { decisions: budget.items.map(item => ({ itemId: item.id, decision: item.partId ? 'aprovado' : 'recusado' })) } });
    order = (await ok(a, '/orders/' + id, { session: manager })).order;
    assert.equal(order.status, 'execucao');
    assert.equal((await a.store.get('parts', 3)).stock, initialStock);
    const approvedPart = order.items.find(item => item.partId === 3), refused = order.items.find(item => item.serviceId === 4);
    assert.equal(approvedPart.approvalMethod, 'link');
    assert.ok(approvedPart.approvedAt);
    assert.equal((await request(a, '/orders/' + id + '/execute', { method: 'POST', session: mechanic, body: { itemId: refused.id } })).status, 409);
    for (const item of order.items.filter(item => item.decision === 'aprovado'))
        await ok(a, '/orders/' + id + '/execute', { method: 'POST', session: mechanic, body: { itemId: item.id } });
    assert.equal((await a.store.get('parts', 3)).stock, initialStock - 1);
    const movements = (await a.store.list('movements')).filter(m => m.orderId === id);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].itemId, approvedPart.id);
    await ok(a, '/orders/' + id + '/status', { method: 'POST', session: mechanic, body: { status: 'concluida' } });
    order = await ok(a, '/orders/' + id + '/status', { method: 'POST', session: attendant, body: { status: 'encerrada' } });
    assert.ok(order.closedAt);
    assert.equal(order.items.filter(item => item.decision === 'aprovado').reduce((sum, item) => sum + item.total, 0), 317.45 + 145);
    assert.ok((await a.store.list('audit')).some(entry => entry.entity === 'orders' && entry.recordId === id && entry.action === 'criar' && entry.details.startMode === 'avaliacao'));
});

test('Avaliação: valida modo, finalidade, serviço ativo e autorização inicial', async t => {
    const a = await fixture(t), session = await login(a);
    for (const body of [
        { ...orderInput, serviceIds: [1] },
        { ...orderInput, startMode: 'inventado' },
        { ...orderInput, serviceIds: [] },
        { ...orderInput, approvalMethod: undefined },
        { ...orderInput, assessmentNotes: 'x'.repeat(1001) }
    ]) assert.equal((await request(a, '/orders', { method: 'POST', session, body })).status, 422);
    await ok(a, '/services/5', { method: 'PUT', session, body: { active: false } });
    assert.equal((await request(a, '/orders', { method: 'POST', session, body: orderInput })).status, 422);
});

test('SQLite: migração de finalidade é idempotente e preserva preços e serviços personalizados', t => {
    const dir = mkdtempSync(join(tmpdir(), 'oscar-evaluation-'));
    const filename = join(dir, 'evaluation.sqlite');
    let store = createStore({ filename });
    t.after(() => { store?.close(); rmSync(dir, { recursive: true, force: true }); });
    const demo = store.get('services', 5);
    const legacy = { ...demo, price: 189.37 };
    delete legacy.purpose;
    store.save('services', legacy);
    const custom = store.save('services', { ...legacy, id: undefined, name: 'Diagnóstico personalizado', description: 'Teste específico da oficina.' });
    const explicit = store.save('services', { ...demo, id: undefined, purpose: 'execucao' });
    const identicalCopy = store.save('services', { ...legacy, id: undefined });
    const count = store.list('services').length;
    store.close();
    store = createStore({ filename, seed: false });
    const migrated = store.get('services', 5);
    assert.equal(migrated.purpose, 'avaliacao');
    assert.equal(migrated.price, 189.37);
    assert.equal(store.get('services', custom.id).purpose, undefined);
    assert.equal(store.get('services', explicit.id).purpose, 'execucao');
    assert.equal(store.get('services', identicalCopy.id).purpose, undefined);
    assert.equal(store.list('services').length, count);
    store.close();
    store = createStore({ filename, seed: false });
    assert.equal(store.get('services', 5).updatedAt, migrated.updatedAt);
    assert.equal(store.list('services').length, count);
});
