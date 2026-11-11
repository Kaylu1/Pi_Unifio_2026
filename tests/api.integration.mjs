import { asyncMap } from '../server/async-array.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApi } from '../server/server.mjs';
import { hashToken } from '../server/store.mjs';
import { randomBytes } from 'node:crypto';
async function fixture(t) { const api = createApi({ filename: ':memory:', runMaintenance: false }); api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening'); t.after(() => api.close()); const base = `http://127.0.0.1:${api.server.address().port}`; return { ...api, base }; }
async function request(a, path, { method = 'GET', body, session, csrf = true, origin } = {}) {
    const headers = {};
    if (session) {
        headers.cookie = session.cookie;
        if (csrf)
            headers['x-csrf-token'] = session.csrfToken;
    }
    if (origin)
        headers.origin = origin;
    if (body !== undefined)
        headers['content-type'] = 'application/json';
    const response = await fetch(a.base + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { response, status: response.status, data };
}
async function login(a, email = 'gerente@oscar.local') { const r = await request(a, '/login', { method: 'POST', body: { email, password: 'Oscar@2026!' } }); assert.equal(r.status, 200, JSON.stringify(r.data)); return { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] }; }
async function ok(a, path, options) { const r = await request(a, path, options); assert.ok(r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; }
test('REST: autenticação, cookie seguro, CSRF, origem e permissões são impostas no servidor', async (t) => { const a = await fixture(t); assert.equal((await request(a, '/bootstrap')).status, 401); const bad = await request(a, '/login', { method: 'POST', body: { email: 'gerente@oscar.local', password: 'errada' } }); assert.equal(bad.status, 401); const manager = await login(a); const response = await request(a, '/session', { session: manager }); assert.match(response.response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.response.headers.get('set-cookie'), /SameSite=Strict/); assert.match(response.response.headers.get('set-cookie'), /Secure/); assert.equal((await request(a, '/settings', { method: 'PUT', session: manager, csrf: false, body: { workshopName: 'Outra' } })).status, 403); assert.equal((await request(a, '/settings', { method: 'PUT', session: manager, body: { workshopName: 'Outra' }, origin: 'https://evil.invalid' })).status, 403); const client = await login(a, 'cliente@oscar.local'); assert.equal((await request(a, '/services', { method: 'POST', session: client, body: {} })).status, 403); assert.equal((await request(a, '/orders/2', { session: client })).status, 404); assert.equal((await request(a, '/emails', { session: client })).status, 403); const bootstrap = await ok(a, '/bootstrap', { session: client }); assert.ok(bootstrap.orders.every(o => o.clientId === 1)); assert.ok(bootstrap.vehicles.every(v => v.clientId === 1)); assert.equal(bootstrap.audit.length, 0); assert.equal(bootstrap.emails.length, 0); assert.ok(!JSON.stringify(bootstrap).includes('passwordHash')); });
test('Agenda: disponibilidade considera duração e mecânico; conflito não duplica atendimento', async (t) => { const a = await fixture(t), session = await login(a, 'atendente@oscar.local'); const availability = await ok(a, '/availability?date=2030-06-12&serviceIds=1,2', { session }); assert.equal(availability.durationMinutes, 165); const slot = availability.slots[0], body = { clientId: 1, vehicleId: 1, mechanicId: slot.mechanicId, serviceIds: [1, 2], date: '2030-06-12', time: slot.time }; const appointment = await ok(a, '/appointments', { method: 'POST', session, body }); assert.equal((await request(a, '/appointments', { method: 'POST', session, body: { ...body, time: '08:30' } })).status, 409); const next = await ok(a, '/availability?date=2030-06-12&serviceIds=1,2', { session }); assert.ok(!next.slots.some(s => s.time === slot.time && s.mechanicId === slot.mechanicId)); const self = await ok(a, `/availability?date=2030-06-12&serviceIds=1,2&excludeAppointmentId=${appointment.id}`, { session }); assert.ok(self.slots.some(s => s.time === slot.time && s.mechanicId === slot.mechanicId)); assert.equal((await request(a, `/appointments/${appointment.id}`, { method: 'PUT', session, body: { status: 'cancelado' } })).status, 400); const changed = await ok(a, `/appointments/${appointment.id}`, { method: 'PUT', session, body: { status: 'cancelado', reason: 'Solicitação do cliente' } }); assert.equal(changed.status, 'cancelado'); assert.ok((await a.store.list('emails')).length >= 2); });
test('Fluxo completo: aprovação pública por item, execução/estorno, RN11, garantia e relatórios', async (t) => {
    const a = await fixture(t), session = await login(a), initialStock = (await a.store.get('parts', 1)).stock;
    let order = await ok(a, '/orders', { method: 'POST', session, body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } });
    order = await ok(a, `/orders/${order.id}/items`, { method: 'POST', session, body: { partId: 1, quantity: 2, approvalMethod: 'presencial' } });
    assert.equal((await a.store.get('parts', 1)).stock, initialStock);
    order = await ok(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status: 'inspecao' } });
    await ok(a, `/orders/${order.id}/inspection`, { method: 'POST', session, body: { itemId: order.inspections[0].id, result: 'substituir', notes: 'Revisar conjunto' } });
    await ok(a, `/orders/${order.id}/findings`, { method: 'POST', session, body: { partId: 3, quantity: 1, justification: 'Pastilha desgastada' } });
    await ok(a, `/orders/${order.id}/findings`, { method: 'POST', session, body: { serviceId: 4, justification: 'Inspeção adicional' } });
    const budget = await ok(a, `/orders/${order.id}/budgets`, { method: 'POST', session, body: {} });
    const published = await ok(a, `/budgets/${budget.id}/publish`, { method: 'POST', session, body: {} });
    const token = published.link.split('/').at(-1), publicView = await ok(a, `/public/budgets/${token}`);
    assert.equal(publicView.clientFirstName, 'Mariana');
    assert.equal(publicView.plateMasked, '****D23');
    assert.equal(publicView.chassisMasked, '***********004251');
    for (const secret of ['12345678909', '14999990001', 'cliente@oscar.local', 'ABC1D23', '9BWZZZ377VT004251'])
        assert.ok(!JSON.stringify(publicView).includes(secret));
    await ok(a, `/public/budgets/${token}`, { method: 'POST', body: { decisions: budget.items.map((i, index) => ({ itemId: i.id, decision: index === 0 ? 'aprovado' : 'recusado' })) } });
    assert.ok((await request(a, `/public/budgets/${token}`)).status >= 400);
    order = (await ok(a, `/orders/${order.id}`, { session })).order;
    assert.equal(order.status, 'execucao');
    assert.equal(order.items.filter(i => i.decision === 'recusado').length, 1);
    assert.equal((await request(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status: 'concluida' } })).status, 409);
    const refused = order.items.find(i => i.decision === 'recusado');
    assert.equal((await request(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: refused.id } })).status, 409);
    for (const item of order.items.filter(i => i.decision === 'aprovado'))
        await ok(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: item.id } });
    assert.equal((await a.store.get('parts', 1)).stock, initialStock - 2);
    const partItem = order.items.find(i => i.partId === 1);
    assert.equal((await request(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: partItem.id } })).status, 409);
    await ok(a, `/orders/${order.id}/reverse`, { method: 'POST', session, body: { itemId: partItem.id, reason: 'Peça substituída antes da entrega' } });
    assert.equal((await a.store.get('parts', 1)).stock, initialStock);
    await ok(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: partItem.id } });
    await ok(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status: 'concluida' } });
    order = await ok(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status: 'encerrada' } });
    assert.ok(order.closedAt);
    assert.equal(order.warrantyDays, 90);
    const client = await login(a, 'cliente@oscar.local');
    const ticket = await ok(a, '/tickets', { method: 'POST', session: client, body: { orderId: order.id, description: 'Ruído após atendimento' } });
    assert.equal(ticket.withinWarranty, true);
    await ok(a, `/tickets/${ticket.id}`, { method: 'PUT', session, body: { status: 'deferido', notes: 'Retorno coberto' } });
    const warranty = await ok(a, `/tickets/${ticket.id}/warranty-order`, { method: 'POST', session, body: {} });
    assert.equal(warranty.originOrderId, order.id);
    assert.ok(warranty.items.every(i => i.price === 0 && i.total === 0));
    const reports = await ok(a, '/reports?from=2020-01-01&to=2035-12-31', { session });
    assert.ok(reports.totals.services > 0);
    assert.equal(reports.services.find(row => row.orderId === order.id)?.vehiclePlate, 'ABC1D23');
    assert.ok(reports.services.find(row => row.orderId === order.id)?.clientName);
    assert.ok(reports.parts.some(p => p.partId === 1 && p.quantity === 2));
    const csv = await request(a, '/reports?format=csv', { session });
    assert.match(csv.response.headers.get('content-type'), /text\/csv/);
    assert.match(csv.data, /Serviço/);
    assert.match(csv.data, /Cliente.*Veículo/);
    assert.match(csv.data, /ABC1D23/);
});
test('Validações: CPF, veículo de outro cliente, placa duplicada e estoque negativo', async (t) => {
    const a = await fixture(t), session = await login(a);
    assert.equal((await request(a, '/clients', { method: 'POST', session, body: { name: 'Teste', cpf: '11111111111', phone: '14999991111', email: 'teste@exemplo.local' } })).status, 400);
    assert.equal((await request(a, '/appointments', { method: 'POST', session, body: { clientId: 1, vehicleId: 2, mechanicId: 3, serviceIds: [1], date: '2030-06-13', time: '08:00' } })).status, 400);
    assert.equal((await request(a, '/vehicles', { method: 'POST', session, body: { clientId: 2, plate: 'ABC1D23', chassis: '9BWZZZ377VT004251', brand: 'VW', model: 'Polo', year: 2021, mileage: 1 } })).status, 409);
    let order = await ok(a, '/orders', { method: 'POST', session, body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } });
    order = await ok(a, `/orders/${order.id}/items`, { method: 'POST', session, body: { partId: 6, quantity: 500, approvalMethod: 'presencial' } });
    for (const status of ['inspecao', 'aguardando_aprovacao', 'execucao'])
        await ok(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status } });
    const before = (await a.store.get('parts', 6)).stock, item = order.items.find(i => i.partId === 6);
    assert.equal((await request(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: item.id } })).status, 409);
    assert.equal((await a.store.get('parts', 6)).stock, before);
    assert.equal((await a.store.list('movements')).filter(m => m.orderId === order.id).length, 0);
});
test('RNF01/RNF02: 30 consultas simultâneas autenticadas retornam em menos de 3 segundos', async (t) => { const a = await fixture(t); const hash = (await a.store.db.prepare('SELECT passwordHash FROM users WHERE id=1').get()).passwordHash; const sessions = await Promise.all(Array.from({ length: 30 }, async (_, index) => { const user = await a.store.save('users', { name: 'Usuário de carga ' + index, email: 'carga' + index + '@oscar.local', role: 'atendente', clientId: null, active: true, passwordHash: hash }); const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(24).toString('base64url'); await a.store.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run(hashToken(token), user.id, csrfToken, Date.now()); return { cookie: 'oscar_session=' + token, csrfToken }; })); const started = performance.now(); const results = await Promise.all(sessions.map(session => request(a, '/bootstrap', { session }))); assert.ok(results.every(r => r.status === 200)); const elapsed = performance.now() - started; assert.ok(elapsed < 3000, `30 consultas levaram ${elapsed.toFixed(0)} ms`); t.diagnostic(`30 usuários/sessões distintos na base fictícia: ${elapsed.toFixed(0)} ms`); });
test('RF27 edição de rascunho preserva vínculo do achado e não deixa item pendente órfão', async (t) => { const a = await fixture(t), session = await login(a); const original = await a.store.get('budgets', 1), order = await a.store.get('orders', 4); order.items.push({ ...original.items[0] }); await a.store.save('orders', order); const edited = await ok(a, '/budgets/1', { method: 'PUT', session, body: { items: [{ ...original.items[0], price: 155 }] } }); assert.equal(edited.items[0].id, original.items[0].id); assert.equal((await a.store.get('orders', 4)).items.some(i => i.id === original.items[0].id), false); const published = await ok(a, '/budgets/1/publish', { method: 'POST', session, body: {} }), token = published.link.split('/').at(-1); await ok(a, '/public/budgets/' + token, { method: 'POST', body: { decisions: published.items.map(i => ({ itemId: i.id, decision: 'recusado' })) } }); assert.equal((await a.store.get('orders', 4)).status, 'execucao'); assert.equal((await a.store.get('orders', 4)).items.filter(i => i.decision === 'pendente').length, 0); assert.equal((await request(a, '/orders/4/budgets', { method: 'POST', session, body: { items: original.items } })).status, 409); });
test('RN12 baixa e estorno preservam milésimos de unidade, sem arredondar quantidade como moeda', async (t) => {
    const a = await fixture(t), session = await login(a), start = (await a.store.get('parts', 1)).stock;
    await ok(a, '/stock/entries', { method: 'POST', session, body: { partId: 1, supplierId: 1, quantity: 0.001, date: new Date().toISOString().slice(0, 10) } });
    assert.equal((await a.store.get('parts', 1)).stock, start + 0.001);
    let order = await ok(a, '/orders', { method: 'POST', session, body: { clientId: 1, vehicleId: 1, mechanicId: 3, serviceIds: [1], approvalMethod: 'presencial' } });
    order = await ok(a, `/orders/${order.id}/items`, { method: 'POST', session, body: { partId: 1, quantity: 0.001, approvalMethod: 'presencial' } });
    for (const status of ['inspecao', 'aguardando_aprovacao', 'execucao'])
        await ok(a, `/orders/${order.id}/status`, { method: 'POST', session, body: { status } });
    const item = order.items.find(i => i.partId === 1);
    await ok(a, `/orders/${order.id}/execute`, { method: 'POST', session, body: { itemId: item.id } });
    assert.equal((await a.store.get('parts', 1)).stock, start);
    await ok(a, `/orders/${order.id}/reverse`, { method: 'POST', session, body: { itemId: item.id, reason: 'Estorno de teste fracionário' } });
    assert.equal((await a.store.get('parts', 1)).stock, start + 0.001);
});
