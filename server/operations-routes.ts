import { asyncMap, asyncFlatMap } from './async-array.ts';
import { reportOrders, reportPartConsumption } from './report-sql.ts';
import { randomUUID, randomBytes } from 'node:crypto';
import { assert, DomainError, assertNoOverlap, warrantyPolicy } from './domain.ts';
import { timestamp, hashPassword } from './auth-crypto.ts';
import { STAFF, APPROVALS, WRITERS, LISTS, ensure, allow, ownOrder, text, number, round, dateValue, visible, listResult, enqueue, resetLink, partPolicy, safeUser, dashboard, roundQuantity, quantityValue } from './common.ts';
import { entityRecord, servicesFrom, mechanicFrom, appointmentData, workshopNow } from './entities.ts';
import { attachInspections } from './workflow.ts';
import { anonymizeClient, purgeClientBackups } from './privacy.ts';
import { serviceRequestSummary } from './service-requests.ts';
import { SecurityRepository } from './repositories/security-repository.ts';
export async function operationsRoutes({ s, route, method, body: b, user: u, url, origin }: any) {
    if (route === '/bootstrap' && method === 'GET')
        return { data: { ...Object.fromEntries(await asyncMap(LISTS, async (t: any) => [t, await visible(s, t, u)])), serviceRequests: STAFF.includes(u.role) ? await serviceRequestSummary(s) : { openCount: 0, pendingCount: 0, latestPendingId: 0, recentOpen: [] }, settings: await s.settings(), dashboard: await dashboard(s, u) } };
    if (route === '/dashboard' && method === 'GET')
        return { data: await dashboard(s, u) };
    if (route === '/settings' && method === 'GET')
        return { data: await s.settings() };
    if (route === '/settings' && method === 'PUT') {
        allow(u, ['gerente']);
        const p = await s.settings(), v = (k: any) => b[k] ?? p[k], settings = { workshopName: text(v('workshopName'), 'o nome da oficina', 120), warrantyDays: number(v('warrantyDays'), 'a garantia em dias', 90, 3650, true), consumptionWindowDays: number(v('consumptionWindowDays'), 'a janela de consumo em dias', 1, 365, true), defaultLeadDays: number(v('defaultLeadDays'), 'o prazo de entrega padrão', 0, 365, true), budgetValidityHours: number(v('budgetValidityHours'), 'a validade do orçamento em horas', 1, 720, true), openingHour: number(v('openingHour'), 'a hora de abertura', 0, 23, true), closingHour: number(v('closingHour'), 'a hora de fechamento', 1, 24, true), appointmentIntervalMinutes: number(v('appointmentIntervalMinutes'), 'o intervalo da agenda', 5, 120, true), approvalMethods: b.approvalMethods ?? p.approvalMethods ?? ['presencial', 'telefone', 'mensagem'] };
        assert(settings.closingHour > settings.openingHour, 'O fechamento deve ser posterior à abertura.');
        assert(Array.isArray(settings.approvalMethods) && settings.approvalMethods.length > 0 && settings.approvalMethods.length <= 12, 'Cadastre de 1 a 12 formas de manifestação de aprovação.');
        settings.approvalMethods = settings.approvalMethods.map((m: any) => text(m, 'a forma de aprovação', 40));
        assert(!settings.approvalMethods.includes('link'), 'A forma link é reservada à resposta pública.');
        await s.saveSettings(settings);
        await s.audit(u, 'alterar', 'settings', 1);
        return { data: settings };
    }
    if (route === '/availability' && method === 'GET') {
        allow(u, ['gerente', 'atendente']);
        const date = dateValue(url.searchParams.get('date'));
        const serviceIds = String(url.searchParams.get('serviceIds') ?? '').split(',').filter(Boolean).map(Number);
        const excludeId = url.searchParams.get('excludeAppointmentId') ? Number(url.searchParams.get('excludeAppointmentId')) : undefined;
        const existing = excludeId ? await ensure(s, 'appointments', excludeId) : null;
        let durationMinutes;
        if (existing?.serviceRequestId) {
            assert(serviceIds.length === existing.serviceIds.length
                && new Set(serviceIds).size === serviceIds.length
                && serviceIds.every((id: any) => existing.serviceIds.includes(id)), 'Não altere serviços de um pedido confirmado na remarcação.', 409);
            durationMinutes = existing.durationMinutes;
        }
        else {
            const services = await servicesFrom(s, serviceIds);
            durationMinutes = services.reduce((sum: any, service: any) => sum + service.durationMinutes, 0);
        }
        const settings = await s.settings(), slots = [];
        const current = workshopNow();
        assert(date >= current.date, 'Escolha hoje ou uma data futura para consultar horários.');
        for (let minutes = settings.openingHour * 60; minutes + durationMinutes <= settings.closingHour * 60; minutes += settings.appointmentIntervalMinutes) {
            const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
            if (date === current.date && time <= current.time)
                continue;
            for (const mechanic of (await s.list('users')).filter((u: any) => u.active && u.role === 'mecanico')) {
                try {
                    assertNoOverlap({ appointments: await s.list('appointments'), mechanicId: mechanic.id, date, time, durationMinutes, excludeId });
                    slots.push({ time, mechanicId: mechanic.id, mechanicName: mechanic.name });
                }
                catch (e) {
                    if (!(e instanceof DomainError))
                        throw e;
                }
            }
        }
        return { data: { slots, durationMinutes } };
    }
    if (route === '/appointments' && method === 'POST') {
        allow(u, ['gerente', 'atendente']);
        const r = await s.save('appointments', await appointmentData(s, b));
        await s.audit(u, 'criar', 'appointments', r.id);
        const client = await ensure(s, 'clients', r.clientId);
        if (client.email)
            await enqueue(s, client.email, 'Agendamento confirmado no OScar', `Agendamento confirmado para ${r.date}, às ${r.time}. Mecânico: ${(await ensure(s, 'users', r.mechanicId)).name}.`);
        return { status: 201, data: r };
    }
    const am = /^\/appointments\/(\d+)$/.exec(route);
    if (am && method === 'PUT') {
        allow(u, ['gerente', 'atendente']);
        const p = await ensure(s, 'appointments', am[1]);
        assert(p.status === 'agendado', 'Apenas agendamentos em aberto podem ser alterados.', 409);
        const reason = text(b.reason, 'o motivo do cancelamento ou remarcação', 500), r = await s.save('appointments', b.status === 'cancelado' ? { ...p, status: 'cancelado', reason } : await appointmentData(s, { ...b, reason }, p));
        await s.audit(u, 'alterar', 'appointments', r.id, { reason });
        if (r.status === 'cancelado' && p.serviceRequestId) {
            const request = await s.get('service_requests', p.serviceRequestId);
            if (request && !request.anonymizedAt && request.appointmentId === p.id) {
                await s.save('service_requests', {
                    ...request, status: 'em_contato', appointmentId: null,
                    confirmedAt: null, confirmedBy: null,
                    handledBy: u.id, handledAt: timestamp(),
                });
                await s.audit(u, 'alterar', 'service_requests', request.id, { status: 'em_contato', cancelledAppointmentId: p.id });
            }
        }
        const client = await ensure(s, 'clients', r.clientId);
        if (client.email)
            await enqueue(s, client.email, 'Atualização do agendamento OScar', `Agendamento ${r.status === 'cancelado' ? 'cancelado' : 'remarcado para ' + r.date + ' às ' + r.time}. Motivo: ${reason}`);
        return { data: r };
    }
    if (route === '/stock/entries' && method === 'POST') {
        allow(u, ['gerente']);
        const part = await ensure(s, 'parts', b.partId), supplier = await ensure(s, 'suppliers', b.supplierId);
        assert(part.active && supplier.active, 'Selecione peça e fornecedor ativos.');
        const quantity = quantityValue(b.quantity, 'a quantidade de entrada'), date = dateValue(b.date);
        assert(date <= new Date().toISOString().slice(0, 10), 'A entrada não pode ter data futura.');
        part.stock = roundQuantity(part.stock + quantity);
        await s.save('parts', part);
        const r = await s.save('movements', { partId: part.id, orderId: null, supplierId: supplier.id, quantity, date, type: 'entrada', userId: u.id, notes: text(b.notes ?? '', 'a observação', 500, true) });
        await s.audit(u, 'criar', 'movements', r.id);
        return { status: 201, data: r };
    }
    if (route === '/tickets' && method === 'POST') {
        allow(u, ['gerente', 'atendente', 'cliente']);
        const o = ownOrder(u, await ensure(s, 'orders', b.orderId));
        assert(o.status === 'encerrada' && o.closedAt, 'Abra o chamado a partir de uma O.S. encerrada.');
        const warranty = warrantyPolicy({ order: o, settings: await s.settings() }), r = await s.save('tickets', { orderId: o.id, clientId: o.clientId, description: text(b.description, 'a descrição do problema', 2000), status: 'aberto', decision: null, notes: '', withinWarranty: warranty.active, type: warranty.active ? 'garantia' : 'reclamacao', coveredItems: warranty.items.map((i: any) => ({ ...i, quantity: o.items.find((x: any) => x.id === i.id)?.quantity ?? 1 })), warrantyExpiresAt: warranty.expiresAt, warrantyOrderId: null });
        await s.audit(u, 'criar', 'tickets', r.id);
        return { status: 201, data: r };
    }
    const tm = /^\/tickets\/(\d+)(?:\/(warranty-order))?$/.exec(route);
    if (tm) {
        const t = await ensure(s, 'tickets', tm[1]);
        ownOrder(u, await ensure(s, 'orders', t.orderId), { mechanic: false });
        const action = tm[2];
        if (!action && method === 'GET')
            return { data: t };
        allow(u, ['gerente', 'consultor']);
        if (!action && method === 'PUT') {
            const status = b.status ?? t.status;
            assert(['aberto', 'em_analise', 'deferido', 'indeferido', 'encerrado'].includes(status), 'Selecione um status válido.');
            const notes = text(b.notes ?? t.notes ?? '', 'a análise do chamado', 2000, true);
            if (status === 'deferido') {
                assert(t.withinWarranty && t.coveredItems.some((i: any) => i.covered), 'Fora da garantia ou sem itens cobertos: registre como reclamação.', 409);
                assert(notes.length > 0, 'Registre a justificativa da decisão.');
            }
            if (status === 'indeferido')
                assert(notes.length > 0, 'Registre a justificativa do indeferimento.');
            const r = await s.save('tickets', { ...t, status, notes, decision: ['deferido', 'indeferido'].includes(status) ? status : t.decision, decidedBy: ['deferido', 'indeferido'].includes(status) ? u.id : t.decidedBy, decidedAt: ['deferido', 'indeferido'].includes(status) ? timestamp() : t.decidedAt });
            await s.audit(u, 'alterar', 'tickets', r.id);
            return { data: r };
        }
        if (action === 'warranty-order' && method === 'POST') {
            assert(t.status === 'deferido' && t.withinWarranty && !t.warrantyOrderId, 'Defira um chamado em garantia sem O.S. de retorno anterior.', 409);
            const origin = await ensure(s, 'orders', t.orderId), items = origin.items.filter((i: any) => t.coveredItems.some((c: any) => c.id === i.id && c.covered)).map((i: any) => ({ ...i, id: randomUUID(), price: 0, total: 0, executedAt: null, executedBy: null, decision: 'aprovado', approvedAt: timestamp(), approvalMethod: 'garantia', approvalBy: u.id, originItemId: i.id, source: 'garantia' }));
            assert(items.length > 0, 'Não há itens cobertos para retorno.');
            const o = { number: Math.max(1000, ...(await s.list('orders')).map((x: any) => x.number)) + 1, clientId: origin.clientId, vehicleId: origin.vehicleId, mechanicId: (await mechanicFrom(s, b.mechanicId ?? origin.mechanicId)).id, appointmentId: null, originOrderId: origin.id, type: 'garantia', status: 'aberta', items, inspections: [], findings: [], timeline: [{ status: 'aberta', date: timestamp(), userId: u.id, userName: u.name }], closedAt: null };
            for (const item of items)
                await attachInspections(s, o, item);
            const r = await s.save('orders', o);
            await s.save('tickets', { ...t, warrantyOrderId: r.id });
            await s.audit(u, 'criar', 'orders', r.id, { warrantyTicketId: t.id });
            return { status: 201, data: r };
        }
    }
    const anon = /^\/clients\/(\d+)(?:\/anonymize)?$/.exec(route);
    if (anon && ((method === 'POST' && route.endsWith('/anonymize')) || method === 'DELETE')) {
        allow(u, ['gerente']);
        assert(b.confirmation === 'ANONIMIZAR', 'Digite ANONIMIZAR para confirmar a exclusão dos dados pessoais.');
        const r = await anonymizeClient(s, Number(anon[1]), u);
        return { data: r, afterCommit: async () => await purgeClientBackups(s, r.id, u) };
    }
    if (route === '/reports' && method === 'GET') {
        allow(u, ['gerente']);
        const from = url.searchParams.get('from') ? dateValue(url.searchParams.get('from')) : '1900-01-01', to = url.searchParams.get('to') ? dateValue(url.searchParams.get('to')) : '2999-12-31';
        assert(from <= to, 'A data inicial deve ser anterior à final.');
        const mechanicFilter = url.searchParams.get('mechanicId');
        const mechanicId = mechanicFilter ? Number(mechanicFilter) : null;
        assert(mechanicId === null || (Number.isSafeInteger(mechanicId) && mechanicId > 0), 'Selecione um mecânico válido.');
        const orders = await reportOrders(s, mechanicId);
        const services = await asyncFlatMap(orders, async ({ order: o, clientName, vehiclePlate }: any) => await asyncMap(o.items.filter((i: any) => i.kind === 'servico' && i.executedAt && i.executedAt.slice(0, 10) >= from && i.executedAt.slice(0, 10) <= to), async (i: any) => ({ orderId: o.id, number: o.number, clientName, vehiclePlate,
            mechanicId: i.executedBy ?? o.mechanicId,
            mechanicName: (await s.get('users', i.executedBy ?? o.mechanicId))?.name,
            description: i.description, quantity: i.quantity, price: i.price, total: i.total,
            executedAt: i.executedAt })));
        const consumption = await reportPartConsumption(s, from, to, mechanicId);
        const parts = consumption.map(({ partId, part, quantity }: any) => ({ partId, code: part.code,
            description: part.description, quantity: roundQuantity(quantity), cost: part.cost,
            total: round(quantity * part.cost) }));
        const result = { from, to, services, parts, totals: { services: services.reduce((n: any, i: any) => n + i.quantity, 0), serviceRevenue: round(services.reduce((n: any, i: any) => n + i.total, 0)), parts: roundQuantity(parts.reduce((n: any, i: any) => n + i.quantity, 0)), partCost: round(parts.reduce((n: any, i: any) => n + i.total, 0)) } };
        return { data: result, csv: url.searchParams.get('format') === 'csv' };
    }
    const em = /^\/([a-z]+)(?:\/(\d+))?$/.exec(route);
    if (em && LISTS.includes(em[1])) {
        const table = em[1], recordId = em[2];
        if (method === 'GET') {
            if (['audit', 'emails'].includes(table))
                allow(u, ['gerente']);
            const rows = await visible(s, table, u);
            if (recordId) {
                const r = rows.find((r: any) => r.id === Number(recordId));
                assert(r, 'Registro não encontrado.', 404);
                return { data: r };
            }
            return { data: await listResult(rows, url, s) };
        }
        assert(Object.hasOwn(WRITERS, table) && ['POST', 'PUT', 'DELETE'].includes(method), 'Operação não disponível.', 404);
        allow(u, WRITERS[table]);
        const previous = recordId ? await ensure(s, table, recordId) : {};
        assert(method === 'POST' ? !recordId : Boolean(recordId), 'Informe um registro válido para a operação.', 404);
        if (table === 'users' && previous.id === u.id && (b.active === false || method === 'DELETE'))
            throw new DomainError(409, 'Você não pode inativar seu próprio acesso.');
        if (table === 'users' && previous.role === 'gerente' && ((b.role && b.role !== 'gerente') || b.active === false || method === 'DELETE'))
            assert((await s.list('users')).some((x: any) => x.id !== previous.id && x.role === 'gerente' && x.active), 'Mantenha ao menos um gerente ativo.', 409);
        const r = await s.save(table, await entityRecord(s, table, method === 'DELETE' ? { active: false } : b, previous));
        await s.audit(u, method === 'POST' ? 'criar' : method === 'DELETE' ? 'excluir' : 'alterar', table, r.id);
        if (table === 'clients' && method === 'POST') {
            assert(!(await s.list('users')).some((x: any) => x.email === r.email), 'E-mail associado a outra conta. Use outro e-mail.', 409);
            const user = await s.save('users', { name: r.name, email: r.email, role: 'cliente', clientId: r.id, active: true });
            await resetLink(s, user, origin ?? 'https://localhost:4201', 'convite');
        }
        if (table === 'clients' && method === 'PUT') {
            const user = (await s.list('users')).find((x: any) => x.clientId === r.id);
            if (user) {
                assert(!(await s.list('users')).some((x: any) => x.id !== user.id && x.email === r.email), 'E-mail utilizado por outra conta.', 409);
                await s.save('users', { ...user, name: r.name, email: r.email, active: r.active });
                if (!r.active)
                    await new SecurityRepository(s).deleteUserSessions(user.id);
            }
            else if (r.active && r.email) {
                assert(!(await s.list('users')).some((x: any) => x.email === r.email), 'E-mail utilizado por outra conta.', 409);
                const account = await s.save('users', {
                    name: r.name, email: r.email, role: 'cliente', clientId: r.id, active: true,
                });
                await resetLink(s, account, origin ?? 'https://localhost:4201', 'convite');
            }
        }
        if (table === 'users' && method === 'POST' && !b.password)
            await resetLink(s, r, origin ?? 'https://localhost:4201', 'convite');
        if (table === 'users' && (!r.active || r.role !== previous.role))
            await new SecurityRepository(s).deleteUserSessions(r.id);
        return { status: method === 'POST' ? 201 : 200, data: table === 'users' ? safeUser(r) : table === 'parts' ? await partPolicy(s, r) : r };
    }
    return null;
}
