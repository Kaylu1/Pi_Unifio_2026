import { assert } from './domain.ts';
import { STAFF, allow, dateValue, ensure, enqueue, listResult, round, text } from './common.ts';
import { appointmentData, servicesFrom } from './entities.ts';
import { anonymizeServiceRequest, purgeServiceRequestBackups } from './privacy.ts';
function phoneValue(value: any) {
    const phone = text(value, 'um telefone para contato', 30);
    const digits = phone.replace(/\D/g, '');
    assert(digits.length >= 10 && digits.length <= 15, 'Informe um telefone com DDD válido.');
    return phone;
}
function plateValue(value: any) {
    const plate = text(value ?? '', 'a placa do veículo', 12, true).toUpperCase();
    assert(!plate || /^[A-Z0-9-]{7,8}$/.test(plate), 'Informe uma placa válida ou deixe o campo em branco.');
    return plate;
}
const phoneDigits = (value: any) => String(value ?? '').replace(/\D/g, '');
const plateKey = (value: any) => String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const nameKey = (value: any) => String(value ?? '').trim().replace(/\s+/g, ' ').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export async function serviceRequestRecord(s: any, body: any) {
    assert(body && typeof body === 'object' && !Array.isArray(body), 'Revise os dados da solicitação.');
    const ids = body.serviceIds;
    assert(Array.isArray(ids) && ids.every((id: any) => Number.isSafeInteger(id) && id > 0), 'Selecione serviços válidos do catálogo.');
    const services = await servicesFrom(s, ids);
    const symptoms = text(body.symptoms ?? '', 'o que está acontecendo com o veículo', 2000, true);
    assert(!services.some((service: any) => service.purpose === 'avaliacao') || symptoms.length >= 10, 'Descreva o que está acontecendo com o veículo em pelo menos 10 caracteres para solicitar a avaliação.');
    const name = text(body.name, 'seu nome', 120);
    const phone = phoneValue(body.phone);
    const vehicle = text(body.vehicle, 'o veículo (marca e modelo)', 120);
    const plate = plateValue(body.plate);
    const preferredDate = body.preferredDate ? dateValue(body.preferredDate) : '';
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    assert(!preferredDate || preferredDate >= today, 'Escolha hoje ou uma data futura para a preferência de atendimento.');
    const preferredPeriod = body.preferredPeriod ?? '';
    assert(['', 'manha', 'tarde'].includes(preferredPeriod), 'Escolha manhã, tarde ou deixe o período em branco.');
    const snapshot = services.map(({ id, name, price, durationMinutes, purpose }: any) => ({ id, name, price, durationMinutes, purpose: purpose === 'avaliacao' ? 'avaliacao' : 'execucao' }));
    const totalCents = snapshot.reduce((sum: any, service: any) => sum + Math.round(Number(service.price) * 100), 0);
    assert(snapshot.every((service: any) => Number.isFinite(service.price) && service.price >= 0
        && Number.isFinite(service.durationMinutes) && service.durationMinutes > 0), 'Um serviço do catálogo está sem valor ou duração válida. Fale com a oficina.');
    return {
        name, phone, vehicle, plate, symptoms, preferredDate, preferredPeriod,
        serviceIds: snapshot.map((service: any) => service.id), services: snapshot,
        total: round(totalCents / 100),
        durationMinutes: snapshot.reduce((sum: any, service: any) => sum + service.durationMinutes, 0),
        status: 'pendente',
    };
}
export async function createPublicServiceRequest(s: any, body: any) {
    return await s.save('service_requests', await serviceRequestRecord(s, body));
}
export async function serviceRequestSummary(s: any) {
    const open = (await s.list('service_requests'))
        .filter((request: any) => ['pendente', 'em_contato'].includes(request.status))
        .sort((left: any, right: any) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
    return {
        openCount: open.length,
        pendingCount: open.filter((request: any) => request.status === 'pendente').length,
        latestPendingId: open.reduce((latest: any, request: any) => request.status === 'pendente' ? Math.max(latest, request.id) : latest, 0),
        recentOpen: open.slice(0, 3),
    };
}
export async function serviceRequestRoutes({ s, route, method, body, user, url }: any) {
    if (route === '/service-requests/summary' && method === 'GET') {
        allow(user, STAFF);
        return { data: await serviceRequestSummary(s) };
    }
    if (route === '/service-requests' && method === 'GET') {
        allow(user, STAFF);
        const requests = (await s.list('service_requests'))
            .sort((left: any, right: any) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
        return { data: await listResult(requests, url, s) };
    }
    const anonymize = /^\/service-requests\/(\d+)\/anonymize$/.exec(route);
    if (anonymize && method === 'POST') {
        allow(user, ['gerente']);
        const saved = await anonymizeServiceRequest(s, Number(anonymize[1]), user);
        return {
            data: saved,
            afterCommit: () => purgeServiceRequestBackups(s, saved.id, user),
        };
    }
    const confirm = /^\/service-requests\/(\d+)\/confirm$/.exec(route);
    if (confirm && method === 'POST') {
        allow(user, ['gerente', 'atendente']);
        const request = await ensure(s, 'service_requests', confirm[1]);
        assert(!request.anonymizedAt, 'Esta solicitação foi anonimizada e não pode ser agendada.', 409);
        if (request.appointmentId) {
            const appointment = await ensure(s, 'appointments', request.appointmentId);
            assert(appointment.serviceRequestId === request.id && appointment.status !== 'cancelado', 'O vínculo do agendamento precisa ser revisado pela equipe.', 409);
            const [client, vehicle] = await Promise.all([
                ensure(s, 'clients', appointment.clientId), ensure(s, 'vehicles', appointment.vehicleId),
            ]);
            return { data: { appointment, client, vehicle, request } };
        }
        assert(['pendente', 'em_contato'].includes(request.status), 'Somente solicitações abertas podem ser agendadas.', 409);
        assert(body && typeof body === 'object' && !Array.isArray(body), 'Revise os dados para confirmar o atendimento.');
        assert(body.contactConfirmed === true, 'Confirme que o cliente aceitou a data e o horário antes de agendar.');
        assert(body.client === undefined && body.vehicle === undefined, 'O cadastro provisório utiliza os dados enviados pelo cliente. Selecione IDs para vincular cadastros existentes.');
        const hasClientId = body.clientId !== undefined && body.clientId !== null;
        const hasVehicleId = body.vehicleId !== undefined && body.vehicleId !== null;
        const currentServices = await servicesFrom(s, request.serviceIds);
        const requestedServices = new Map<number, any>((request.services ?? []).map((service: any) => [service.id, service]));
        const changedServices = currentServices.filter((service: any) => {
            const original = requestedServices.get(service.id);
            return !original || original.name !== service.name
                || Math.round(Number(original.price) * 100) !== Math.round(Number(service.price) * 100)
                || Number(original.durationMinutes) !== Number(service.durationMinutes)
                || original.purpose !== service.purpose;
        });
        assert(changedServices.length === 0 || body.acceptCatalogChanges === true, `O catálogo mudou desde o pedido (${changedServices.map((service: any) => service.name).join(', ')}). `
            + 'Revise preço, duração e finalidade com o cliente antes de confirmar os valores atuais.', 409);
        let client;
        if (hasClientId) {
            client = await ensure(s, 'clients', body.clientId);
            assert(client.active, 'Selecione um cliente ativo.');
        }
        else {
            if (request.clientId) {
                client = await ensure(s, 'clients', request.clientId);
                assert(client.active, 'O cliente anterior deste pedido está inativo. Selecione um cadastro ativo.', 409);
            }
            else {
                const matches = (await s.list('clients')).filter((existing: any) => existing.active
                    && nameKey(existing.name) === nameKey(request.name)
                    && phoneDigits(existing.phone) === phoneDigits(request.phone));
                assert(matches.length <= 1, 'Há mais de um cliente com esses dados. Selecione o cadastro correto.', 409);
                client = matches[0];
            }
            if (!client) {
                client = await s.save('clients', {
                    name: request.name, phone: phoneDigits(request.phone), cpf: '', email: '',
                    registrationStatus: 'provisorio', active: true,
                });
                await s.audit(user, 'criar', 'clients', client.id, { serviceRequestId: request.id });
            }
        }
        const changedClient = Boolean(request.clientId) && client.id !== request.clientId;
        let vehicle;
        let plateConflict = false;
        if (hasVehicleId) {
            vehicle = await ensure(s, 'vehicles', body.vehicleId);
            assert(vehicle.active && vehicle.clientId === client.id, 'Selecione um veículo ativo pertencente ao cliente.');
        }
        else {
            if (request.vehicleId && !changedClient) {
                vehicle = await ensure(s, 'vehicles', request.vehicleId);
                assert(vehicle.active && vehicle.clientId === client.id, 'O veículo anterior deste pedido não pertence ao cliente selecionado. Revise o vínculo.', 409);
            }
            else {
                const plate = plateKey(request.plate);
                const matches = plate ? (await s.list('vehicles')).filter((existing: any) => existing.active
                    && plateKey(existing.plate) === plate) : [];
                assert(matches.length <= 1, 'Há mais de um veículo com essa placa. Selecione o cadastro correto.', 409);
                vehicle = matches.find((existing: any) => existing.clientId === client.id);
                plateConflict = matches.length > 0 && !vehicle;
                assert(!plateConflict || changedClient, 'A placa informada já pertence a outro cliente. Selecione o cliente e veículo existentes.', 409);
            }
            if (!vehicle) {
                vehicle = await s.save('vehicles', {
                    clientId: client.id, plate: plateConflict ? '' : plateKey(request.plate),
                    chassis: '', brand: '', model: request.vehicle,
                    year: null, mileage: null, registrationStatus: 'provisorio', active: true,
                });
                await s.audit(user, 'criar', 'vehicles', vehicle.id, { serviceRequestId: request.id, plateConflict });
            }
        }
        const nameMismatch = hasClientId && nameKey(client.name) !== nameKey(request.name);
        const phoneMismatch = hasClientId && phoneDigits(client.phone) !== phoneDigits(request.phone);
        const plateMismatch = hasVehicleId && Boolean(request.plate)
            && plateKey(vehicle.plate) !== plateKey(request.plate);
        assert((!nameMismatch && !phoneMismatch && !plateMismatch && !plateConflict)
            || body.acceptIdentityMismatch === true, 'Nome, telefone ou placa do cadastro diferem do pedido. Confira com o cliente antes de confirmar o vínculo.', 409);
        const appointment = await s.save('appointments', {
            ...await appointmentData(s, {
                clientId: client.id, vehicleId: vehicle.id, mechanicId: body.mechanicId,
                serviceIds: request.serviceIds, date: body.date, time: body.time, reason: '',
            }),
            serviceRequestId: request.id,
            confirmedServices: currentServices.map((service: any) => ({
                id: service.id, name: service.name, price: service.price,
                durationMinutes: service.durationMinutes, purpose: service.purpose,
                inspectionItems: service.inspectionItems ?? [],
            })),
        });
        const now = new Date().toISOString();
        const saved = await s.save('service_requests', {
            ...request, status: 'atendida', clientId: client.id, vehicleId: vehicle.id,
            appointmentId: appointment.id, handledBy: user.id, handledAt: now,
            confirmedBy: user.id, confirmedAt: now,
        });
        await s.audit(user, 'criar', 'appointments', appointment.id, { serviceRequestId: request.id });
        await s.audit(user, 'alterar', 'service_requests', request.id, { status: 'atendida', appointmentId: appointment.id, contactConfirmed: true,
            catalogChangesAccepted: changedServices.length > 0,
            identityMismatchAccepted: nameMismatch || phoneMismatch || plateMismatch || plateConflict,
            plateConflict });
        if (client.email)
            await enqueue(s, client.email, 'Agendamento confirmado no OScar', `Agendamento confirmado para ${appointment.date}, às ${appointment.time}.`);
        return { status: 201, data: { appointment, client, vehicle, request: saved } };
    }
    const match = /^\/service-requests\/(\d+)$/.exec(route);
    if (!match)
        return null;
    if (method === 'PUT')
        allow(user, ['gerente', 'atendente']);
    else
        allow(user, STAFF);
    const request = await s.get('service_requests', Number(match[1]));
    assert(request, 'Solicitação não encontrada.', 404);
    if (method === 'GET')
        return { data: request };
    if (method !== 'PUT')
        return null;
    assert(!request.anonymizedAt, 'Esta solicitação foi anonimizada e não pode ser alterada.', 409);
    const status = body.status;
    const next: Record<string, string[]> = { pendente: ['em_contato', 'cancelada'], em_contato: ['cancelada'], atendida: [], cancelada: [] };
    assert(next[request.status]?.includes(status), 'Atualize a solicitação seguindo a próxima etapa de contato.', 409);
    const saved = await s.save('service_requests', {
        ...request, status, handledBy: user.id, handledAt: new Date().toISOString(),
    });
    await s.audit(user, 'alterar', 'service_requests', saved.id, { status });
    return { data: saved };
}
