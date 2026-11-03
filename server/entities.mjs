import { asyncMap } from './async-array.mjs';
import { servicePurpose } from './service-purpose.mjs';
import { assert, assertNoOverlap } from './domain.mjs';
import { hashPassword, timestamp } from './auth-crypto.mjs';
import { STAFF, text, number, round, ensure, documentValue, emailValue, passwordValue, dateValue } from './common.mjs';
export async function entityRecord(s, table, b, p = {}) {
    const value = k => b[k] === undefined ? p[k] : b[k], active = b.active === undefined ? p.active ?? true : b.active;
    assert(typeof active === 'boolean', 'Informe se o registro está ativo.');
    const common = { ...p, active };
    if (table === 'clients') {
        const cpf = documentValue(value('cpf'), 'CPF'), email = emailValue(value('email')), phone = String(value('phone') ?? '').replace(/\D/g, '');
        assert(/^\d{10,11}$/.test(phone), 'Informe telefone com DDD de 10 ou 11 dígitos.');
        assert(!(await s.list(table)).some(r => r.id !== p.id && r.active && (r.cpf === cpf || r.email === email)), 'Já existe cliente ativo com este CPF ou e-mail.', 409);
        return { ...common, name: text(value('name'), 'o nome completo', 120), cpf, email, phone, registrationStatus: 'completo' };
    }
    if (table === 'vehicles') {
        const client = await ensure(s, 'clients', value('clientId'));
        assert(client.active, 'Selecione um cliente ativo.');
        const plate = String(value('plate') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), chassis = String(value('chassis') ?? '').toUpperCase().trim();
        assert(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate), 'Informe uma placa brasileira válida.');
        assert(/^[A-HJ-NPR-Z0-9]{17}$/.test(chassis), 'Informe os 17 caracteres do chassi, sem I, O ou Q.');
        assert(!(await s.list(table)).some(r => r.id !== p.id && r.active && r.plate === plate), 'Esta placa já está vinculada a um veículo ativo.', 409);
        return { ...common, clientId: client.id, plate, chassis, brand: text(value('brand'), 'a marca', 60), model: text(value('model'), 'o modelo', 80), year: number(value('year'), 'o ano', 1900, new Date().getFullYear() + 1, true), mileage: number(value('mileage'), 'a quilometragem', 0, 10000000, true), registrationStatus: 'completo' };
    }
    if (table === 'users') {
        const role = value('role'), email = emailValue(value('email'));
        assert(STAFF.includes(role), 'Selecione um perfil interno válido.');
        assert(!(await s.list(table)).some(r => r.id !== p.id && r.email === email), 'Já existe usuário com este e-mail.', 409);
        return { ...common, name: text(value('name'), 'o nome', 120), email, role, clientId: null, ...(b.password ? { passwordHash: hashPassword(passwordValue(b.password)) } : {}) };
    }
    if (table === 'services') {
        const checks = value('inspectionItems') ?? [], purpose = value('purpose') ?? servicePurpose(p);
        assert(['avaliacao', 'execucao'].includes(purpose), 'Selecione a finalidade do serviço: avaliação ou execução.');
        assert(Array.isArray(checks) && checks.length > 0 && checks.length <= 30, 'Cadastre entre 1 e 30 itens para a folha de verificação.');
        return { ...common, purpose, name: text(value('name') ?? value('description'), 'o nome do serviço', 120), description: text(value('description') ?? value('name'), 'a descrição', 500), price: round(number(value('price'), 'o valor', 0, 1000000)), durationMinutes: number(value('durationMinutes'), 'o tempo estimado em minutos', 1, 600, true), inspectionItems: checks.map(v => text(v, 'a descrição do item de inspeção', 200)) };
    }
    if (table === 'suppliers')
        return { ...common, name: text(value('name'), 'a razão social', 160), cnpj: documentValue(value('cnpj'), 'CNPJ'), contact: text(value('contact'), 'o contato', 160), leadDays: number(value('leadDays'), 'o prazo médio de entrega', 0, 365, true) };
    if (table === 'parts') {
        const code = text(value('code'), 'o código da peça', 60).toUpperCase();
        assert(!(await s.list(table)).some(r => r.id !== p.id && r.code === code), 'Já existe uma peça com este código.', 409);
        const minimum = value('manualMinimum');
        return { ...common, code, description: text(value('description'), 'a descrição da peça', 200), unit: text(value('unit'), 'a unidade', 12), cost: round(number(value('cost'), 'o custo', 0, 1000000)), price: round(number(value('price'), 'o valor de venda', 0, 1000000)), supplierId: value('supplierId') ? (await ensure(s, 'suppliers', value('supplierId'))).id : null, stock: p.stock ?? 0, manualMinimum: minimum === null || minimum === undefined || minimum === '' ? null : number(minimum, 'o estoque mínimo manual', 0, 1000000), historyStartedAt: p.historyStartedAt ?? timestamp() };
    }
    throw new Error('Cadastro não reconhecido.');
}
export async function servicesFrom(s, ids) { assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 30 && new Set(ids).size === ids.length, 'Selecione de 1 a 30 serviços diferentes.'); return await asyncMap(ids, async (v) => { const service = await ensure(s, 'services', v); assert(service.active, 'Selecione apenas serviços ativos.'); return service; }); }
export async function mechanicFrom(s, value) { const u = await ensure(s, 'users', value); assert(u.active && u.role === 'mecanico', 'Selecione um mecânico ativo.'); return u; }
export function workshopNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
export async function appointmentData(s, b, p = {}) {
    const data = { ...p, ...b };
    const linked = Boolean(p.serviceRequestId);
    if (linked)
        assert(Number(data.clientId) === p.clientId && Number(data.vehicleId) === p.vehicleId,
            'Não altere cliente ou veículo de um pedido confirmado na remarcação.', 409);
    const client = await ensure(s, 'clients', data.clientId);
    const vehicle = await ensure(s, 'vehicles', data.vehicleId);
    assert(client.active && vehicle.active && vehicle.clientId === client.id,
        'Selecione um veículo ativo pertencente ao cliente.');
    let services;
    if (linked) {
        assert(Array.isArray(p.confirmedServices) && p.confirmedServices.length === p.serviceIds.length,
            'Os serviços confirmados neste pedido precisam ser revisados.', 409);
        assert(Array.isArray(data.serviceIds) && data.serviceIds.length === p.serviceIds.length
            && new Set(data.serviceIds).size === data.serviceIds.length
            && data.serviceIds.every(id => p.serviceIds.includes(id)),
            'Não altere serviços de um pedido confirmado na remarcação.', 409);
        services = p.confirmedServices;
    } else {
        services = await servicesFrom(s, data.serviceIds);
    }
    const mechanic = await mechanicFrom(s, data.mechanicId);
    const date = dateValue(data.date), time = text(data.time, 'o horário', 5);
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Informe um horário válido.');
    const current = workshopNow();
    assert(date > current.date || (date === current.date && time > current.time),
        'Escolha uma data e horário futuros para o agendamento.');
    const durationMinutes = linked ? p.durationMinutes
        : services.reduce((sum, service) => sum + service.durationMinutes, 0);
    assert(Number.isFinite(durationMinutes) && durationMinutes > 0,
        'A duração confirmada do atendimento precisa ser revisada.', 409);
    const settings = await s.settings(), minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    assert(minutes >= settings.openingHour * 60 && minutes + durationMinutes <= settings.closingHour * 60,
        'Escolha um horário dentro do expediente com tempo para todos os serviços.');
    assertNoOverlap({ appointments: await s.list('appointments'), mechanicId: mechanic.id,
        date, time, durationMinutes, excludeId: p.id });
    return { ...p, clientId: client.id, vehicleId: vehicle.id, mechanicId: mechanic.id,
        serviceIds: services.map(service => service.id), date, time, durationMinutes,
        status: 'agendado', reason: text(b.reason ?? p.reason ?? '', 'o motivo', 500, true) };
}
