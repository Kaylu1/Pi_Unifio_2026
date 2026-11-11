import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createApi } from './server.mjs';
import { resetLink } from './common.mjs';
const ORIGIN = 'https://localhost:4201';
async function fixture(t) {
    const api = createApi({ filename: ':memory:', secureCookies: false, runMaintenance: false });
    await new Promise((resolve) => api.server.listen(0, '127.0.0.1', resolve));
    t.after(() => api.close());
    const base = 'http://127.0.0.1:' + api.server.address().port;
    const request = async (path, { method = 'GET', body, session, includeCsrf = true } = {}) => {
        const headers = { Origin: ORIGIN };
        if (method !== 'GET')
            headers['Content-Type'] = 'application/json';
        if (session) {
            headers.Cookie = session.cookie;
            if (includeCsrf && method !== 'GET')
                headers['X-CSRF-Token'] = session.csrf;
        }
        const response = await fetch(base + '/api' + path, {
            method, headers, ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
        });
        return { status: response.status, data: await response.json(), headers: response.headers };
    };
    const login = async (email) => {
        const response = await request('/login', {
            method: 'POST', body: { email, password: 'Oscar@2026!' },
        });
        assert.equal(response.status, 200);
        return { cookie: response.headers.get('set-cookie').split(';')[0],
            csrf: response.data.csrfToken, user: response.data.user };
    };
    return { ...api, request, login };
}
test('RNF12 / sessão ativa renova cookie e logout invalida imediatamente token', async (t) => {
    const { request, login } = await fixture(t);
    const manager = await login('gerente@oscar.local');
    const active = await request('/bootstrap', { session: manager });
    assert.equal(active.status, 200);
    assert.match(active.headers.get('set-cookie') ?? '', /oscar_session=[^;]+/);
    assert.match(active.headers.get('set-cookie') ?? '', /Max-Age=1800/);
    const logout = await request('/logout', { method: 'POST', session: manager });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await request('/session', { session: manager })).data.user, null);
    assert.equal((await request('/bootstrap', { session: manager })).status, 401);
});
test('RNF12 / sessão inativa é rejeitada e escrita sem CSRF não altera dados', async (t) => {
    const { request, login, store } = await fixture(t);
    const manager = await login('gerente@oscar.local');
    const settings = await store.settings();
    const forbidden = await request('/settings', {
        method: 'PUT', body: { warrantyDays: 120 }, session: manager, includeCsrf: false,
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await store.settings()).warrantyDays, settings.warrantyDays);
    await store.db.prepare('UPDATE sessions SET lastSeen=? WHERE userId=?')
        .run(Date.now() - 30 * 60000 - 1, manager.user.id);
    assert.equal((await request('/session', { session: manager })).data.user, null);
    assert.equal((await request('/bootstrap', { session: manager })).status, 401);
});
test('RF06 / cliente só consulta suas ordens e não acessa caixa de links de terceiros', async (t) => {
    const { request, login } = await fixture(t);
    const customer = await login('cliente@oscar.local');
    const orders = await request('/orders', { session: customer });
    assert.equal(orders.status, 200);
    assert.ok(orders.data.items.length > 0);
    assert.ok(orders.data.items.every((order) => order.clientId === customer.user.clientId));
    assert.equal((await request('/orders/2', { session: customer })).status, 404);
    assert.equal((await request('/emails', { session: customer })).status, 403);
    const clients = await request('/clients', { session: customer });
    assert.deepEqual(clients.data.items.map((client) => client.id), [customer.user.clientId]);
});
test('RN10 / orçamento por link funciona sem sessão e não expõe identificações completas', async (t) => {
    const { request, login } = await fixture(t);
    const consultant = await login('consultor@oscar.local');
    const published = await request('/budgets/1/publish', { method: 'POST', session: consultant });
    assert.equal(published.status, 200);
    const token = published.data.link.split('/').at(-1);
    const publicBudget = await request('/public/budgets/' + token);
    assert.equal(publicBudget.status, 200);
    assert.equal(publicBudget.data.clientFirstName, 'Mariana');
    assert.equal(publicBudget.data.plateMasked, '****M12');
    for (const secret of ['Oliveira', 'cliente@oscar.local', '12345678909', '14999990001',
        'JKL0M12', '9BD17164LA1234567', 'approvalBy', 'passwordHash', 'tokenHash']) {
        assert.equal(JSON.stringify(publicBudget.data).includes(secret), false, secret);
    }
    const decisions = publicBudget.data.items.map((item) => ({ itemId: item.id, decision: 'recusado' }));
    assert.equal((await request('/public/budgets/' + token, {
        method: 'POST', body: { decisions },
    })).status, 200);
    assert.equal((await request('/public/budgets/' + token)).status, 404);
});
test('RNF14 / anonimização remove cópias de dados pessoais e invalida acesso e links', async (t) => {
    const { request, login, store } = await fixture(t);
    const manager = await login('gerente@oscar.local');
    const customer = await login('cliente@oscar.local');
    const consultant = await login('consultor@oscar.local');
    const client = await store.get('clients', customer.user.clientId);
    const privateText = client.name + ' - ' + client.email + ' - ' + client.phone;
    const order = await store.get('orders', 4);
    order.timeline.push({ status: order.status, date: new Date().toISOString(),
        userId: customer.user.id, userName: client.name });
    order.items[0].approvalNotes = privateText;
    order.findings.push({ id: 'achado-privado', description: 'Verificar', kind: 'servico',
        approvalNotes: privateText, justification: privateText });
    order.inspections[0].notes = privateText;
    await store.save('orders', order);
    const budget = await store.get('budgets', 1);
    budget.items[0].approvalNotes = privateText;
    budget.items[0].justification = privateText;
    await store.save('budgets', budget);
    await resetLink(store, customer.user, ORIGIN);
    const published = await request('/budgets/1/publish', { method: 'POST', session: consultant });
    const token = published.data.link.split('/').at(-1);
    assert.equal((await request('/clients/1/anonymize', {
        method: 'POST', body: { confirmation: 'ANONIMIZAR' }, session: customer,
    })).status, 403);
    const response = await request('/clients/1/anonymize', {
        method: 'POST', body: { confirmation: 'ANONIMIZAR' }, session: manager,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.active, false);
    assert.equal(response.data.cpf, '');
    assert.equal((await request('/session', { session: customer })).data.user, null);
    assert.equal((await request('/public/budgets/' + token)).status, 404);
    assert.equal((await store.db.prepare('SELECT COUNT(*) AS count FROM reset_tokens WHERE userId=?')
        .get(customer.user.id)).count, 0);
    for (const table of ['clients', 'vehicles', 'users', 'orders', 'budgets', 'appointments', 'tickets', 'emails', 'audit']) {
        const serialized = JSON.stringify(await store.list(table));
        for (const secret of [client.name, client.email, client.cpf, client.phone]) {
            assert.equal(serialized.includes(secret), false, table + ' ainda contém ' + secret);
        }
    }
});
test('RF16 / item inicial exige resposta formal e não cria pendência sem fluxo de decisão', async (t) => {
    const { request, login, store } = await fixture(t);
    const attendant = await login('atendente@oscar.local');
    const before = (await store.get('orders', 3)).items.length;
    const response = await request('/orders/3/items', { method: 'POST', session: attendant,
        body: { serviceId: 1, decision: 'pendente', approvalMethod: 'presencial' } });
    assert.equal(response.status, 400);
    assert.equal((await store.get('orders', 3)).items.length, before);
});
