/**
 * Regras puras do OScar, rastreadas à ERS 1.4.
 * Datas públicas são ISO-8601; valores monetários não são alterados aqui.
 */
export class DomainError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export function assert(condition, message, status = 422) {
  if (!condition) throw new DomainError(status, message);
}

const DAY = 86_400_000;
const PUBLIC_ITEM_FIELDS = [
  'id', 'description', 'kind', 'quantity', 'price', 'total', 'decision', 'justification',
  'unitPriceCents', 'totalCents',
];

function timestamp(value, label) {
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(Number.isFinite(millis), `${label} inválida. Informe uma data válida.`);
  return millis;
}

function nonNegative(value, label, fallback = 0) {
  const selected = value === undefined || value === null ? fallback : value;
  assert(typeof selected === 'number' && Number.isFinite(selected) && selected >= 0,
    `${label} deve ser um número maior ou igual a zero.`);
  return selected;
}

function positiveDays(value, label, fallback) {
  const days = nonNegative(value, label, fallback);
  assert(days > 0, `${label} deve ser maior que zero.`);
  return days;
}

function orderItems(orderOrItems) {
  if (Array.isArray(orderOrItems)) return orderOrItems;
  return Array.isArray(orderOrItems?.items) ? orderOrItems.items : [];
}

/** RN06: decisão é registrada com autoria/data pela camada transacional da API. */
export function assertApproval(item) {
  assert(item?.decision === 'aprovado',
    'Registre a aprovação do cliente antes de executar o serviço ou aplicar a peça.', 409);
  return item;
}

/** RN11: itens recusados/pendentes não são tratados como serviços executados. */
export function assertCanClose(orderOrItems) {
  const incomplete = orderItems(orderOrItems)
    .filter((item) => item.decision === 'aprovado' && !item.executedAt);
  assert(incomplete.length === 0,
    'Aponte a execução de todos os itens aprovados antes de concluir ou encerrar a O.S.', 409);
  for (const item of orderItems(orderOrItems)) {
    if (item.decision === 'aprovado') timestamp(item.executedAt, 'Data de execução');
  }
  return true;
}

/**
 * RN10/RNF11: allowlist explícita, sem espalhar objetos internos na página pública.
 * Itens também são projetados: nenhum cliente, veículo, histórico ou usuário aninhado.
 */
export function maskBudget({ budget, client = {}, vehicle = {}, items } = {}) {
  const firstName = String(client.name ?? '').trim().split(/\s+/u)[0] || '';
  const plate = String(vehicle.plate ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
  const chassis = String(vehicle.chassis ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
  const sourceItems = items ?? budget?.items ?? [];
  assert(Array.isArray(sourceItems), 'Os itens do orçamento devem ser uma lista.');
  return {
    clientFirstName: firstName,
    plateMasked: plate ? `****${plate.slice(-3)}` : '',
    chassisMasked: chassis ? `***********${chassis.slice(-6)}` : '',
    items: sourceItems.map((item) => Object.fromEntries(PUBLIC_ITEM_FIELDS
      .filter((key) => item[key] !== undefined)
      .map((key) => [key, item[key]]))),
  };
}

/**
 * RN13/SD06: a janela usa [agora-janela, agora], saídas menos estornos.
 * Histórico suficiente exige pelo menos 30 dias e a janela inteira configurada.
 * Sem histórico suficiente, somente o mínimo manual é usado. Entradas não são consumo.
 * Quantidades de reposição são arredondadas para cima para atender unidades inteiras.
 *
 * Aceita objeto agregado da API ou campos planos para facilitar testes isolados.
 */
export function stockPolicy(input = {}) {
  const { part = {}, supplier = {}, settings = {}, movements = [] } = input;
  assert(Array.isArray(movements), 'As movimentações devem ser uma lista.');
  const now = timestamp(input.now ?? new Date().toISOString(), 'Data de referência');
  const windowDays = positiveDays(input.windowDays ?? settings.consumptionWindowDays,
    'Janela de consumo', 30);
  const leadDays = nonNegative(input.leadDays ?? supplier?.leadDays,
    'Prazo de entrega', input.defaultLeadDays ?? settings.defaultLeadDays ?? 5);
  const stock = nonNegative(input.stock ?? part.stock, 'Estoque atual');
  const manualRaw = input.manualMinimum !== undefined ? input.manualMinimum : part.manualMinimum;
  const manual = manualRaw === undefined || manualRaw === null
    ? null : Math.ceil(nonNegative(manualRaw, 'Estoque mínimo manual'));
  const startedAt = input.historyStartedAt ?? part.historyStartedAt ?? part.createdAt;
  const historyStart = startedAt ? timestamp(startedAt, 'Início do histórico') : null;
  const requiredHistoryDays = Math.max(30, windowDays);
  const hasHistory = historyStart !== null && now - historyStart >= requiredHistoryDays * DAY;
  const start = now - windowDays * DAY;
  let netConsumption = 0;
  if (hasHistory) {
    for (const movement of movements) {
      if (part.id !== undefined && movement.partId !== undefined
        && String(movement.partId) !== String(part.id)) continue;
      if (!['saida', 'estorno'].includes(movement.type)) continue;
      const date = timestamp(movement.date ?? movement.createdAt, 'Data da movimentação');
      if (date < start || date > now) continue;
      const quantity = nonNegative(movement.quantity, 'Quantidade movimentada');
      netConsumption += movement.type === 'saida' ? quantity : -quantity;
    }
  }
  const averageDaily = hasHistory ? Math.max(0, netConsumption) / windowDays : 0;
  const calculated = Math.ceil(Number((averageDaily * leadDays).toFixed(12)));
  const minimum = manual ?? calculated;
  return {
    minimum,
    suggested: Math.max(0, Number((minimum - stock).toFixed(12))),
    averageDaily,
    hasHistory,
  };
}

/**
 * RN14-17: prazo mínimo de 90 dias a partir do encerramento, inclusive no limite.
 * Peça fornecida pelo cliente não é coberta; a mão de obra executada permanece coberta.
 */
export function warrantyPolicy(input = {}) {
  const { order = {}, settings = {} } = input;
  const items = input.items ?? order.items ?? [];
  assert(Array.isArray(items), 'Os itens da garantia devem ser uma lista.');
  const days = Math.max(90, positiveDays(input.days ?? order.warrantyDays ?? settings.warrantyDays,
    'Prazo de garantia', 90));
  const now = timestamp(input.now ?? new Date().toISOString(), 'Data de referência');
  const closed = input.closedAt ?? order.closedAt;
  const started = closed ? timestamp(closed, 'Data de encerramento') : null;
  const expires = started === null ? null : started + days * DAY;
  const active = started !== null && now >= started && now <= expires;
  const source = input.source ?? 'oficina';
  const covered = active && source === 'oficina';
  return {
    days,
    startsAt: started === null ? null : new Date(started).toISOString(),
    expiresAt: expires === null ? null : new Date(expires).toISOString(),
    active,
    covered,
    items: items.map((item) => {
      const clientPart = item.kind === 'peca'
        && (item.suppliedByClient === true || item.source === 'cliente');
      const executed = Boolean(item.executedAt);
      const itemCovered = active && executed && !clientPart;
      return {
        id: item.id,
        description: item.description,
        kind: item.kind,
        covered: itemCovered,
        reason: !executed ? 'Item sem execução registrada.'
          : clientPart ? 'Peça fornecida pelo cliente; somente a mão de obra é coberta.'
            : active ? 'Item coberto pela garantia da oficina.'
              : started === null ? 'A garantia começa no encerramento da O.S.'
                : now < started ? 'A garantia ainda não iniciou.'
                  : 'Prazo de garantia encerrado; registrar como reclamação.',
      };
    }),
  };
}

const TRANSITIONS = {
  aberta: ['inspecao', 'cancelada'],
  inspecao: ['aguardando_aprovacao', 'cancelada'],
  aguardando_aprovacao: ['execucao'],
  execucao: ['aguardando_aprovacao', 'concluida'],
  concluida: ['encerrada'],
  encerrada: [],
  cancelada: [],
};

/** Ciclo ERS/RN07: recusa complementar devolve à execução; não cancela a O.S. */
export function assertTransition(current, next, itemsOrOrder = []) {
  assert(Object.hasOwn(TRANSITIONS, current) && Object.hasOwn(TRANSITIONS, next),
    'Selecione um status válido para a O.S.');
  assert(TRANSITIONS[current].includes(next),
    'Esta mudança de status não é permitida. Siga a próxima etapa da O.S.', 409);
  const items = orderItems(itemsOrOrder);
  if (current === 'aguardando_aprovacao' && next === 'execucao') {
    assert(items.every((item) => item.decision !== 'pendente'),
      'Registre a resposta de todos os itens pendentes antes de iniciar a execução.', 409);
  }
  if (next === 'concluida' || next === 'encerrada') assertCanClose(items);
  return true;
}

function appointmentInterval(appointment) {
  if (appointment.start !== undefined || appointment.end !== undefined) {
    const start = timestamp(appointment.start, 'Início do agendamento');
    const end = timestamp(appointment.end, 'Fim do agendamento');
    assert(end > start, 'O horário final deve ser posterior ao inicial.');
    return { start, end };
  }
  assert(typeof appointment.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(appointment.date),
    'Informe a data do agendamento no formato AAAA-MM-DD.');
  assert(typeof appointment.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(appointment.time),
    'Informe um horário válido no formato HH:mm.');
  // Relógio de agenda local, sem depender do fuso horário da máquina que executa os testes.
  const start = timestamp(`${appointment.date}T${appointment.time}:00.000Z`, 'Data do agendamento');
  assert(new Date(start).toISOString().slice(0, 10) === appointment.date,
    'Informe uma data existente no calendário.');
  const duration = appointment.durationMinutes ?? 60;
  assert(typeof duration === 'number' && Number.isFinite(duration) && duration > 0,
    'A duração do agendamento deve ser maior que zero.');
  return { start, end: start + duration * 60_000 };
}

/** RN04: intervalos semiabertos; terminar às 10h libera o atendimento das 10h. */
export function assertNoOverlap(input, appointments = input?.appointments ?? [], excludeId = input?.excludeId) {
  assert(input?.mechanicId !== undefined && input.mechanicId !== null,
    'Selecione um mecânico para o agendamento.');
  assert(Array.isArray(appointments), 'Os agendamentos devem ser uma lista.');
  const interval = appointmentInterval(input);
  for (const existing of appointments) {
    if (excludeId !== undefined && excludeId !== null && String(existing.id) === String(excludeId)) continue;
    if (['cancelada', 'cancelado'].includes(existing.status)) continue;
    if (String(existing.mechanicId) !== String(input.mechanicId)) continue;
    const other = appointmentInterval(existing);
    assert(!(interval.start < other.end && other.start < interval.end),
      'O mecânico já possui atendimento neste horário. Escolha outro horário ou profissional.', 409);
  }
  return true;
}
