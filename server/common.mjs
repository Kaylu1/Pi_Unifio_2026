import { asyncMap, asyncFilter } from './async-array.mjs';
import { randomBytes } from 'node:crypto';
import { hashToken, timestamp } from './auth-crypto.mjs';
import { assert, stockPolicy } from './domain.mjs';
export const ROLES = ['gerente', 'atendente', 'mecanico', 'consultor', 'cliente'];
export const STAFF = ROLES.filter(r => r !== 'cliente');
export const APPROVALS = ['presencial', 'telefone', 'mensagem', 'link'];
export const WRITERS = { clients: ['gerente', 'atendente'], vehicles: ['gerente', 'atendente'], users: ['gerente'], services: ['gerente'], suppliers: ['gerente'], parts: ['gerente'] };
export const LISTS = ['clients', 'vehicles', 'users', 'services', 'suppliers', 'parts', 'appointments', 'orders', 'budgets', 'movements', 'tickets', 'emails', 'audit'];
export const DAY = 86400000;
export const round = n => Number(n.toFixed(2));
export const text = (v, label, max = 240, optional = false) => { const x = typeof v === 'string' ? v.trim() : ''; assert((optional || x.length > 0) && x.length <= max, `Informe ${label} com até ${max} caracteres.`); return x; };
export const number = (v, label, min = 0, max = 1e9, integer = false) => { assert(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)), `Informe ${label} entre ${min} e ${max}${integer ? ', sem casas decimais' : ''}.`); return v; };
export const id = v => number(Number(v), 'um registro válido', 1, Number.MAX_SAFE_INTEGER, true);
export const ensure = async (s, table, value) => { const r = await s.get(table, id(value)); assert(r, 'Registro não encontrado. Atualize a lista e tente novamente.', 404); return r; };
export const allow = (u, roles) => assert(u && roles.includes(u.role), 'Seu perfil não pode realizar esta ação.', 403);
export const safeUser = u => u ? { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, clientId: u.clientId } : null;
export function ownOrder(u, o, { mechanic = true } = {}) {
    if (u.role === 'cliente')
        assert(o.clientId === u.clientId, 'Ordem de serviço não encontrada.', 404);
    if (mechanic && u.role === 'mecanico')
        assert(o.mechanicId === u.id, 'Esta O.S. pertence a outro mecânico.', 403);
    return o;
}
export function emailValue(v) { const x = text(v, 'um e-mail válido', 254).toLowerCase(); assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x), 'Informe um e-mail válido.'); return x; }
export function documentValue(v, kind) { const x = String(v ?? '').replace(/\D/g, ''); const length = kind === 'CPF' ? 11 : 14; assert(x.length === length && !/^([0-9])\1+$/.test(x), `Informe ${kind} válido.`); const digit = (base, w) => { const rem = [...base].reduce((sum, c, i) => sum + Number(c) * w[i], 0) % 11; return rem < 2 ? 0 : 11 - rem; }; const w = kind === 'CPF' ? [10, 9, 8, 7, 6, 5, 4, 3, 2] : [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const base = x.slice(0, -2), first = digit(base, w); assert(first === Number(x.at(-2)) && digit(base + first, [kind === 'CPF' ? 11 : 6, ...w]) === Number(x.at(-1)), `Confira os dígitos do ${kind}.`); return x; }
export function dateValue(v) { assert(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v, 'Informe uma data válida no formato AAAA-MM-DD.'); return v; }
export function passwordValue(v) { assert(typeof v === 'string' && v.length >= 10 && v.length <= 128 && /[A-Za-z]/.test(v) && /\d/.test(v), 'Use uma senha de 10 a 128 caracteres com letras e números.'); return v; }
export async function partPolicy(s, p) { const policy = stockPolicy({ part: p, movements: (await s.list('movements')).filter(m => m.partId === p.id), supplier: p.supplierId ? await s.get('suppliers', p.supplierId) : {}, settings: await s.settings(), now: timestamp() }); return { ...p, ...policy, lowStock: p.stock <= policy.minimum }; }
export async function visible(s, table, u) {
    const rows = await s.list(table);
    if (table === 'users')
        return u.role === 'gerente' ? rows.map(safeUser) : rows.filter(r => r.active && (r.role === 'mecanico' || r.id === u.id)).map(({ id, name, role, active }) => ({ id, name, role, active }));
    if (['emails', 'audit'].includes(table))
        return u.role === 'gerente' ? rows : [];
    if (table === 'parts') {
        if (!STAFF.includes(u.role)) return [];
        const [movements,suppliers,settings] = await Promise.all([s.list('movements'),s.list('suppliers'),s.settings()]);
        return rows.map(part => { const policy=stockPolicy({part,movements:movements.filter(m=>m.partId===part.id),supplier:suppliers.find(supplier=>supplier.id===part.supplierId)??{},settings,now:timestamp()}); return {...part,...policy,lowStock:part.stock<=policy.minimum}; });
    }
    if (['suppliers', 'movements'].includes(table))
        return ['gerente', 'atendente'].includes(u.role) ? rows : [];
    if (table === 'services')
        return rows.filter(r => r.active || u.role === 'gerente');
    if (u.role === 'cliente') {
        if (table === 'clients')
            return rows.filter(r => r.id === u.clientId);
        if (['vehicles', 'appointments', 'orders', 'tickets'].includes(table))
            return rows.filter(r => r.clientId === u.clientId);
        if (table === 'budgets') {
            const ids = new Set((await s.list('orders')).filter(o => o.clientId === u.clientId).map(o => o.id));
            return rows.filter(b => ids.has(b.orderId)).map(({ tokenHash, ...r }) => r);
        }
        return [];
    }
    if (u.role === 'mecanico') {
        const orders = (await s.list('orders')).filter(o => o.mechanicId === u.id);
        if (['orders', 'appointments'].includes(table))
            return rows.filter(r => r.mechanicId === u.id);
        if (table === 'clients')
            return rows.filter(r => orders.some(o => o.clientId === r.id)).map(({ id, name, active }) => ({ id, name, active }));
        if (table === 'vehicles')
            return rows.filter(r => orders.some(o => o.vehicleId === r.id));
        if (table === 'budgets')
            return [];
        if (table === 'tickets')
            return rows.filter(r => orders.some(o => o.id === r.orderId));
    }
    return table === 'budgets' ? rows.map(({ tokenHash, ...r }) => r) : rows;
}
export async function listResult(rows, url, s) {
    const q = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('pt-BR'), f = url.searchParams.get('filter') ?? url.searchParams.get('status') ?? '';
    rows = await asyncFilter(rows, async (r) => {
        const hay = [...Object.values(r).filter(v => ['string', 'number'].includes(typeof v))];
        if (r.clientId)
            hay.push((await s.get('clients', r.clientId))?.name ?? '');
        if (r.vehicleId)
            hay.push((await s.get('vehicles', r.vehicleId))?.plate ?? '');
        return (!q || hay.some(v => String(v).toLocaleLowerCase('pt-BR').includes(q))) && (!f || f === 'todos' || (f === 'ativo' ? r.active !== false : f === 'inativo' ? r.active === false : r.status === f || r.role === f)) && ['mechanicId', 'clientId', 'partId', 'date'].every(k => !url.searchParams.get(k) || String(r[k]) === url.searchParams.get(k));
    });
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1), pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}
export async function enqueue(s, to, subject, body, kind = 'notificacao') { return await s.save('emails', { to, subject, text: body, link: body.match(/https?:\/\/[^\s]+/u)?.[0] ?? null, kind, status: process.env.SMTP_HOST ? 'pendente' : 'capturado', attempts: 0, sentAt: null, nextAttemptAt: timestamp(), error: null }); }
export async function resetLink(s, u, base, kind = 'recuperacao') { const token = randomBytes(32).toString('base64url'); await s.db.prepare('INSERT INTO reset_tokens(token,userId,expiresAt) VALUES(?,?,?)').run(hashToken(token), u.id, Date.now() + DAY); await enqueue(s, u.email, kind === 'convite' ? 'Seu acesso ao OScar' : 'Recuperação de acesso ao OScar', `Olá, ${u.name.split(' ')[0]}. Defina sua senha pelo link de uso único válido por 24 horas: ${base}/redefinir/${token}`, kind); }
export async function dashboard(s, u) { const orders = await visible(s, 'orders', u), budgets = await visible(s, 'budgets', u), parts = await visible(s, 'parts', u), closed = orders.filter(o => o.closedAt), decisions = budgets.flatMap(b => b.items).filter(i => i.decision !== 'pendente'); return { ordersByStatus: Object.fromEntries(['aberta', 'inspecao', 'aguardando_aprovacao', 'execucao', 'concluida', 'encerrada', 'cancelada'].map(status => [status, orders.filter(o => o.status === status).length])), openOrders: orders.filter(o => !['encerrada', 'cancelada'].includes(o.status)).length, averageStayHours: closed.length ? round(closed.reduce((n, o) => n + Math.max(0, (Date.parse(o.closedAt) - Date.parse(o.createdAt)) / 3600000), 0) / closed.length) : 0, lowStockCount: parts.filter(p => p.lowStock).length, approvalRate: decisions.length ? round(decisions.filter(i => i.decision === 'aprovado').length / decisions.length * 100) : 0, appointmentsToday: (await visible(s, 'appointments', u)).filter(a => a.date === new Date().toISOString().slice(0, 10) && a.status === 'agendado').length }; }
export const roundQuantity = value => Number(value.toFixed(3));
export function quantityValue(value, label = 'a quantidade') { number(value, label, 0.001, 1000000); assert(Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Use no máximo três casas decimais para a quantidade.'); return value; }
