import { assert } from './domain.mjs';
import { STAFF, allow, dateValue, listResult, round, text } from './common.mjs';
import { servicesFrom } from './entities.mjs';
import { anonymizeServiceRequest, purgeServiceRequestBackups } from './privacy.mjs';

function phoneValue(value) {
 const phone = text(value, 'um telefone para contato', 30);
 const digits = phone.replace(/\D/g, '');
 assert(digits.length >= 10 && digits.length <= 15, 'Informe um telefone com DDD válido.');
 return phone;
}

function plateValue(value) {
 const plate = text(value ?? '', 'a placa do veículo', 12, true).toUpperCase();
 assert(!plate || /^[A-Z0-9-]{7,8}$/.test(plate), 'Informe uma placa válida ou deixe o campo em branco.');
 return plate;
}

export async function createPublicServiceRequest(s, body) {
 assert(body && typeof body === 'object' && !Array.isArray(body), 'Revise os dados da solicitação.');
 const ids = body.serviceIds;
 assert(Array.isArray(ids) && ids.every(id => Number.isSafeInteger(id) && id > 0), 'Selecione serviços válidos do catálogo.');
 const services = await servicesFrom(s, ids);
 const symptoms = text(body.symptoms ?? '', 'o que está acontecendo com o veículo', 2000, true);
 assert(!services.some(service => service.purpose === 'avaliacao') || symptoms.length >= 10,
  'Descreva o que está acontecendo com o veículo em pelo menos 10 caracteres para solicitar a avaliação.');
 const name = text(body.name, 'seu nome', 120);
 const phone = phoneValue(body.phone);
 const vehicle = text(body.vehicle, 'o veículo (marca e modelo)', 120);
 const plate = plateValue(body.plate);
 const preferredDate = body.preferredDate ? dateValue(body.preferredDate) : '';
 const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
 assert(!preferredDate || preferredDate >= today, 'Escolha hoje ou uma data futura para a preferência de atendimento.');
 const preferredPeriod = body.preferredPeriod ?? '';
 assert(['', 'manha', 'tarde'].includes(preferredPeriod), 'Escolha manhã, tarde ou deixe o período em branco.');
 const snapshot = services.map(({ id, name, price, durationMinutes, purpose }) =>
  ({ id, name, price, durationMinutes, purpose: purpose === 'avaliacao' ? 'avaliacao' : 'execucao' }));
 const totalCents = snapshot.reduce((sum, service) => sum + Math.round(Number(service.price) * 100), 0);
 assert(snapshot.every(service => Number.isFinite(service.price) && service.price >= 0
  && Number.isFinite(service.durationMinutes) && service.durationMinutes > 0),
  'Um serviço do catálogo está sem valor ou duração válida. Fale com a oficina.');
 return await s.save('service_requests', {
  name, phone, vehicle, plate, symptoms, preferredDate, preferredPeriod,
  serviceIds: snapshot.map(service => service.id), services: snapshot,
  total: round(totalCents / 100),
  durationMinutes: snapshot.reduce((sum, service) => sum + service.durationMinutes, 0),
  status: 'pendente',
 });
}

export async function serviceRequestSummary(s) {
 const open = (await s.list('service_requests'))
  .filter(request => ['pendente', 'em_contato'].includes(request.status))
  .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
 return {
  openCount: open.length,
  pendingCount: open.filter(request => request.status === 'pendente').length,
  latestPendingId: open.reduce((latest, request) => request.status === 'pendente' ? Math.max(latest, request.id) : latest, 0),
  recentOpen: open.slice(0, 3),
 };
}

export async function serviceRequestRoutes({ s, route, method, body, user, url }) {
 if (route === '/service-requests/summary' && method === 'GET') {
  allow(user, STAFF);
  return { data: await serviceRequestSummary(s) };
 }
 if (route === '/service-requests' && method === 'GET') {
  allow(user, STAFF);
  const requests = (await s.list('service_requests'))
   .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
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
 const match = /^\/service-requests\/(\d+)$/.exec(route);
 if (!match) return null;
 if (method === 'PUT') allow(user, ['gerente', 'atendente']);
 else allow(user, STAFF);
 const request = await s.get('service_requests', Number(match[1]));
 assert(request, 'Solicitação não encontrada.', 404);
 if (method === 'GET') return { data: request };
 if (method !== 'PUT') return null;
 assert(!request.anonymizedAt, 'Esta solicitação foi anonimizada e não pode ser alterada.', 409);
 const status = body.status;
 const next = { pendente: ['em_contato', 'cancelada'], em_contato: ['atendida', 'cancelada'], atendida: [], cancelada: [] };
 assert(next[request.status]?.includes(status), 'Atualize a solicitação seguindo a próxima etapa de contato.', 409);
 const saved = await s.save('service_requests', {
  ...request, status, handledBy: user.id, handledAt: new Date().toISOString(),
 });
 await s.audit(user, 'alterar', 'service_requests', saved.id, { status });
 return { data: saved };
}
