import test, { describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DomainError, assert as domainAssert, assertApproval, assertCanClose,
  maskBudget, stockPolicy, warrantyPolicy, assertTransition, assertNoOverlap,
} from './domain.mjs';

const NOW = '2026-10-21T12:00:00.000Z';
const START = '2026-09-21T12:00:00.000Z';
const expectConflict = (fn) => assert.throws(fn,
  (error) => error instanceof DomainError && error.status === 409 && Boolean(error.message));

describe('RN06 — aprovação prévia para serviço ou peça', () => {
  test('bloqueia serviço pendente e peça recusada; não altera decisão', () => {
    const pending = { kind: 'servico', decision: 'pendente' };
    const denied = { kind: 'peca', decision: 'recusado' };
    expectConflict(() => assertApproval(pending));
    expectConflict(() => assertApproval(denied));
    assert.equal(pending.decision, 'pendente');
    assert.equal(denied.decision, 'recusado');
  });

  test('bloqueia item ausente ou decisão adulterada mesmo quando truthy', () => {
    for (const decision of [undefined, null, true, 'true', 'APROVADO', 'aprovado ']) {
      expectConflict(() => assertApproval({ decision }));
    }
    expectConflict(() => assertApproval(null));
  });

  test('permite item aprovado preservando seu registro formal de decisão', () => {
    const item = Object.freeze({
      id: 1, kind: 'servico', decision: 'aprovado',
      decidedAt: '2026-10-20T14:00:00Z', decidedBy: 'cliente',
    });
    assert.equal(assertApproval(item), item);
    assert.equal(item.decidedAt, '2026-10-20T14:00:00Z');
  });
});

describe('RN10 — orçamento público minimiza dados pessoais', () => {
  test('retém só primeiro nome, três últimos da placa e seis do chassi', () => {
    const masked = maskBudget({
      client: { name: '  Caio Eduardo Sapata Bruno ', cpf: '12345678900',
        phone: '(14)99999-0000', email: 'privado@example.test', address: 'Rua Privada' },
      vehicle: { plate: 'ABC-1D23', chassis: '9BWZZZ377VT004251', clientId: 1 },
      items: [{ id: 1, kind: 'servico', description: 'Troca de óleo', quantity: 1, price: 120,
        total: 120, decision: 'pendente', privateNotes: 'não expor', client: { cpf: 'privado' } }],
      otherVehicles: [{ plate: 'DEF4567' }], history: [{ id: 45 }],
    });
    assert.deepEqual(masked, {
      clientFirstName: 'Caio',
      plateMasked: '****D23',
      chassisMasked: '***********004251',
      items: [{ id: 1, kind: 'servico', description: 'Troca de óleo', quantity: 1,
        price: 120, total: 120, decision: 'pendente' }],
    });
    const serialized = JSON.stringify(masked);
    for (const secret of ['Eduardo', '12345678900', '@example', 'Rua Privada',
      'ABC', '9BWZZZ377VT', 'privateNotes', 'otherVehicles', 'history', 'clientId']) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  });

  test('recusa exposição acidental de dados extras no orçamento ou nos itens', () => {
    const source = {
      budget: { token: 'secreto', createdBy: 'interno', items: [
        { id: 4, description: 'Pastilha', kind: 'peca', quantity: 2, price: 40,
          total: 80, decision: 'recusado', justification: 'Desgaste excessivo',
          user: { passwordHash: 'hash' }, vehicle: { plate: 'ABC1234' }, email: 'privado' },
      ] },
      client: { name: 'Ana' }, vehicle: { plate: 'fgh 2j45', chassis: 'abc123456789' },
    };
    const result = maskBudget(source);
    assert.deepEqual(Object.keys(result), ['clientFirstName', 'plateMasked', 'chassisMasked', 'items']);
    assert.equal(result.plateMasked, '****J45');
    assert.equal(result.chassisMasked, '***********456789');
    assert.equal(result.items[0].justification, 'Desgaste excessivo');
    assert.equal(Object.hasOwn(result.items[0], 'user'), false);
    assert.equal(Object.hasOwn(result, 'token'), false);
  });

  test('lida com nome único e identificação ausente sem inventar dados pessoais', () => {
    assert.deepEqual(maskBudget({ client: { name: 'Ana' }, vehicle: {} }), {
      clientFirstName: 'Ana', plateMasked: '', chassisMasked: '', items: [],
    });
    assert.equal(maskBudget().clientFirstName, '');
  });

  test('projeção não modifica objetos de origem', () => {
    const item = Object.freeze({ id: 1, decision: 'pendente', email: 'privado' });
    const result = maskBudget({ client: Object.freeze({ name: 'José da Silva' }),
      vehicle: Object.freeze({ plate: 'ABC1234' }), items: Object.freeze([item]) });
    result.items[0].decision = 'aprovado';
    assert.equal(item.decision, 'pendente');
  });
});

describe('RN11 — encerramento depende de execução dos itens aprovados', () => {
  test('um único item aprovado sem execução bloqueia toda a O.S.', () => {
    expectConflict(() => assertCanClose([
      { decision: 'aprovado', executedAt: NOW },
      { decision: 'aprovado', executedAt: null },
      { decision: 'recusado', executedAt: null },
    ]));
  });

  test('permite encerramento após todos os aprovados terem apontamento', () => {
    assert.equal(assertCanClose({ items: [
      { decision: 'aprovado', executedAt: NOW },
      { decision: 'recusado', executedAt: null },
      { decision: 'pendente', executedAt: null },
    ] }), true);
    assert.equal(assertCanClose([]), true);
  });

  test('data inválida não simula registro de execução', () => {
    assert.throws(() => assertCanClose([{ decision: 'aprovado', executedAt: 'qualquer-coisa' }]),
      (error) => error instanceof DomainError && error.status === 400);
  });
});

describe('RN13 / SD06 — reposição por consumo líquido e histórico suficiente', () => {
  const policy = (extra = {}) => stockPolicy({
    now: NOW, historyStartedAt: START, stock: 3, leadDays: 5,
    movements: [{ type: 'saida', quantity: 60, date: '2026-10-01T10:00:00Z' }],
    ...extra,
  });

  test('60 unidades em 30 dias, prazo 5 e saldo 3 sugerem comprar 7', () => {
    assert.deepEqual(policy(), { minimum: 10, suggested: 7, averageDaily: 2, hasHistory: true });
  });

  test('estornos reduzem consumo; recebimentos não contam como consumo', () => {
    assert.deepEqual(policy({ movements: [
      { type: 'saida', quantity: 60, date: '2026-10-01T10:00:00Z' },
      { type: 'estorno', quantity: 30, date: '2026-10-02T10:00:00Z' },
      { type: 'entrada', quantity: 1000, date: '2026-10-03T10:00:00Z' },
    ] }), { minimum: 5, suggested: 2, averageDaily: 1, hasHistory: true });
  });

  test('excesso de estornos não gera média nem mínimo negativos', () => {
    assert.deepEqual(policy({ movements: [
      { type: 'saida', quantity: 3, date: NOW },
      { type: 'estorno', quantity: 5, date: NOW },
    ] }), { minimum: 0, suggested: 0, averageDaily: 0, hasHistory: true });
  });

  test('janela inclui limite inicial e final e ignora passado/futuro', () => {
    const result = policy({ stock: 0, leadDays: 30, movements: [
      { type: 'saida', quantity: 2, date: START },
      { type: 'saida', quantity: 3, date: NOW },
      { type: 'saida', quantity: 100, date: '2026-09-21T11:59:59.999Z' },
      { type: 'saida', quantity: 100, date: '2026-10-21T12:00:00.001Z' },
    ] });
    assert.equal(result.minimum, 5);
  });

  test('29 dias não são histórico suficiente: usa só mínimo manual', () => {
    const result = policy({ historyStartedAt: '2026-09-22T12:00:00Z', manualMinimum: 8 });
    assert.deepEqual(result, { minimum: 8, suggested: 5, averageDaily: 0, hasHistory: false });
  });

  test('sem histórico nem mínimo manual, não inventa sugestão calculada', () => {
    assert.deepEqual(policy({ historyStartedAt: undefined }),
      { minimum: 0, suggested: 0, averageDaily: 0, hasHistory: false });
  });

  test('exatamente 30 dias habilita cálculo; um milissegundo a menos não', () => {
    assert.equal(policy().hasHistory, true);
    assert.equal(policy({ historyStartedAt: '2026-09-21T12:00:00.001Z' }).hasHistory, false);
  });

  test('mínimo manual sobrescreve valor calculado inclusive quando é zero', () => {
    assert.equal(policy({ manualMinimum: 4 }).minimum, 4);
    assert.deepEqual(policy({ manualMinimum: 0 }),
      { minimum: 0, suggested: 0, averageDaily: 2, hasHistory: true });
  });

  test('prazo padrão é usado sem fornecedor; prazo associado tem precedência', () => {
    const common = { now: NOW, part: { createdAt: START, stock: 0 },
      settings: { defaultLeadDays: 7, consumptionWindowDays: 30 },
      movements: [{ type: 'saida', quantity: 30, date: NOW }] };
    assert.equal(stockPolicy(common).minimum, 7);
    assert.equal(stockPolicy({ ...common, supplier: { leadDays: 3 } }).minimum, 3);
  });

  test('janela parametrizada exige cobertura inteira antes de calcular', () => {
    assert.equal(policy({ windowDays: 60 }).hasHistory, false);
    const result = policy({ windowDays: 60, historyStartedAt: '2026-08-22T12:00:00Z' });
    assert.equal(result.hasHistory, true);
    assert.equal(result.averageDaily, 1);
    assert.equal(result.minimum, 5);
  });

  test('janela menor mantém exigência mínima de 30 dias da SD06', () => {
    const result = policy({ windowDays: 7, historyStartedAt: '2026-10-01T12:00:00Z' });
    assert.equal(result.hasHistory, false);
  });

  test('arredonda mínimo para cima sem arredondar quantidade sugerida para baixo', () => {
    assert.equal(policy({ stock: 0, leadDays: 1, movements: [
      { type: 'saida', quantity: 31, date: NOW },
    ] }).minimum, 2);
    assert.equal(policy({ stock: 20 }).suggested, 0);
  });

  test('rejeita parâmetros negativos, não finitos e janela zero', () => {
    for (const override of [
      { stock: -1 }, { manualMinimum: -1 }, { leadDays: Infinity },
      { leadDays: -1 }, { windowDays: 0 }, { manualMinimum: NaN },
      { movements: [{ type: 'saida', quantity: -1, date: NOW }] },
      { movements: [{ type: 'saida', quantity: 1, date: 'inválida' }] },
    ]) {
      assert.throws(() => policy(override), DomainError);
    }
  });
});

describe('RN14-RN17 — garantia contada no encerramento', () => {
  const closedAt = '2026-01-01T12:00:00Z';
  const limit = '2026-04-01T12:00:00.000Z';

  test('configuração inferior a 90 dias mantém mínimo de 90 dias', () => {
    const result = warrantyPolicy({ closedAt, days: 15, now: '2026-03-31T12:00:00Z' });
    assert.equal(result.days, 90);
    assert.equal(result.expiresAt, limit);
    assert.equal(result.active, true);
  });

  test('limite é inclusivo; após um milissegundo vira reclamação sem cobertura', () => {
    assert.equal(warrantyPolicy({ closedAt, now: limit }).active, true);
    assert.equal(warrantyPolicy({ closedAt, now: '2026-04-01T12:00:00.001Z' }).covered, false);
  });

  test('permite ampliar garantia sem mudar código', () => {
    const result = warrantyPolicy({
      order: { closedAt }, settings: { warrantyDays: 120 }, now: '2026-04-15T12:00:00Z',
    });
    assert.equal(result.days, 120);
    assert.equal(result.covered, true);
  });

  test('peça do cliente não tem cobertura; mão de obra executada tem', () => {
    const result = warrantyPolicy({ order: { closedAt, items: [
      { id: 1, description: 'Peça do cliente', kind: 'peca', suppliedByClient: true, executedAt: closedAt },
      { id: 2, description: 'Instalação', kind: 'servico', suppliedByClient: true, executedAt: closedAt },
      { id: 3, description: 'Peça da oficina', kind: 'peca', executedAt: closedAt },
      { id: 4, description: 'Nunca executado', kind: 'servico' },
    ] }, now: '2026-02-01T12:00:00Z' });
    assert.deepEqual(result.items.map((item) => [item.id, item.covered]),
      [[1, false], [2, true], [3, true], [4, false]]);
    assert.equal(warrantyPolicy({ closedAt, source: 'cliente', now: limit }).covered, false);
  });

  test('não inicia cobertura antes de encerrar nem antes de data futura', () => {
    assert.equal(warrantyPolicy({ now: NOW }).active, false);
    assert.equal(warrantyPolicy({ closedAt: NOW, now: '2026-10-20T12:00:00Z' }).active, false);
  });

  test('virada de ano mantém exatamente 90 dias de duração', () => {
    const result = warrantyPolicy({ closedAt: '2025-12-15T23:30:00Z', now: '2026-01-01T00:00:00Z' });
    assert.equal(result.expiresAt, '2026-03-15T23:30:00.000Z');
  });
});

describe('Ciclo de vida da O.S. e RN07', () => {
  test('ciclo normal respeita todas as etapas até o encerramento', () => {
    const cycle = ['aberta', 'inspecao', 'aguardando_aprovacao', 'execucao', 'concluida', 'encerrada'];
    const items = [{ decision: 'aprovado', executedAt: NOW }];
    for (let index = 0; index < cycle.length - 1; index++) {
      assert.equal(assertTransition(cycle[index], cycle[index + 1], items), true);
    }
  });

  test('recusa complementar permite continuar sem cancelar itens originais', () => {
    assert.equal(assertTransition('aguardando_aprovacao', 'execucao', [
      { decision: 'aprovado', executedAt: NOW },
      { decision: 'recusado', executedAt: null },
    ]), true);
    assert.equal(assertTransition('execucao', 'aguardando_aprovacao'), true);
  });

  test('resposta pendente bloqueia retorno à execução', () => {
    expectConflict(() => assertTransition('aguardando_aprovacao', 'execucao',
      [{ decision: 'pendente' }]));
  });

  test('cancelamento é permitido somente aberta ou em inspeção', () => {
    assert.equal(assertTransition('aberta', 'cancelada'), true);
    assert.equal(assertTransition('inspecao', 'cancelada'), true);
    for (const current of ['aguardando_aprovacao', 'execucao', 'concluida', 'encerrada']) {
      expectConflict(() => assertTransition(current, 'cancelada'));
    }
  });

  test('não pula etapas, não reabre estado terminal e aplica RN11 nas duas saídas finais', () => {
    expectConflict(() => assertTransition('aberta', 'execucao'));
    expectConflict(() => assertTransition('encerrada', 'aberta'));
    expectConflict(() => assertTransition('cancelada', 'aberta'));
    for (const [from, to] of [['execucao', 'concluida'], ['concluida', 'encerrada']]) {
      expectConflict(() => assertTransition(from, to, [{ decision: 'aprovado' }]));
    }
    assert.throws(() => assertTransition('__proto__', 'aberta'), DomainError);
  });
});

describe('RN04 — agenda impede sobreposição do mesmo mecânico', () => {
  const appointment = { id: 10, mechanicId: 1, date: '2026-10-21', time: '09:00',
    durationMinutes: 60, status: 'confirmado' };
  const input = (extra = {}) => ({ mechanicId: 1, date: '2026-10-21', time: '09:30',
    durationMinutes: 60, ...extra });

  test('interseção parcial ou contenção de intervalos bloqueia agenda', () => {
    expectConflict(() => assertNoOverlap(input(), [appointment]));
    expectConflict(() => assertNoOverlap(input({ time: '08:30', durationMinutes: 120 }), [appointment]));
    expectConflict(() => assertNoOverlap(input({ time: '09:15', durationMinutes: 15 }), [appointment]));
  });

  test('horários adjacentes e mecânicos distintos são permitidos', () => {
    assert.equal(assertNoOverlap(input({ time: '10:00' }), [appointment]), true);
    assert.equal(assertNoOverlap(input({ time: '08:00' }), [appointment]), true);
    assert.equal(assertNoOverlap(input({ mechanicId: 2 }), [appointment]), true);
  });

  test('remarcação exclui o próprio registro e cancelamento libera horário', () => {
    assert.equal(assertNoOverlap({ ...input(), appointments: [appointment], excludeId: '10' }), true);
    assert.equal(assertNoOverlap(input(), [{ ...appointment, status: 'cancelado' }]), true);
  });

  test('timestamps ISO suportam atendimento que atravessa meia-noite', () => {
    const existing = { mechanicId: 'm1', start: '2026-10-21T23:45:00Z', end: '2026-10-22T00:45:00Z' };
    expectConflict(() => assertNoOverlap({
      mechanicId: 'm1', start: '2026-10-22T00:30:00Z', end: '2026-10-22T01:00:00Z',
    }, [existing]));
  });

  test('datas inexistentes, hora inválida, duração zero e intervalo invertido são rejeitados', () => {
    for (const invalid of [
      input({ date: '2026-02-30' }), input({ time: '25:00' }), input({ durationMinutes: 0 }),
      input({ durationMinutes: NaN }),
      { mechanicId: 1, start: NOW, end: '2026-10-20T12:00:00Z' },
    ]) assert.throws(() => assertNoOverlap(invalid, []), DomainError);
  });
});

test('erro de domínio preserva status HTTP e mensagem corretiva', () => {
  assert.throws(() => domainAssert(false, 'Escolha uma peça válida.', 404),
    (error) => error.status === 404 && error.message === 'Escolha uma peça válida.');
});

test('RN13 não mistura consumo de peças diferentes quando recebe histórico global', () => {
  const result = stockPolicy({
    now: NOW, part: { id: 1, stock: 0, createdAt: START },
    supplier: { leadDays: 5 }, movements: [
      { partId: '1', type: 'saida', quantity: 30, date: NOW },
      { partId: 2, type: 'saida', quantity: 900, date: NOW },
      { partId: 2, type: 'estorno', quantity: 100, date: NOW },
    ],
  });
  assert.equal(result.minimum, 5);
  assert.equal(result.averageDaily, 1);
});

test('RN15 cobertura de peça exige fornecimento pela oficina', () => {
  const policy = (source) => warrantyPolicy({
    closedAt: '2026-10-20T12:00:00Z', now: NOW, source,
  });
  assert.equal(policy('oficina').covered, true);
  assert.equal(policy('cliente').covered, false);
  assert.equal(policy('terceiro').covered, false);
});

test('RN14 preserva prazo concedido na O.S. após mudança do parâmetro padrão', () => {
  const result = warrantyPolicy({
    order: { closedAt: '2026-01-01T12:00:00Z', warrantyDays: 120 },
    settings: { warrantyDays: 90 }, now: '2026-04-15T12:00:00Z',
  });
  assert.equal(result.days, 120);
  assert.equal(result.active, true);
});
