import { asyncMap } from './async-array.ts';
import { servicePurpose } from './service-purpose.ts';
import { randomUUID, randomBytes } from 'node:crypto';
import { assert, DomainError, assertTransition, maskBudget } from './domain.ts';
import { timestamp, hashToken } from './auth-crypto.ts';
import { ensure, number, round, text, APPROVALS, enqueue, quantityValue } from './common.ts';
export async function itemData(s: any, b: any, u: any, { source = 'inicial', allowPending = false, confirmedService = null }: any = {}) {
    assert(!confirmedService || confirmedService.id === b.serviceId, 'Serviço confirmado diferente do agendamento.', 409);
    const service = b.serviceId ? (confirmedService ?? await ensure(s, 'services', b.serviceId)) : null, part = b.partId ? await ensure(s, 'parts', b.partId) : null;
    assert(Boolean(service) !== Boolean(part), 'Selecione um serviço ou uma peça para cada item.');
    assert(confirmedService || (service ?? part).active, 'Selecione um serviço ou uma peça ativa.');
    const quantity = quantityValue(b.quantity ?? 1), price = round(number(b.price ?? (service ?? part).price, 'o valor unitário', 0, 1000000)), decision = allowPending ? 'pendente' : b.decision ?? 'aprovado';
    assert((allowPending ? ['pendente'] : ['aprovado', 'recusado']).includes(decision), 'Registre aprovação ou recusa para os itens do primeiro atendimento.');
    if (!allowPending && decision === 'aprovado')
        assert(((await s.settings()).approvalMethods ?? APPROVALS).includes(b.approvalMethod) && b.approvalMethod !== 'link', 'Registre uma forma de aprovação admitida pela oficina.');
    return { id: randomUUID(), serviceId: service?.id ?? null, partId: part?.id ?? null, kind: part ? 'peca' : 'servico', servicePurpose: service ? (confirmedService?.purpose ?? servicePurpose(service)) : null, description: text(b.description ?? service?.name ?? part?.description, 'a descrição do item', 200), quantity, price, total: round(quantity * price), decision, approvedAt: decision === 'aprovado' ? timestamp() : null, approvalMethod: decision === 'aprovado' ? b.approvalMethod : null, approvalNotes: text(b.approvalNotes ?? '', 'a observação', 500, true), approvalBy: decision === 'aprovado' ? u.id : null, executedAt: null, executedBy: null, source, suppliedByClient: b.suppliedByClient === true, justification: text(b.justification ?? '', 'a justificativa', 1000, true) };
}
export async function attachInspections(s: any, o: any, item: any, confirmedService: any = null) {
    if (item.serviceId)
        for (const [i, description] of (confirmedService?.inspectionItems ?? (await ensure(s, 'services', item.serviceId)).inspectionItems).entries())
            o.inspections.push({ id: `${item.id}-${i}`, itemId: item.id, description, result: '', notes: '' });
}
export async function changeStatus(s: any, o: any, status: any, u: any) {
    assertTransition(o.status, status, o);
    o.status = status;
    o.timeline.push({ status, date: timestamp(), userId: u.id, userName: u.name });
    if (status === 'encerrada') {
        o.closedAt = timestamp();
        o.warrantyDays = (await s.settings()).warrantyDays;
    }
    return await s.save('orders', o);
}
export async function publicBudgetView(s: any, b: any) { const o = await ensure(s, 'orders', b.orderId); return { ...maskBudget({ budget: b, client: await ensure(s, 'clients', o.clientId), vehicle: await ensure(s, 'vehicles', o.vehicleId) }), number: b.number, status: b.status, expiresAt: b.expiresAt, total: round(b.items.reduce((n: any, i: any) => n + i.price * i.quantity, 0)) }; }
export async function budgetByToken(s: any, token: any) {
    assert(typeof token === 'string' && token.length >= 32 && token.length <= 128, 'Link inválido. Solicite novo orçamento à oficina.', 404);
    const b = (await s.list('budgets')).find((r: any) => r.tokenHash === hashToken(token));
    assert(b, 'Link inválido ou substituído. Solicite um novo orçamento.', 404);
    assert(b.status === 'publicado' && !b.answeredAt, 'Este link já foi respondido ou não está disponível.', 410);
    if (Date.parse(b.expiresAt) <= Date.now()) {
        await s.save('budgets', { ...b, status: 'expirado' });
        throw new DomainError(410, 'Este orçamento expirou. Solicite uma nova emissão.');
    }
    return b;
}
export async function decideBudget(s: any, b: any, body: any, u: any, origin: any) {
    assert(b.status === 'publicado' && Date.parse(b.expiresAt) > Date.now() && !b.answeredAt, 'Orçamento indisponível para resposta. Solicite nova emissão.', 409);
    assert(origin === 'link' || ((await s.settings()).approvalMethods ?? APPROVALS).includes(origin), 'Informe uma origem de decisão admitida pela oficina.');
    assert(Array.isArray(body.decisions) && body.decisions.length === b.items.length, 'Informe aprovação ou recusa para todos os itens.');
    const decisions = new Map();
    for (const x of body.decisions) {
        assert(b.items.some((i: any) => i.id === x.itemId) && !decisions.has(x.itemId) && ['aprovado', 'recusado'].includes(x.decision), 'Responda cada item uma única vez, com aprovação ou recusa.');
        decisions.set(x.itemId, x.decision);
    }
    const at = timestamp(), notes = text(body.notes ?? '', 'a observação da decisão', 1000, true), o = await ensure(s, 'orders', b.orderId);
    assert(!['concluida', 'encerrada', 'cancelada'].includes(o.status), 'A O.S. não pode mais receber uma decisão.', 409);
    b.items = b.items.map((i: any) => ({ ...i, decision: decisions.get(i.id), approvedAt: at, approvalMethod: origin, approvalBy: u?.id ?? null, approvalNotes: notes }));
    b.answeredAt = at;
    b.status = 'respondido';
    b.origin = origin;
    b.tokenHash = null;
    b.link = null;
    o.items = o.items.map((i: any) => b.items.find((x: any) => x.id === i.id) ?? i);
    await s.save('orders', o);
    await s.save('budgets', b);
    if (o.status === 'aguardando_aprovacao' && o.items.every((i: any) => i.decision !== 'pendente'))
        await changeStatus(s, o, 'execucao', u ?? { id: null, name: 'Cliente pelo link' });
    await s.audit(u ?? { name: 'Cliente pelo link' }, 'alterar', 'budgets', b.id, { origin, itemDecisions: [...decisions] });
    const client = await ensure(s, 'clients', o.clientId);
    if (client.email)
        await enqueue(s, client.email, `Resposta do orçamento ${b.number}`, 'Sua resposta foi registrada. A oficina seguirá apenas com os itens aprovados.');
    const { tokenHash, ...safe } = b;
    return safe;
}
export async function publishBudget(s: any, b: any, u: any) {
    assert(['rascunho', 'expirado'].includes(b.status) || (b.status === 'publicado' && Date.parse(b.expiresAt) <= Date.now()), 'O orçamento já foi publicado ou respondido.', 409);
    const o = await ensure(s, 'orders', b.orderId);
    assert(['inspecao', 'execucao', 'aguardando_aprovacao'].includes(o.status), 'A O.S. deve estar em inspeção ou execução.', 409);
    const token = randomBytes(32).toString('base64url');
    b.tokenHash = hashToken(token);
    b.status = 'publicado';
    b.publishedAt = timestamp();
    b.expiresAt = new Date(Date.now() + (b.validityHours ?? (await s.settings()).budgetValidityHours) * 3600000).toISOString();
    b.answeredAt = null;
    b.link = `/orcamento/${token}`;
    for (const item of b.items) {
        item.decision = 'pendente';
        const index = o.items.findIndex((i: any) => i.id === item.id);
        if (index < 0) {
            o.items.push(item);
            await attachInspections(s, o, item);
        }
        else
            o.items[index] = item;
    }
    if (o.status !== 'aguardando_aprovacao')
        await changeStatus(s, o, 'aguardando_aprovacao', u);
    else
        await s.save('orders', o);
    await s.save('budgets', b);
    await s.audit(u, 'alterar', 'budgets', b.id, { action: 'publicar' });
    const { tokenHash, ...safe } = b;
    return { ...safe, tokenPath: b.link };
}
export async function buildBudgetItems(s: any, order: any, inputs: any, user: any, existingBudget: any = null) {
    assert(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 50, 'Inclua entre 1 e 50 itens no orçamento.');
    const used = new Set();
    return await asyncMap(inputs, async (input: any) => {
        const existing = existingBudget?.items.find((item: any) => item.id === input.id), finding = order.findings.find((item: any) => item.id === (input.findingId ?? input.id)), findingId = existing?.findingId ?? finding?.id ?? null;
        if (findingId) {
            assert(!used.has(findingId), 'Inclua cada achado apenas uma vez.');
            used.add(findingId);
            assert(!(await s.list('budgets')).some((b: any) => b.id !== existingBudget?.id && b.orderId === order.id && b.items.some((i: any) => i.id === findingId || i.findingId === findingId)), 'Este achado já foi orçado. Reemita o orçamento existente ou registre uma nova necessidade.', 409);
        }
        const item = await itemData(s, input, user, { source: 'complementar', allowPending: true });
        return { ...item, id: existing?.id ?? finding?.id ?? item.id, findingId };
    });
}
