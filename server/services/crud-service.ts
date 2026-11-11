import { assert } from '../domain.ts';
import { allow, dateValue, ensure, number, quantityValue, roundQuantity, text } from '../common.ts';
import { mechanicFrom } from '../entities.ts';
import { timestamp } from '../auth-crypto.ts';
import { operationsRoutes } from '../operations-routes.ts';
import { orderRoutes } from '../order-routes.ts';
import { createPublicServiceRequest, serviceRequestRecord } from '../service-requests.ts';
import type { ServiceContext, ServiceResult } from '../contracts.ts';

async function remove(context: ServiceContext, entity: string, id: number): Promise<void> {
  assert(context.s.remove, 'O armazenamento não permite esta exclusão.', 503);
  await context.s.remove(entity, id);
  await context.s.audit(context.user, 'excluir', entity, id);
}

export async function extendedCrud(context: ServiceContext): Promise<ServiceResult | null> {
  const { s, route, method, body, user, url } = context;
  if (route === '/queries/appointments' && method === 'GET') {
    allow(user, ['gerente', 'atendente']);
    const date = dateValue(url.searchParams.get('date'));
    const mechanicId = url.searchParams.has('mechanicId')
      ? number(Number(url.searchParams.get('mechanicId')), 'o mecânico', 1, Number.MAX_SAFE_INTEGER, true) : null;
    if (mechanicId) await mechanicFrom(s, mechanicId);
    const items = s.appointmentsByDate ? await s.appointmentsByDate(date, mechanicId)
      : (await s.list('appointments')).filter(row => row.date === date && (!mechanicId || row.mechanicId === mechanicId));
    return { data: { items, total: items.length, date, mechanicId } };
  }
  if (route === '/queries/parts/low-stock' && method === 'GET') {
    allow(user, ['gerente', 'atendente']);
    const items = s.lowStockParts ? await s.lowStockParts()
      : (await s.list('parts')).filter(row => row.active && row.stock <= (row.manualMinimum ?? 0));
    return { data: { items, total: items.length } };
  }
  if (route === '/service-requests' && method === 'POST') {
    allow(user, ['gerente', 'atendente']);
    const record = await createPublicServiceRequest(s, body);
    await s.audit(user, 'criar', 'service_requests', record.id);
    return { status: 201, data: record };
  }
  if (route === '/budgets' && method === 'POST') {
    return await orderRoutes({ ...context, route: '/orders/' + number(body.orderId, 'a O.S.', 1, Number.MAX_SAFE_INTEGER, true) + '/budgets' });
  }
  if (route === '/movements' && method === 'POST') {
    return await operationsRoutes({ ...context, route: '/stock/entries' });
  }
  const match = /^\/(orders|appointments|budgets|movements|tickets|service-requests)\/(\d+)$/.exec(route);
  if (!match) return null;
  const [, resource, rawId] = match;
  const id = Number(rawId);

  if (resource === 'orders' && method === 'PUT') {
    allow(user, ['gerente', 'atendente']);
    const order = await ensure(s, 'orders', id);
    assert(order.status === 'aberta' && !order.items.some((item: any) => item.executedAt), 'Edite os dados iniciais apenas enquanto a O.S. estiver aberta e sem execução.', 409);
    for (const key of ['clientId', 'vehicleId', 'appointmentId']) {
      assert(body[key] === undefined || body[key] === order[key], 'O vínculo com cliente, veículo e agendamento não pode ser trocado nesta O.S.', 409);
    }
    assert(body.items === undefined && body.serviceIds === undefined && body.status === undefined, 'Use as operações de itens e de situação para alterar o atendimento.', 409);
    const mechanicId = body.mechanicId === undefined ? order.mechanicId : (await mechanicFrom(s, body.mechanicId)).id;
    const saved = await s.save('orders', { ...order, mechanicId,
      assessmentNotes: text(body.assessmentNotes ?? order.assessmentNotes ?? '', 'o relato inicial', 1000, true) });
    await s.audit(user, 'alterar', 'orders', id);
    return { data: saved };
  }
  if (resource === 'orders' && method === 'DELETE') {
    allow(user, ['gerente']);
    const order = await ensure(s, 'orders', id);
    assert(order.status === 'aberta' && !order.items.some((item: any) => item.executedAt), 'Cancele apenas uma O.S. aberta e sem execução.', 409);
    assert(!(await s.list('budgets')).some(row => row.orderId === id)
      && !(await s.list('tickets')).some(row => row.orderId === id), 'A O.S. possui orçamento ou chamado vinculado e deve manter seu histórico.', 409);
    const saved = await s.save('orders', { ...order, status: 'cancelada', cancelledAt: timestamp(),
      cancellationReason: text(body.reason ?? 'Abertura cancelada pela oficina.', 'o motivo', 500),
      timeline: [...order.timeline, { status: 'cancelada', date: timestamp(), userId: user.id, userName: user.name }] });
    if (order.appointmentId) {
      const appointment = await s.get('appointments', order.appointmentId);
      if (appointment) {
        await s.save('appointments', { ...appointment, status: 'cancelado', reason: saved.cancellationReason });
        if (appointment.serviceRequestId) {
          const request = await s.get('service_requests', appointment.serviceRequestId);
          if (request && !request.anonymizedAt && request.appointmentId === appointment.id) {
            await s.save('service_requests', { ...request, status: 'em_contato', appointmentId: null,
              confirmedAt: null, confirmedBy: null, handledBy: user.id, handledAt: timestamp() });
            await s.audit(user, 'alterar', 'service_requests', request.id, { cancelledOrderId: id, cancelledAppointmentId: appointment.id });
          }
        }
      }
    }
    await s.audit(user, 'excluir', 'orders', id, { logical: true });
    return { data: saved };
  }
  if (resource === 'appointments' && method === 'DELETE') {
    const result = await operationsRoutes({ ...context, method: 'PUT', body: { status: 'cancelado', reason: body.reason ?? 'Agendamento cancelado pela oficina.' } });
    return result;
  }
  if (resource === 'budgets' && method === 'DELETE') {
    allow(user, ['gerente', 'consultor']);
    const budget = await ensure(s, 'budgets', id);
    assert(budget.status === 'rascunho', 'Exclua apenas orçamentos em rascunho. Os publicados mantêm o histórico da aprovação.', 409);
    await remove(context, 'budgets', id);
    return { status: 204, data: null };
  }
  if (resource === 'movements' && ['PUT', 'DELETE'].includes(method)) {
    allow(user, ['gerente']);
    const movement = await ensure(s, 'movements', id);
    assert(movement.type === 'entrada', 'Saídas e estornos de O.S. são registros de execução. Use a operação de estorno da O.S.', 409);
    const part = await ensure(s, 'parts', movement.partId);
    assert(body.partId === undefined || body.partId === movement.partId, 'Não troque a peça de uma entrada registrada.', 409);
    const quantity = method === 'DELETE' ? 0 : quantityValue(body.quantity ?? movement.quantity, 'a quantidade de entrada');
    const nextStock = roundQuantity(part.stock - movement.quantity + quantity);
    assert(nextStock >= 0, 'Esta entrada já foi consumida. A correção deixaria o estoque negativo.', 409);
    if (method === 'DELETE') {
      await s.save('parts', { ...part, stock: nextStock });
      await remove(context, 'movements', id);
      return { status: 204, data: null };
    }
    const supplierId = body.supplierId === undefined ? movement.supplierId : (await ensure(s, 'suppliers', body.supplierId)).id;
    const date = dateValue(body.date ?? movement.date);
    assert(date <= new Date().toISOString().slice(0, 10), 'A entrada não pode ter data futura.');
    const saved = await s.save('movements', { ...movement, supplierId, quantity, date, notes: text(body.notes ?? movement.notes ?? '', 'a observação', 500, true) });
    await s.save('parts', { ...part, stock: nextStock });
    await s.audit(user, 'alterar', 'movements', id);
    return { data: saved };
  }
  if (resource === 'tickets' && method === 'DELETE') {
    allow(user, ['gerente']);
    const ticket = await ensure(s, 'tickets', id);
    assert(ticket.status === 'aberto' && !ticket.warrantyOrderId && !ticket.decision, 'Exclua apenas chamados abertos e ainda sem decisão ou retorno de garantia.', 409);
    await remove(context, 'tickets', id);
    return { status: 204, data: null };
  }
  if (resource === 'service-requests' && method === 'PUT' && body.status === undefined) {
    allow(user, ['gerente', 'atendente']);
    const previous = await ensure(s, 'service_requests', id);
    assert(['pendente', 'em_contato'].includes(previous.status) && !previous.appointmentId && !previous.anonymizedAt, 'Edite os dados do pedido antes da confirmação do agendamento.', 409);
    const values = await serviceRequestRecord(s, { ...previous, ...body });
    const saved = await s.save('service_requests', { ...previous, ...values, status: previous.status });
    await s.audit(user, 'alterar', 'service_requests', id);
    return { data: saved };
  }
  if (resource === 'service-requests' && method === 'DELETE') {
    allow(user, ['gerente', 'atendente']);
    const request = await ensure(s, 'service_requests', id);
    assert(['pendente', 'em_contato'].includes(request.status) && !request.appointmentId, 'Cancele o agendamento vinculado antes de cancelar este pedido.', 409);
    const saved = await s.save('service_requests', { ...request, status: 'cancelada', handledBy: user.id, handledAt: timestamp() });
    await s.audit(user, 'excluir', 'service_requests', id, { logical: true });
    return { data: saved };
  }
  return null;
}
