import http from 'node:http';
import https from 'node:https';
import { STATUS_CODES } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const ref = (name, type = 'number') => ({ variable: name, type });

function cpf(seed) {
  let value = String(seed).slice(-9).padStart(9, '0');
  for (let length = 9; length <= 10; length++) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const digit = sum * 10 % 11;
    value += digit === 10 ? '0' : String(digit);
  }
  return value;
}

function cnpj(seed) {
  let value = '468' + String(seed).slice(-9).padStart(9, '0');
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const remainder = [...value].reduce((total, digit, index) => total + Number(digit) * weights[index], 0) % 11;
    value += remainder < 2 ? '0' : String(11 - remainder);
  }
  return value;
}

function futureDate() {
  const date = new Date(Date.now() + 7 * 86400000);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function plate(seed) {
  const value = Number(seed);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return 'Q' + letters[value % 26] + letters[Math.floor(value / 26) % 26]
    + String(Math.floor(value / 676) % 10) + letters[Math.floor(value / 6760) % 26]
    + String(value % 100).padStart(2, '0');
}

function bodyTemplate(value) {
  if (value && typeof value === 'object' && 'variable' in value) return value.type === 'number' ? '{{' + value.variable + '}}' : JSON.stringify('{{' + value.variable + '}}');
  if (Array.isArray(value)) return '[' + value.map(bodyTemplate).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ':' + bodyTemplate(item)).join(',') + '}';
  return JSON.stringify(value);
}

function getPath(value, path) {
  return path.split('.').reduce((current, field) => current?.[field], value);
}

function localRequest(url, { method, body, authorization }) {
  return new Promise((resolveRequest, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method,
      // Exceção restrita ao certificado de desenvolvimento do endereço loopback.
      ...(url.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
      headers: {
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      timeout: 20000,
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = { response: text }; }
        resolveRequest({ code: response.statusCode, headers: response.headers, json, text });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('A API local não respondeu em 20 segundos.')));
    if (data) request.write(data);
    request.end();
  });
}

/** Captura somente em uma API já iniciada com a fixture MySQL oscar_test. */
export async function capturePostmanEvidence({
  baseUrl, fixtureName, outputDir = resolve(projectRoot, 'postman'),
  managerEmail = 'gerente@oscar.local', mechanicEmail = 'mecanico@oscar.local',
  testPassword = 'Oscar@2026!',
} = {}) {
  const base = new URL(baseUrl);
  assert(loopback.has(base.hostname), 'As evidências só podem ser capturadas em localhost.');
  assert(['http:', 'https:'].includes(base.protocol), 'Use HTTP ou HTTPS local.');
  assert.equal(fixtureName, 'oscar_test', 'Execute apenas na fixture MySQL oscar_test.');
  baseUrl = base.href.replace(/\/$/, '');
  const runId = String(Date.now()).slice(-9);
  const variables = {
    baseUrl, managerEmail, mechanicEmail, testPassword, wrongPassword: 'SenhaErrada2026!',
    runId, cpf: cpf(runId), cnpj: cnpj(runId), date: futureDate(), today: new Date().toISOString().slice(0, 10),
    plate: plate(runId), chassis: '9BWZZZ377VT' + runId.slice(-6),
    clientId: '0', vehicleId: '0', userId: '0', serviceId: '0', supplierId: '0', partId: '0',
    movementId: '0', appointmentId: '0', draftOrderId: '0', orderId: '0', budgetId: '0',
    requestId: '0', ticketId: '0', initialItemId: '0', partItemId: '0', budgetItemId: '0',
  };
  const groups = new Map();
  const checks = [];
  const basic = (email, password) => 'Basic ' + Buffer.from(email + ':' + password).toString('base64');
  const substitute = value => String(value).replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    assert(Object.hasOwn(variables, key), 'Variável não definida: ' + key);
    return variables[key];
  });
  const resolveBody = value => {
    if (value && typeof value === 'object' && 'variable' in value) return value.type === 'number' ? Number(variables[value.variable]) : variables[value.variable];
    if (Array.isArray(value)) return value.map(resolveBody);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveBody(item)]));
    return typeof value === 'string' ? substitute(value) : value;
  };
  async function step(group, name, method, endpoint, body, { expected = 200, auth = 'manager', set = {} } = {}) {
    if (body === undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) body = {};
    const authorization = auth === 'none' ? null : auth === 'invalid' ? basic(managerEmail, variables.wrongPassword) : basic(auth === 'mechanic' ? mechanicEmail : managerEmail, testPassword);
    const started = performance.now();
    const response = await localRequest(new URL(baseUrl + substitute(endpoint)), { method, body: body === undefined ? undefined : resolveBody(body), authorization });
    assert.equal(response.code, expected, name + ': HTTP ' + response.code + ' — ' + response.text);
    for (const [key, path] of Object.entries(set)) {
      const value = getPath(response.json, path);
      assert(value !== undefined && value !== null, name + ': a resposta não contém ' + path);
      variables[key] = String(value);
    }
    const request = {
      method,
      header: [{ key: 'Accept', value: 'application/json' }, ...(body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }])],
      url: '{{baseUrl}}' + endpoint,
      description: name + '. Executada na fixture MySQL local; o exemplo foi capturado da API.',
      ...(body === undefined ? {} : { body: { mode: 'raw', raw: bodyTemplate(body), options: { raw: { language: 'json' } } } }),
      ...(auth === 'manager' ? {} : { auth: auth === 'none' ? { type: 'noauth' } : { type: 'basic', basic: [
        { key: 'username', value: auth === 'mechanic' ? '{{mechanicEmail}}' : '{{managerEmail}}', type: 'string' },
        { key: 'password', value: auth === 'invalid' ? '{{wrongPassword}}' : '{{testPassword}}', type: 'string' },
      ] } }),
    };
    const testScript = [
      'pm.test("HTTP ' + expected + '", function () { pm.response.to.have.status(' + expected + '); });',
      ...Object.entries(set).map(([key, path]) => 'pm.collectionVariables.set(' + JSON.stringify(key) + ', pm.response.json().' + path.split('.').map(part => /^\d+$/.test(part) ? '[' + part + ']' : part).join('.').replace(/\.\[/g, '[') + ');'),
    ];
    const item = {
      name, request,
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: testScript } }],
      response: [{
        name: 'HTTP ' + response.code + ' — resposta real', originalRequest: request,
        status: STATUS_CODES[response.code] || String(response.code), code: response.code,
        _postman_previewlanguage: 'json',
        header: Object.entries(response.headers).filter(([key]) => ['content-type', 'www-authenticate'].includes(key)).map(([key, value]) => ({ key, value: String(value) })),
        cookie: [], body: response.json === null ? '' : JSON.stringify(response.json, null, 2),
        responseTime: Math.round(performance.now() - started),
      }],
    };
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
    checks.push({ name, method, endpoint: substitute(endpoint), expected, actual: response.code });
    return response.json;
  }
  const s = step;
  const security = '01 — Acesso e códigos HTTP';
  const health = await s(security, 'Servidor e banco local', 'GET', '/health', undefined, { auth: 'none' });
  assert.equal(health.database, 'mysql', 'A coleção acadêmica exige a fixture MySQL real.');
  await s(security, 'Sem credenciais retorna 401', 'GET', '/clients', undefined, { auth: 'none', expected: 401 });
  await s(security, 'Senha de teste incorreta retorna 401', 'GET', '/clients', undefined, { auth: 'invalid', expected: 401 });
  await s(security, 'Mecânico não cadastra serviços — 403', 'POST', '/services', { name: 'Operação proibida' }, { auth: 'mechanic', expected: 403 });
  await s(security, 'Gerente autenticado consulta os cadastros', 'GET', '/bootstrap');
  await s(security, 'Cadastro inválido retorna 400', 'POST', '/services', { name: '', price: -5, durationMinutes: 0 }, { expected: 400 });
  await s(security, 'Registro inexistente retorna 404', 'GET', '/clients/999999999', undefined, { expected: 404 });

  const records = '02 — Cadastros da oficina';
  const client = { name: 'Cliente da apresentação {{runId}}', cpf: '{{cpf}}', phone: '14999990000', email: 'apresentacao.{{runId}}@exemplo.local' };
  await s(records, 'Cadastrar cliente', 'POST', '/clients', client, { expected: 201, set: { clientId: 'id' } });
  await s(records, 'Listar clientes', 'GET', '/clients');
  await s(records, 'Consultar cliente por ID', 'GET', '/clients/{{clientId}}');
  await s(records, 'Atualizar telefone do cliente', 'PUT', '/clients/{{clientId}}', { ...client, phone: '14999990001' });
  await s(records, 'CPF repetido retorna 409', 'POST', '/clients', { ...client, email: 'repetido.{{runId}}@exemplo.local' }, { expected: 409 });
  const vehicle = { clientId: ref('clientId'), plate: '{{plate}}', chassis: '{{chassis}}', brand: 'Volkswagen', model: 'Polo', year: 2021, mileage: 42000 };
  await s(records, 'Cadastrar veículo do cliente', 'POST', '/vehicles', vehicle, { expected: 201, set: { vehicleId: 'id' } });
  await s(records, 'Listar veículos', 'GET', '/vehicles');
  await s(records, 'Consultar veículo por ID', 'GET', '/vehicles/{{vehicleId}}');
  await s(records, 'Atualizar quilometragem', 'PUT', '/vehicles/{{vehicleId}}', { ...vehicle, mileage: 42100 });
  const user = { name: 'Mecânico da apresentação {{runId}}', email: 'mecanico.{{runId}}@exemplo.local', role: 'mecanico', password: '{{testPassword}}' };
  await s(records, 'Cadastrar mecânico', 'POST', '/users', user, { expected: 201, set: { userId: 'id' } });
  await s(records, 'Listar equipe', 'GET', '/users');
  await s(records, 'Consultar mecânico por ID', 'GET', '/users/{{userId}}');
  await s(records, 'Atualizar nome do mecânico', 'PUT', '/users/{{userId}}', { name: 'Mecânico de inspeção {{runId}}', email: user.email, role: 'mecanico' });
  const service = { name: 'Inspeção da apresentação {{runId}}', description: 'Conferência dos itens de segurança do veículo.', purpose: 'execucao', price: 120, durationMinutes: 30, inspectionItems: ['Freios e iluminação'] };
  await s(records, 'Cadastrar serviço', 'POST', '/services', service, { expected: 201, set: { serviceId: 'id' } });
  await s(records, 'Listar serviços', 'GET', '/services');
  await s(records, 'Consultar serviço por ID', 'GET', '/services/{{serviceId}}');
  await s(records, 'Atualizar valor do serviço', 'PUT', '/services/{{serviceId}}', { ...service, price: 130 });
  const supplier = { name: 'Fornecedor da apresentação {{runId}}', cnpj: '{{cnpj}}', contact: 'compras@exemplo.local', leadDays: 3 };
  await s(records, 'Cadastrar fornecedor', 'POST', '/suppliers', supplier, { expected: 201, set: { supplierId: 'id' } });
  await s(records, 'Listar fornecedores', 'GET', '/suppliers');
  await s(records, 'Consultar fornecedor por ID', 'GET', '/suppliers/{{supplierId}}');
  await s(records, 'Atualizar prazo do fornecedor', 'PUT', '/suppliers/{{supplierId}}', { ...supplier, leadDays: 4 });
  const part = { code: 'APRES-{{runId}}', description: 'Filtro de demonstração', unit: 'UN', cost: 10, price: 20, supplierId: ref('supplierId'), manualMinimum: 5 };
  await s(records, 'Cadastrar peça com fornecedor', 'POST', '/parts', part, { expected: 201, set: { partId: 'id' } });
  await s(records, 'Listar peças', 'GET', '/parts');
  await s(records, 'Consultar peça por ID', 'GET', '/parts/{{partId}}');
  await s(records, 'Atualizar preço da peça', 'PUT', '/parts/{{partId}}', { ...part, price: 22 });

  const stock = '03 — Movimentação e consultas';
  const entry = { partId: ref('partId'), supplierId: ref('supplierId'), quantity: 10, date: '{{today}}', notes: 'Entrada para demonstrar o CRUD.' };
  await s(stock, 'Registrar entrada de estoque', 'POST', '/stock/entries', entry, { expected: 201, set: { movementId: 'id' } });
  await s(stock, 'Listar movimentações', 'GET', '/movements');
  await s(stock, 'Consultar movimentação por ID', 'GET', '/movements/{{movementId}}');
  await s(stock, 'Corrigir quantidade da entrada', 'PUT', '/movements/{{movementId}}', { quantity: 12, date: '{{today}}', notes: 'Quantidade conferida no recebimento.', supplierId: ref('supplierId') });
  await s(stock, 'Excluir entrada sem consumo e devolver saldo', 'DELETE', '/movements/{{movementId}}', undefined, { expected: 204 });
  await s(stock, 'Consulta personalizada — peças abaixo do mínimo', 'GET', '/queries/parts/low-stock');
  await s(stock, 'Abastecer duas unidades para a O.S.', 'POST', '/stock/entries', { ...entry, quantity: 2 }, { expected: 201 });

  const agenda = '04 — Agenda e conflito de horário';
  const appointment = { clientId: ref('clientId'), vehicleId: ref('vehicleId'), mechanicId: ref('userId'), serviceIds: [ref('serviceId')], date: '{{date}}', time: '15:00' };
  await s(agenda, 'Cadastrar agendamento', 'POST', '/appointments', appointment, { expected: 201, set: { appointmentId: 'id' } });
  await s(agenda, 'Listar agendamentos', 'GET', '/appointments');
  await s(agenda, 'Consultar agendamento por ID', 'GET', '/appointments/{{appointmentId}}');
  await s(agenda, 'Consulta personalizada — agenda do mecânico por data', 'GET', '/queries/appointments?date={{date}}&mechanicId={{userId}}');
  await s(agenda, 'Horário ocupado retorna 409', 'POST', '/appointments', appointment, { expected: 409 });
  await s(agenda, 'Remarcar atendimento com motivo', 'PUT', '/appointments/{{appointmentId}}', { ...appointment, time: '16:00', reason: 'Horário combinado na demonstração.' });
  await s(agenda, 'Cancelar agendamento preservando histórico', 'DELETE', '/appointments/{{appointmentId}}', { reason: 'Cancelamento de demonstração.' });

  const orders = '05 — Ordens e orçamentos';
  const order = { clientId: ref('clientId'), vehicleId: ref('vehicleId'), mechanicId: ref('userId'), serviceIds: [ref('serviceId')], approvalMethod: 'presencial', approvalNotes: 'Cliente autorizou o serviço inicial.' };
  await s(orders, 'Abrir O.S. em rascunho', 'POST', '/orders', order, { expected: 201, set: { draftOrderId: 'id' } });
  await s(orders, 'Listar ordens de serviço', 'GET', '/orders');
  await s(orders, 'Consultar O.S. por ID', 'GET', '/orders/{{draftOrderId}}');
  await s(orders, 'Atualizar relato da O.S. aberta', 'PUT', '/orders/{{draftOrderId}}', { assessmentNotes: 'Cliente relata ruído ao frear.', mechanicId: ref('userId') });
  await s(orders, 'Cancelar O.S. sem execução', 'DELETE', '/orders/{{draftOrderId}}', { reason: 'Rascunho usado para demonstrar exclusão.' });
  await s(orders, 'Abrir atendimento para execução', 'POST', '/orders', order, { expected: 201, set: { orderId: 'id', initialItemId: 'items.0.id' } });
  await s(orders, 'Acrescentar peça aprovada pelo cliente', 'POST', '/orders/{{orderId}}/items', { partId: ref('partId'), quantity: 3, approvalMethod: 'presencial', approvalNotes: 'Troca autorizada pelo cliente.' }, { set: { partItemId: 'items.1.id' } });
  await s(orders, 'Iniciar inspeção', 'POST', '/orders/{{orderId}}/status', { status: 'inspecao' });
  const budget = { orderId: ref('orderId'), items: [{ serviceId: ref('serviceId'), quantity: 1, justification: 'Necessidade complementar identificada na inspeção.' }], validityHours: 24 };
  await s(orders, 'Criar orçamento complementar', 'POST', '/budgets', budget, { expected: 201, set: { budgetId: 'id' } });
  await s(orders, 'Listar orçamentos', 'GET', '/budgets');
  await s(orders, 'Consultar orçamento por ID', 'GET', '/budgets/{{budgetId}}');
  await s(orders, 'Atualizar orçamento em rascunho', 'PUT', '/budgets/{{budgetId}}', { items: [{ serviceId: ref('serviceId'), quantity: 1, price: 140, justification: 'Valor revisado antes da publicação.' }] });
  await s(orders, 'Excluir orçamento ainda não publicado', 'DELETE', '/budgets/{{budgetId}}', undefined, { expected: 204 });
  await s(orders, 'Criar proposta para aprovação', 'POST', '/budgets', budget, { expected: 201, set: { budgetId: 'id', budgetItemId: 'items.0.id' } });
  await s(orders, 'Publicar proposta ao cliente', 'POST', '/budgets/{{budgetId}}/publish', {});
  await s(orders, 'Bloquear execução enquanto há item pendente — 409', 'POST', '/orders/{{orderId}}/status', { status: 'execucao' }, { expected: 409 });
  await s(orders, 'Registrar aprovação formal do orçamento', 'POST', '/budgets/{{budgetId}}/decisions', { decisions: [{ itemId: ref('budgetItemId', 'string'), decision: 'aprovado' }], origin: 'presencial', notes: 'Cliente aprovou a proposta na oficina.' });
  await s(orders, 'Bloquear saída maior que o saldo — 409', 'POST', '/orders/{{orderId}}/execute', { itemId: ref('partItemId', 'string') }, { expected: 409 });
  await s(orders, 'Completar estoque antes da aplicação', 'POST', '/stock/entries', { ...entry, quantity: 2 }, { expected: 201 });
  await s(orders, 'Executar serviço inicial', 'POST', '/orders/{{orderId}}/execute', { itemId: ref('initialItemId', 'string') });
  await s(orders, 'Aplicar peça e baixar três unidades', 'POST', '/orders/{{orderId}}/execute', { itemId: ref('partItemId', 'string') });
  await s(orders, 'Executar serviço complementar aprovado', 'POST', '/orders/{{orderId}}/execute', { itemId: ref('budgetItemId', 'string') });
  await s(orders, 'Concluir ordem com todos os itens executados', 'POST', '/orders/{{orderId}}/status', { status: 'concluida' });
  await s(orders, 'Encerrar atendimento e iniciar garantia', 'POST', '/orders/{{orderId}}/status', { status: 'encerrada' });
  await s(orders, 'Consultar relatório de serviços e consumo', 'GET', '/reports?from=2000-01-01&to=2999-12-31');

  const requests = '06 — Solicitações e pós-venda';
  await s(requests, 'Cadastrar solicitação de atendimento', 'POST', '/service-requests', { serviceIds: [ref('serviceId')], name: 'Contato da apresentação', phone: '14999990000', vehicle: 'Volkswagen Polo', plate: '', symptoms: 'Ruído ao acionar o freio durante a condução.', preferredDate: '{{date}}', preferredPeriod: 'tarde' }, { expected: 201, set: { requestId: 'id' } });
  await s(requests, 'Listar solicitações', 'GET', '/service-requests');
  await s(requests, 'Consultar solicitação por ID', 'GET', '/service-requests/{{requestId}}');
  await s(requests, 'Marcar solicitação em contato', 'PUT', '/service-requests/{{requestId}}', { status: 'em_contato', notes: 'Cliente contatado pela equipe.' });
  await s(requests, 'Cancelar solicitação', 'DELETE', '/service-requests/{{requestId}}', { reason: 'Cliente desistiu do atendimento de demonstração.' });
  await s(requests, 'Abrir chamado de pós-venda', 'POST', '/tickets', { orderId: ref('orderId'), description: 'Solicitação de conferência após a entrega.' }, { expected: 201, set: { ticketId: 'id' } });
  await s(requests, 'Listar chamados', 'GET', '/tickets');
  await s(requests, 'Consultar chamado por ID', 'GET', '/tickets/{{ticketId}}');
  await s(requests, 'Atualizar anotação do chamado', 'PUT', '/tickets/{{ticketId}}', { status: 'aberto', notes: 'Conferência combinada com o cliente.' });
  await s(requests, 'Excluir chamado ainda sem decisão', 'DELETE', '/tickets/{{ticketId}}', undefined, { expected: 204 });

  const cleanup = '07 — Exclusão lógica dos cadastros';
  await s(cleanup, 'Inativar peça preservando movimentações', 'DELETE', '/parts/{{partId}}');
  await s(cleanup, 'Inativar fornecedor', 'DELETE', '/suppliers/{{supplierId}}');
  await s(cleanup, 'Inativar serviço', 'DELETE', '/services/{{serviceId}}');
  await s(cleanup, 'Inativar veículo', 'DELETE', '/vehicles/{{vehicleId}}');
  await s(cleanup, 'Inativar usuário da equipe', 'DELETE', '/users/{{userId}}');
  await s(cleanup, 'Excluir dados pessoais do cliente', 'DELETE', '/clients/{{clientId}}', { confirmation: 'ANONIMIZAR' });

  const collection = {
    info: {
      name: 'OScar — API local da oficina',
      description: 'Coleção da atividade de backend. Node.js e TypeScript substituem Spring/JPA por autorização informada pelo grupo. Executar em ordem apenas na fixture MySQL oscar_test. Exemplos capturados da API em ' + new Date().toISOString() + '. Pessoas e senhas são fictícias.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'basic', basic: [
      { key: 'username', value: '{{managerEmail}}', type: 'string' },
      { key: 'password', value: '{{testPassword}}', type: 'string' },
    ] },
    variable: Object.entries(variables).map(([key, value]) => ({ key, value: String(value), type: 'string' })),
    event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
      'if (pm.info.requestName === "Servidor e banco local") {',
      '  const run = String(Date.now()).slice(-9);',
      '  pm.collectionVariables.set("runId", run);',
      '  pm.collectionVariables.set("cpf", (' + cpf.toString() + ')(run));',
      '  pm.collectionVariables.set("cnpj", (' + cnpj.toString() + ')(run));',
      '  pm.collectionVariables.set("date", (' + futureDate.toString() + ')());',
      '  pm.collectionVariables.set("today", new Date().toISOString().slice(0, 10));',
      '  pm.collectionVariables.set("plate", (' + plate.toString() + ')(run));',
      '  pm.collectionVariables.set("chassis", "9BWZZZ377VT" + run.slice(-6));',
      '}',
    ] } }],
    item: [...groups].map(([name, item]) => ({ name, item })),
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'projeto-integrador.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
  await writeFile(resolve(outputDir, 'evidencias.json'), JSON.stringify({ capturedAt: new Date().toISOString(), fixtureName, database: 'mysql', baseUrl, passed: true, requests: checks.length, checks }, null, 2) + '\n');
  console.log('Coleção Postman: ' + checks.length + ' respostas reais capturadas na fixture ' + fixtureName + '.');
  return { collection, checks };
}

export async function verifyPostmanCollection(collection, outputDir = resolve(projectRoot, 'postman')) {
  const imported = await import('newman');
  const newman = imported.default ?? imported;
  const summary = await new Promise((resolveRun, reject) => {
    newman.run({ collection, reporters: 'cli', timeoutRequest: 20000 }, (error, result) => error ? reject(error) : resolveRun(result));
  });
  const failures = summary.run.failures.map(failure => ({
    request: failure.source?.name ?? '',
    message: failure.error?.message ?? String(failure.error),
  }));
  await writeFile(resolve(outputDir, 'newman-result.json'), JSON.stringify({
    executedAt: new Date().toISOString(), runtime: 'Newman (Postman Collection SDK)',
    passed: failures.length === 0, stats: summary.run.stats, failures,
  }, null, 2) + '\n');
  assert.equal(failures.length, 0, 'A reprodução da coleção pelo Newman encontrou falhas.');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const baseUrl = argument('--base-url');
  if (baseUrl) {
    await capturePostmanEvidence({ baseUrl, fixtureName: argument('--fixture') });
  } else {
    const { createAcademicFixture } = await import('./academic-fixture.mjs');
    const fixture = await createAcademicFixture({ port: 4302 });
    try {
      const captured = await capturePostmanEvidence({ baseUrl: fixture.baseUrl, fixtureName: 'oscar_test' });
      if (process.argv.includes('--verify-postman')) await verifyPostmanCollection(captured.collection);
    }
    finally { await fixture.close(); }
  }
}
