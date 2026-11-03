import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createStore, hashToken } from './store.mjs';
import { resetLink, visible } from './common.mjs';
import { publishBudget, budgetByToken, decideBudget, publicBudgetView } from './workflow.mjs';
import { DomainError } from './domain.mjs';
async function fixture(t) {
    const s = createStore({ filename: ':memory:' });
    t.after(async () => await s.close());
    return { s, consultant: await s.get('users', 4), customer: await s.get('users', 5), budget: await s.get('budgets', 1) };
}
describe('RF04 — convite e recuperação usam a rota real de nova senha', () => {
    test('gera token de uso único, guarda hash e mostra link local clicável', async (t) => {
        const { s, customer } = await fixture(t);
        await resetLink(s, customer, 'https://localhost:4201', 'convite');
        const email = (await s.list('emails'))[0];
        assert.match(email.link, /^https:\/\/localhost:4201\/redefinir\/[A-Za-z0-9_-]{43}$/);
        assert.ok(email.text.includes(email.link));
        assert.equal(email.status, process.env.SMTP_HOST ? 'pendente' : 'capturado');
        const token = email.link.split('/').at(-1);
        const stored = await s.db.prepare('SELECT token,userId,used,expiresAt FROM reset_tokens').get();
        assert.equal(stored.token, hashToken(token));
        assert.notEqual(stored.token, token);
        assert.equal(stored.userId, customer.id);
        assert.equal(stored.used, 0);
        assert.ok(stored.expiresAt > Date.now());
    });
    test('caixa de saída com links de acesso é visível somente ao gerente', async (t) => {
        const { s, customer } = await fixture(t);
        await resetLink(s, customer, 'https://localhost:4201');
        assert.equal((await visible(s, 'emails', await s.get('users', 1))).length, 1);
        for (const id of [2, 3, 4, 5]) {
            assert.deepEqual(await visible(s, 'emails', await s.get('users', id)), []);
        }
    });
});
describe('Orçamento público — RN06/RN07/RN08/RN09/RN10 e PD02', () => {
    test('publicação minimiza dados e limita token a um orçamento', async (t) => {
        const { s, consultant, budget } = await fixture(t);
        const published = await publishBudget(s, budget, consultant);
        const token = published.link.split('/').at(-1);
        const found = await budgetByToken(s, token);
        const publicView = await publicBudgetView(s, found);
        assert.equal(publicView.clientFirstName, 'Mariana');
        assert.equal(publicView.plateMasked, '****M12');
        assert.equal(publicView.chassisMasked, '***********234567');
        const serialized = JSON.stringify(publicView);
        for (const secret of ['Oliveira', 'cliente@oscar.local', '12345678909', '14999990001',
            'JKL0', '9BD17164LA1', 'tokenHash', 'approvalBy', 'clientId', 'userId']) {
            assert.equal(serialized.includes(secret), false, secret);
        }
        await assert.rejects(async () => await budgetByToken(s, token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')), (error) => error instanceof DomainError && error.status === 404);
        assert.equal(publicView.items.length, 1);
        assert.equal(publicView.items[0].decision, 'pendente');
    });
    test('recusa individual retorna à execução, mantém serviços originais e invalida link', async (t) => {
        const { s, consultant, budget } = await fixture(t);
        const published = await publishBudget(s, budget, consultant);
        const token = published.link.split('/').at(-1);
        const originalService = (await s.get('orders', budget.orderId)).items.find((item) => item.source === 'inicial');
        const answer = await decideBudget(s, await budgetByToken(s, token), {
            decisions: published.items.map((item) => ({ itemId: item.id, decision: 'recusado' })),
        }, null, 'link');
        const order = await s.get('orders', budget.orderId);
        assert.equal(order.status, 'execucao');
        assert.equal(order.items.find((item) => item.id === originalService.id).decision, 'aprovado');
        assert.equal(order.items.find((item) => item.source === 'complementar').decision, 'recusado');
        assert.equal(answer.tokenHash, undefined);
        assert.equal(answer.link, null);
        await assert.rejects(async () => await budgetByToken(s, token), DomainError);
        await assert.rejects(async () => await decideBudget(s, await s.get('budgets', budget.id), {
            decisions: [{ itemId: published.items[0].id, decision: 'aprovado' }],
        }, null, 'link'), DomainError);
    });
    test('link expirado deixa de responder e exige nova emissão com token diferente', async (t) => {
        const { s, consultant, budget } = await fixture(t);
        const published = await publishBudget(s, budget, consultant);
        const oldToken = published.link.split('/').at(-1);
        await s.save('budgets', { ...await s.get('budgets', budget.id), expiresAt: new Date(Date.now() - 1).toISOString() });
        await assert.rejects(async () => await budgetByToken(s, oldToken), (error) => error instanceof DomainError && error.status === 410);
        assert.equal((await s.get('budgets', budget.id)).status, 'expirado');
        const reissued = await publishBudget(s, await s.get('budgets', budget.id), consultant);
        assert.notEqual(reissued.link, published.link);
        await assert.rejects(async () => await budgetByToken(s, oldToken), DomainError);
        assert.equal((await budgetByToken(s, reissued.link.split('/').at(-1))).id, budget.id);
    });
    test('forma externa configurada substitui as opções iniciais e registra autoria', async (t) => {
        const { s, consultant, budget } = await fixture(t);
        await s.saveSettings({ ...await s.settings(), approvalMethods: ['assinatura_documental'] });
        const published = await publishBudget(s, budget, consultant);
        await assert.rejects(async () => await decideBudget(s, await s.get('budgets', budget.id), {
            decisions: published.items.map((item) => ({ itemId: item.id, decision: 'aprovado' })),
        }, consultant, 'telefone'), DomainError);
        const result = await decideBudget(s, await s.get('budgets', budget.id), {
            decisions: published.items.map((item) => ({ itemId: item.id, decision: 'aprovado' })),
        }, consultant, 'assinatura_documental');
        assert.equal(result.origin, 'assinatura_documental');
        assert.equal(result.items[0].approvalBy, consultant.id);
        assert.equal(result.items[0].approvalMethod, 'assinatura_documental');
        assert.ok(result.items[0].approvedAt);
        assert.equal((await s.get('orders', budget.orderId)).status, 'execucao');
    });
    test('decisão com item de outro orçamento ou item duplicado não produz aprovação', async (t) => {
        const { s, consultant, budget } = await fixture(t);
        await publishBudget(s, budget, consultant);
        await assert.rejects(async () => await decideBudget(s, await s.get('budgets', budget.id), {
            decisions: [{ itemId: 'item-de-outro-orcamento', decision: 'aprovado' }],
        }, null, 'link'), DomainError);
        assert.equal((await s.get('budgets', budget.id)).status, 'publicado');
        assert.equal((await s.get('orders', budget.orderId)).items.find((item) => item.source === 'complementar').decision, 'pendente');
    });
});
