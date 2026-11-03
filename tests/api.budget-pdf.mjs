import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PDFDocument } from 'pdf-lib';
import { createApi } from '../server/server.mjs';
import { renderBudgetPdf } from '../server/budget-pdf.mjs';

test('Orçamento PDF: documento válido, sessão obrigatória e acesso limitado à própria O.S.', async (t) => {
    const api = createApi({ filename: ':memory:', runMaintenance: false });
    api.server.listen(0, '127.0.0.1');
    await once(api.server, 'listening');
    t.after(() => api.close());
    const base = `http://127.0.0.1:${api.server.address().port}/api`;
    const get = (path, cookie) => fetch(base + path, { headers: cookie ? { cookie } : {} });
    async function login(email) {
        const response = await fetch(base + '/login', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password: 'Oscar@2026!' }),
        });
        assert.equal(response.status, 200);
        return response.headers.get('set-cookie').split(';')[0];
    }
    assert.equal((await get('/budgets/1/pdf')).status, 401);
    const manager = await login('gerente@oscar.local');
    const pdfResponse = await get('/budgets/1/pdf', manager);
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
    assert.match(pdfResponse.headers.get('content-disposition'), /attachment; filename="orcamento-2001\.pdf"/);
    assert.equal(pdfResponse.headers.get('cache-control'), 'no-store');
    const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
    assert.match(document.getTitle(), /Orçamento 2001/);
    const client = await login('cliente@oscar.local');
    const bootstrap = await (await get('/bootstrap', client)).json();
    assert.equal(bootstrap.budgets.some(budget => budget.id === 1), false);
    assert.equal((await get('/budgets/1', client)).status, 404);
    assert.equal((await get('/budgets/1/pdf', client)).status, 404);
    const published = await api.store.get('budgets', 1);
    await api.store.save('budgets', { ...published, status: 'publicado', publishedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal((await get('/budgets/1/pdf', client)).status, 200);
    assert.equal((await get('/budgets/1/pdf', await login('mecanico@oscar.local'))).status, 403);

    const hash = (await api.store.db.prepare('SELECT passwordHash FROM users WHERE id=1').get()).passwordHash;
    await api.store.save('users', { name: 'Outro cliente', email: 'outro@oscar.local', role: 'cliente', clientId: 2, active: true, passwordHash: hash });
    assert.equal((await get('/budgets/1/pdf', await login('outro@oscar.local'))).status, 404);
});

test('Orçamento PDF pagina muitos itens e aceita acentos e descrições longas', async () => {
    const bytes = await renderBudgetPdf({
        budget: { id: 7, number: 2044, status: 'respondido', expiresAt: '2030-03-01T15:30:00Z', items: Array.from({ length: 50 }, (_, index) => ({ description: `Revisão de direção e suspensão ${index} — inspeção detalhada do veículo`, quantity: 1.25, price: 123.45, decision: index % 2 ? 'recusado' : 'aprovado' })) },
        order: { id: 9, number: 1009 },
        client: { name: 'José da Conceição', phone: '(11) 99999-9999', email: 'jose@exemplo.local' },
        vehicle: { brand: 'Citroën', model: 'C3', year: 2021, plate: 'ABC1D23' },
        settings: { workshopName: 'Oficina São João' },
    });
    const document = await PDFDocument.load(bytes);
    assert.ok(document.getPageCount() >= 2);
    assert.equal(document.getAuthor(), 'Oficina São João');
});
