import { asyncFilter } from './async-array.mjs';
import { servicePurpose } from './service-purpose.mjs';
import { randomUUID } from 'node:crypto';
import { assert, DomainError, assertApproval, warrantyPolicy } from './domain.mjs';
import { timestamp } from './auth-crypto.mjs';
import { STAFF, ensure, allow, ownOrder, text, number, round, visible, enqueue, roundQuantity } from './common.mjs';
import { servicesFrom, mechanicFrom } from './entities.mjs';
import { itemData, attachInspections, changeStatus, decideBudget, publishBudget, buildBudgetItems } from './workflow.mjs';
export async function orderRoutes({ s, route, method, body: b, user: u }) {
    if (route === '/orders' && method === 'POST') {
        allow(u, ['gerente', 'atendente']);
        const appointment = b.appointmentId ? await ensure(s, 'appointments', b.appointmentId) : null;
        if (appointment)
            assert(appointment.status === 'agendado' && !(await s.list('orders')).some(o => o.appointmentId === appointment.id), 'Agendamento já atendido ou cancelado.', 409);
        assert(!b.type || b.type === 'normal', 'Abra a O.S. de garantia a partir de um chamado deferido.');
        const clientId = Number(b.clientId ?? appointment?.clientId), vehicleId = Number(b.vehicleId ?? appointment?.vehicleId), mechanicId = Number(b.mechanicId ?? appointment?.mechanicId), client = await ensure(s, 'clients', clientId), vehicle = await ensure(s, 'vehicles', vehicleId);
        await mechanicFrom(s, mechanicId);
        assert(client.active && vehicle.active && vehicle.clientId === clientId, 'Selecione veículo ativo vinculado ao cliente.');
        if (appointment)
            assert(appointment.clientId === clientId && appointment.vehicleId === vehicleId, 'Use o cliente e veículo do agendamento.');
        const services = await servicesFrom(s, b.serviceIds ?? appointment?.serviceIds);
        const startMode = b.startMode ?? (services.every(service => servicePurpose(service) === 'avaliacao') ? 'avaliacao' : 'servicos');
        assert(['avaliacao', 'servicos'].includes(startMode), 'Selecione avaliação inicial ou serviços definidos.');
        assert(startMode !== 'avaliacao' || services.every(service => servicePurpose(service) === 'avaliacao'), 'Selecione apenas serviços de avaliação para iniciar uma avaliação.');
        const assessmentNotes = text(b.assessmentNotes ?? '', 'o relato inicial do cliente', 1000, true);
        const o = { startMode, assessmentNotes, evaluationServiceIds: services.filter(service => servicePurpose(service) === 'avaliacao').map(service => service.id), number: Math.max(1000, ...(await s.list('orders')).map(o => o.number)) + 1, clientId, vehicleId, mechanicId, appointmentId: appointment?.id ?? null, originOrderId: null, type: 'normal', status: 'aberta', items: [], inspections: [], findings: [], timeline: [{ status: 'aberta', date: timestamp(), userId: u.id, userName: u.name }], closedAt: null };
        for (const service of services) {
            const item = await itemData(s, { serviceId: service.id, approvalMethod: b.approvalMethod, approvalNotes: b.approvalNotes, decision: 'aprovado' }, u);
            o.items.push(item);
            await attachInspections(s, o, item);
        }
        const saved = await s.save('orders', o);
        if (appointment)
            await s.save('appointments', { ...appointment, status: 'atendido', orderId: saved.id });
        await s.audit(u, 'criar', 'orders', saved.id, { startMode, evaluationServiceIds: o.evaluationServiceIds });
        return { status: 201, data: saved };
    }
    const match = /^\/orders\/(\d+)(?:\/(items|status|inspection|execute|reverse|findings|budgets|assign))?$/.exec(route);
    if (match) {
        const o = ownOrder(u, await ensure(s, 'orders', match[1])), action = match[2];
        if (!action && method === 'GET')
            return { data: { order: o, items: o.items, inspections: o.inspections, budgets: (await visible(s, 'budgets', u)).filter(b => b.orderId === o.id), warranty: warrantyPolicy({ order: o, settings: await s.settings() }), tickets: (await visible(s, 'tickets', u)).filter(t => t.orderId === o.id) } };
        assert(method === 'POST', 'Operação não encontrada.', 404);
        assert(!['encerrada', 'cancelada'].includes(o.status), 'Esta O.S. está encerrada ou cancelada.', 409);
        if (action === 'assign') {
            allow(u, ['gerente', 'atendente']);
            o.mechanicId = (await mechanicFrom(s, b.mechanicId)).id;
        }
        else if (action === 'items') {
            allow(u, ['gerente', 'atendente']);
            assert(o.status === 'aberta', 'Inclua itens do primeiro atendimento enquanto a O.S. estiver aberta.', 409);
            const item = await itemData(s, b, u);
            o.items.push(item);
            await attachInspections(s, o, item);
        }
        else if (action === 'status') {
            allow(u, STAFF);
            const status = text(b.status, 'o próximo status', 40);
            if (['encerrada', 'cancelada'].includes(status))
                allow(u, ['gerente', 'atendente']);
            const changed = await changeStatus(s, o, status, u);
            await s.audit(u, 'alterar', 'orders', o.id, { status });
            if (status === 'encerrada')
                await enqueue(s, (await ensure(s, 'clients', o.clientId)).email, `O.S. ${o.number} encerrada`, `Seu atendimento foi encerrado. A garantia dos itens cobertos começa hoje e possui ${changed.warrantyDays} dias.`);
            return { data: changed };
        }
        else if (action === 'inspection') {
            allow(u, ['gerente', 'mecanico']);
            assert(['inspecao', 'aguardando_aprovacao', 'execucao'].includes(o.status), 'Inicie a inspeção antes de preencher a folha.', 409);
            const item = o.inspections.find(i => i.id === b.itemId);
            assert(item, 'Item de inspeção não encontrado.', 404);
            assert(['ok', 'atencao', 'substituir', 'nao_aplicavel'].includes(b.result), 'Escolha o resultado da inspeção.');
            Object.assign(item, { result: b.result, notes: text(b.notes ?? '', 'a observação', 1000, true), inspectedAt: timestamp(), inspectedBy: u.id });
        }
        else if (action === 'execute') {
            allow(u, ['gerente', 'mecanico']);
            assert(o.status === 'execucao', 'Mova a O.S. para Em execução antes de apontar um item.', 409);
            const item = o.items.find(i => i.id === b.itemId);
            assert(item, 'Item não encontrado nesta O.S.', 404);
            assertApproval(item);
            assert(item.approvedAt && item.approvalMethod, 'Registre formalmente a aprovação antes de executar.', 409);
            assert(!item.executedAt, 'Este item já foi apontado. Atualize a página.', 409);
            if (b.quantity !== undefined)
                assert(b.quantity === item.quantity, 'A quantidade apontada deve corresponder à aprovada.');
            if (item.partId && !item.suppliedByClient) {
                const part = await ensure(s, 'parts', item.partId);
                assert(part.stock >= item.quantity, 'Estoque insuficiente. Registre a entrada antes do apontamento.', 409);
                part.stock = roundQuantity(part.stock - item.quantity);
                await s.save('parts', part);
                await s.save('movements', { partId: part.id, orderId: o.id, supplierId: part.supplierId, itemId: item.id, type: 'saida', quantity: item.quantity, date: timestamp(), userId: u.id });
            }
            Object.assign(item, { executedAt: timestamp(), executedBy: u.id, executedByName: u.name });
        }
        else if (action === 'reverse') {
            allow(u, ['gerente', 'mecanico']);
            assert(o.status === 'execucao', 'Estorne peças durante a execução da O.S.', 409);
            const item = o.items.find(i => i.id === b.itemId);
            assert(item?.partId && item.executedAt, 'Selecione uma peça já apontada.', 409);
            const reason = text(b.reason, 'o motivo do estorno', 500);
            if (!item.suppliedByClient) {
                const part = await ensure(s, 'parts', item.partId);
                part.stock = roundQuantity(part.stock + item.quantity);
                await s.save('parts', part);
                await s.save('movements', { partId: part.id, orderId: o.id, supplierId: part.supplierId, itemId: item.id, type: 'estorno', quantity: item.quantity, date: timestamp(), userId: u.id, notes: reason });
            }
            item.executedAt = null;
            item.executedBy = null;
            item.reversals ??= [];
            item.reversals.push({ date: timestamp(), userId: u.id, reason });
        }
        else if (action === 'findings') {
            allow(u, ['gerente', 'mecanico']);
            assert(['inspecao', 'execucao'].includes(o.status), 'Registre achados durante a inspeção ou execução.', 409);
            const item = await itemData(s, b, u, { source: 'complementar', allowPending: true });
            item.justification = text(b.justification, 'a justificativa técnica', 1000);
            o.findings.push(item);
        }
        else if (action === 'budgets') {
            allow(u, ['gerente', 'consultor']);
            assert(['inspecao', 'execucao', 'aguardando_aprovacao'].includes(o.status), 'Prepare o orçamento durante a inspeção ou execução.', 409);
            assert(!(await s.list('budgets')).some(x => x.orderId === o.id && ['rascunho', 'publicado'].includes(x.status)), 'Edite o orçamento em aberto antes de criar outro.', 409);
            const candidates = b.items ?? await asyncFilter(o.findings, async (f) => !(await s.list('budgets')).some(x => x.orderId === o.id && x.items.some(i => i.id === f.id || i.findingId === f.id)));
            const items = await buildBudgetItems(s, o, candidates, u);
            assert(items.length > 0, 'Registre um achado ou inclua um item no orçamento.');
            const saved = await s.save('budgets', { orderId: o.id, number: Math.max(2000, ...(await s.list('budgets')).map(b => b.number)) + 1, items, status: 'rascunho', publishedAt: null, expiresAt: null, answeredAt: null, tokenHash: null, link: null, validityHours: number(b.validityHours ?? (await s.settings()).budgetValidityHours, 'a validade em horas', 1, 720, true) });
            await s.audit(u, 'criar', 'budgets', saved.id);
            return { status: 201, data: saved };
        }
        else
            throw new DomainError(404, 'Operação da O.S. não encontrada.');
        const saved = await s.save('orders', o);
        await s.audit(u, 'alterar', 'orders', o.id, { action, itemId: b.itemId ?? null });
        return { data: saved };
    }
    const bm = /^\/budgets\/(\d+)(?:\/(publish|decisions))?$/.exec(route);
    if (bm) {
        const budget = await ensure(s, 'budgets', bm[1]);
        ownOrder(u, await ensure(s, 'orders', budget.orderId));
        const action = bm[2];
        if (!action && method === 'GET') {
            allow(u, ['gerente', 'consultor', 'atendente', 'cliente']);
            const { tokenHash, ...safe } = budget;
            return { data: safe };
        }
        if (action === 'decisions' && method === 'POST') {
            if (u.role !== 'cliente')
                allow(u, ['gerente', 'consultor']);
            return { data: await decideBudget(s, budget, b, u, u.role === 'cliente' ? 'link' : b.origin) };
        }
        allow(u, ['gerente', 'consultor']);
        if (!action && method === 'PUT') {
            assert(budget.status === 'rascunho', 'Edite apenas orçamentos em rascunho.', 409);
            assert(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 50, 'Inclua entre 1 e 50 itens.');
            const order = await ensure(s, 'orders', budget.orderId), oldIds = new Set(budget.items.map(i => i.id)), items = await buildBudgetItems(s, order, b.items, u, budget);
            order.items = order.items.filter(i => !oldIds.has(i.id) || i.decision !== 'pendente');
            order.inspections = order.inspections.filter(i => !oldIds.has(i.itemId));
            await s.save('orders', order);
            const saved = await s.save('budgets', { ...budget, items });
            await s.audit(u, 'alterar', 'budgets', budget.id);
            return { data: saved };
        }
        if (action === 'publish' && method === 'POST')
            return { data: await publishBudget(s, budget, u) };
        throw new DomainError(404, 'Operação de orçamento não encontrada.');
    }
    return null;
}
