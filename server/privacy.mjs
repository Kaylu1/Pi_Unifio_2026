import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword, timestamp } from './auth-crypto.mjs';
import { ensure } from './common.mjs';

/** Mantém apenas informações técnicas que não identificam o solicitante. */
export function redactServiceRequest(request, at = timestamp()) {
    return {
        id: request.id,
        name: 'Solicitação anonimizada', phone: '', vehicle: '', plate: '', symptoms: '',
        preferredDate: '', preferredPeriod: '',
        serviceIds: request.serviceIds ?? [], services: request.services ?? [],
        total: request.total ?? 0, durationMinutes: request.durationMinutes ?? 0,
        status: ['pendente', 'em_contato'].includes(request.status) ? 'cancelada' : request.status,
        createdAt: request.createdAt, updatedAt: at,
        anonymizedAt: request.anonymizedAt ?? at,
    };
}

/** O vínculo confirmado prevalece sobre contato/placa compartilhados por outra pessoa. */
export function serviceRequestBelongsToClient(request, { clientId, vehicleIds, phoneDigits, plates }) {
    if (request.clientId !== undefined && request.clientId !== null)
        return Number(request.clientId) === clientId;
    if (request.vehicleId !== undefined && request.vehicleId !== null)
        return vehicleIds.has(Number(request.vehicleId));
    return (phoneDigits.length >= 10 && String(request.phone ?? '').replace(/\D/g, '') === phoneDigits)
        || plates.has(String(request.plate ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase());
}

export async function anonymizeServiceRequest(store, requestId, actor) {
    const request = await ensure(store, 'service_requests', requestId);
    const redacted = await store.save('service_requests', redactServiceRequest(request));
    for (const entry of await store.list('audit'))
        if (entry.entity === 'service_requests' && entry.recordId === request.id)
            await store.save('audit', { ...entry, details: { redacted: true } });
    if (store.markErasedServiceRequest) await store.markErasedServiceRequest(request.id, actor);
    await store.audit(actor, 'excluir', 'service_requests', request.id,
        { description: 'Dados pessoais da solicitação anonimizados.' });
    return redacted;
}

/** Expurga solicitações das cópias SQLite locais; no PostgreSQL usa tombstones persistentes. */
export async function purgeServiceRequestBackups(store, requestId, actor) {
    if (store.dialect === 'postgres') return await store.purgeServiceRequestBackups(requestId, actor);
    const { createStore } = await import('./store.mjs');
    if (store.filename === ':memory:') return { processed: 0 };
    const folder = resolve(dirname(store.filename), 'backups');
    if (!existsSync(folder)) return { processed: 0 };
    let processed = 0;
    for (const file of readdirSync(folder)) {
        if (!/^oscar-\d{4}-\d{2}-\d{2}\.sqlite$/.test(file)) continue;
        const path = resolve(folder, file);
        if (!path.startsWith(folder + sep)) throw new Error('Caminho de backup inválido.');
        const copy = createStore({ filename: path, seed: false });
        try {
            if (await copy.get('service_requests', requestId)) {
                await copy.transaction(async () => await anonymizeServiceRequest(copy, requestId, actor));
                await copy.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
                processed++;
            }
        } finally { await copy.close(); }
    }
    return { processed };
}
/** Apaga dados identificadores e campos livres relacionados, mantendo somente o histórico técnico. */
export async function anonymizeClient(store, clientId, actor) {
    const s = store, client = await ensure(s, 'clients', clientId), users = (await s.list('users')).filter(x => x.clientId === client.id), userIds = new Set(users.map(u => u.id));
    const vehicles = (await s.list('vehicles')).filter(v => v.clientId === client.id), vehicleIds = new Set(vehicles.map(v => v.id)), orders = (await s.list('orders')).filter(o => o.clientId === client.id), orderIds = new Set(orders.map(o => o.id));
    const appointments = (await s.list('appointments')).filter(a => a.clientId === client.id), appointmentIds = new Set(appointments.map(a => a.id)), tickets = (await s.list('tickets')).filter(t => t.clientId === client.id), ticketIds = new Set(tickets.map(t => t.id)), budgets = (await s.list('budgets')).filter(b => orderIds.has(b.orderId)), budgetIds = new Set(budgets.map(b => b.id));
    const identifiers = [client.name, client.email, client.cpf, client.phone, ...vehicles.flatMap(v => [v.plate, v.chassis])].filter(Boolean);
    const phoneDigits = String(client.phone ?? '').replace(/\D/g, '');
    const plates = new Set(vehicles.map(v => String(v.plate ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()).filter(Boolean));
    const linkedRequests = (await s.list('service_requests')).filter(request =>
        serviceRequestBelongsToClient(request, { clientId: client.id, vehicleIds, phoneDigits, plates }));
    const r = await s.save('clients', { ...client, name: `Cliente anonimizado ${client.id}`, cpf: '', phone: '', email: `anonimizado-${client.id}@oscar.invalid`, active: false, anonymizedAt: timestamp() });
    for (const user of users) {
        await s.save('users', { ...user, name: r.name, email: `anonimizado-user-${user.id}@oscar.invalid`, active: false, passwordHash: hashPassword(randomBytes(32).toString('hex')) });
        await s.db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);
        await s.db.prepare('DELETE FROM reset_tokens WHERE userId=?').run(user.id);
    }
    for (const v of vehicles)
        await s.save('vehicles', { ...v, plate: `REMOVIDO${v.id}`, chassis: '', active: false });
    for (const e of (await s.list('emails')).filter(e => e.to === client.email || identifiers.some(value => String(e.text).includes(value))))
        await s.save('emails', { ...e, to: r.email, text: 'Conteúdo removido por solicitação do titular.', subject: 'Dados removidos', link: null, status: 'anonimizado' });
    for (const o of orders) {
        o.assessmentNotes = '';
        for (const item of [...o.items, ...o.findings]) {
            item.approvalNotes = '';
            item.justification = '';
            if (item.reversals)
                for (const reversal of item.reversals)
                    reversal.reason = '';
        }
        for (const check of o.inspections)
            check.notes = '';
        for (const event of o.timeline)
            if (userIds.has(event.userId))
                event.userName = r.name;
        await s.save('orders', o);
    }
    for (const a of appointments)
        await s.save('appointments', { ...a, reason: '' });
    for (const t of tickets)
        await s.save('tickets', { ...t, description: 'Conteúdo removido por solicitação do titular.', notes: '' });
    for (const b of budgets)
        await s.save('budgets', { ...b, tokenHash: null, link: null, status: b.status === 'publicado' ? 'cancelado' : b.status, items: b.items.map(i => ({ ...i, approvalNotes: '', justification: '' })) });
    for (const request of linkedRequests)
        await anonymizeServiceRequest(s, request.id, actor);
    for (const a of await s.list('audit')) {
        const related = userIds.has(a.actorId) || (a.entity === 'clients' && a.recordId === client.id) || (a.entity === 'users' && userIds.has(a.recordId)) || (a.entity === 'vehicles' && vehicleIds.has(a.recordId)) || (a.entity === 'orders' && orderIds.has(a.recordId)) || (a.entity === 'appointments' && appointmentIds.has(a.recordId)) || (a.entity === 'tickets' && ticketIds.has(a.recordId)) || (a.entity === 'budgets' && budgetIds.has(a.recordId));
        if (related)
            await s.save('audit', { ...a, actorName: userIds.has(a.actorId) ? r.name : a.actorName, details: { redacted: true } });
    }
    if (s.markErasedClient) await s.markErasedClient(client.id,actor);
    await s.audit(actor, 'excluir', 'clients', client.id, { description: 'Dados pessoais anonimizados por solicitação do titular.' });
    return r;
}
/** Expurga o mesmo titular de cada cópia SQLite diária, sem excluir backups de outros clientes. */
export async function purgeClientBackups(store, clientId, actor) {
    if (store.dialect === 'postgres')
        return await store.purgeClientBackups(clientId, actor);
    const { createStore } = await import('./store.mjs');
    if (store.filename === ':memory:')
        return { processed: 0 };
    const folder = resolve(dirname(store.filename), 'backups');
    if (!existsSync(folder))
        return { processed: 0 };
    // Uma cópia anterior à confirmação não tem clientId no pedido. Os vínculos atuais
    // da agenda/O.S. ainda identificam o pedido que deve ser apagado nessa cópia.
    const requestIds = new Set([
        ...(await store.list('appointments')).filter(a => a.clientId === clientId).map(a => a.serviceRequestId),
        ...(await store.list('orders')).filter(o => o.clientId === clientId).map(o => o.serviceRequestId),
    ].filter(id => Number.isSafeInteger(id) && id > 0));
    let processed = 0;
    for (const file of readdirSync(folder)) {
        if (!/^oscar-\d{4}-\d{2}-\d{2}\.sqlite$/.test(file))
            continue;
        const path = resolve(folder, file);
        if (!path.startsWith(folder + sep))
            throw new Error('Caminho de backup inválido.');
        const copy = createStore({ filename: path, seed: false });
        try {
            const hasClient = Boolean(await copy.get('clients', clientId));
            const olderRequests = [];
            for (const requestId of requestIds)
                if (await copy.get('service_requests', requestId)) olderRequests.push(requestId);
            if (hasClient || olderRequests.length) {
                await copy.transaction(async () => {
                    if (hasClient) await anonymizeClient(copy, clientId, actor);
                    for (const requestId of olderRequests) {
                        const request = await copy.get('service_requests', requestId);
                        if (request && !request.anonymizedAt)
                            await anonymizeServiceRequest(copy, requestId, actor);
                    }
                });
                await copy.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
                processed++;
            }
        }
        finally {
            await copy.close();
        }
    }
    return { processed };
}
