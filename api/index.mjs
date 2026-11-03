import { waitUntil as vercelWaitUntil } from '@vercel/functions';
const ROUTE_PARAMETER = '__oscar_path';
const unavailable = 'API indisponível. Revise as variáveis de ambiente e a configuração do banco no servidor.';
class ConfigurationError extends Error {}
class RouteError extends Error {}

/** Validate server-only configuration before loading either the API or the database driver. */
export function cloudConfiguration(env = process.env) {
  let origin, database;
  try { origin = new URL(env.APP_ORIGIN || ''); database = new URL(env.DATABASE_URL || ''); }
  catch { throw new ConfigurationError('Configuração de servidor incompleta.'); }
  const placeholder = /SUBSTITUA|YOUR[_-]?PASSWORD|PROJECT[_-]REF|SEU[_-]PROJETO|[<>\[\]]/i;
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || placeholder.test(origin.hostname)) throw new ConfigurationError('APP_ORIGIN inválida.');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.username || !database.password || placeholder.test(env.DATABASE_URL)) throw new ConfigurationError('DATABASE_URL inválida.');
  if (['disable', 'allow', 'prefer', 'no-verify'].includes(database.searchParams.get('sslmode'))) throw new ConfigurationError('A conexão deve verificar TLS.');
  if (typeof env.CRON_SECRET !== 'string' || env.CRON_SECRET.length < 32 || /SUBSTITUA|GERAR[_-]/i.test(env.CRON_SECRET)) throw new ConfigurationError('CRON_SECRET ausente ou fraco.');
  return { origin: origin.origin, host: origin.hostname, hostWithPort: origin.host, connectionString: env.DATABASE_URL, sslCa: env.DATABASE_SSL_CA || undefined };
}
function safeSegments(path) {
  if (typeof path !== 'string' || path.length > 2048 || path.includes('\\')) throw new RouteError('Rota inválida.');
  if (!path) return '';
  return path.split('/').map(segment => {
    let decoded;try { decoded = decodeURIComponent(segment); } catch { throw new RouteError('Rota inválida.'); }
    if (!decoded || !/^[A-Za-z0-9_-]+$/.test(decoded)) throw new RouteError('Rota inválida.');
    return encodeURIComponent(decoded);
  }).join('/');
}
/** Vercel may keep the original URL or expose the rewrite's destination query. Accept both. */
export function normalizedApiUrl(req, appOrigin) {
  const raw = String(req.url || '');
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.length > 16384 || raw.split('?')[0].includes('\\')) throw new RouteError('Rota inválida.');
  for (const segment of raw.split('?')[0].split('/')) {
    let decoded;try { decoded = decodeURIComponent(segment); } catch { throw new RouteError('Rota inválida.'); }
    if (decoded === '.' || decoded === '..' || decoded.includes('\\') || decoded.includes('\0')) throw new RouteError('Rota inválida.');
  }
  const url = new URL(raw, appOrigin);
  const isEntry = ['/api/index', '/api/index.mjs'].includes(url.pathname);
  let path;
  if (isEntry) {
    const values = url.searchParams.getAll(ROUTE_PARAMETER);
    const helperValue = req.query?.[ROUTE_PARAMETER];
    if (values.length > 1 || Array.isArray(helperValue)) throw new RouteError('Rota ambígua.');
    if (values.length && helperValue !== undefined && values[0] !== String(helperValue)) throw new RouteError('Rota ambígua.');
    path = values[0] ?? (helperValue === undefined ? 'index' : String(helperValue));
  } else if (url.pathname === '/api' || url.pathname === '/api/') path = '';
  else if (url.pathname.startsWith('/api/')) path = url.pathname.slice(5).replace(/\/$/, '');
  else throw new RouteError('Endpoint não encontrado.');
  url.searchParams.delete(ROUTE_PARAMETER);
  // Preserve the original search/filter parameters when Vercel's helper carries them separately.
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === ROUTE_PARAMETER || url.searchParams.has(key) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  const query = url.searchParams.toString();
  return '/api/' + safeSegments(path) + (query ? '?' + query : '');
}
function reply(res, status, message) {
  if (res.headersSent) { if (!res.writableEnded) res.end(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  res.end(JSON.stringify({ message }));
}
/** One warm-instance pool, no listener, no SQLite fallback, no filesystem or background interval. */
export function createVercelHandler({ env = process.env, loadApi = () => import('../server/server.mjs'), loadStore = () => import('../server/postgres-store.mjs'), log = console.error, waitUntil = vercelWaitUntil } = {}) {
  let application;
  async function initialize(configuration) {
    if (!application) application = (async () => {
      const [{ createApi }, { createPostgresStore }] = await Promise.all([loadApi(), loadStore()]);
      const store = await createPostgresStore({ connectionString: configuration.connectionString, sslCa: configuration.sslCa, max: 1 });
      try {
        return createApi({ store, seed: false, runMaintenance: false, secureCookies: true, allowedHosts: [configuration.host], allowedOrigins: [configuration.origin], appOrigin: configuration.origin, trustProxy: 'vercel', cronSecret: env.CRON_SECRET, waitUntil });
      } catch (error) { await store.close?.(); throw error; }
    })().catch(error => { application = undefined; throw error; });
    return application;
  }
  return async function handler(req, res) {
    try {
      const configuration = cloudConfiguration(env);
      const host = typeof req.headers?.host === 'string' ? req.headers.host.toLowerCase() : '';
      if (host !== configuration.hostWithPort.toLowerCase()) return reply(res, 403, 'Host não autorizado.');
      const origin = req.headers?.origin;
      if (origin && origin !== configuration.origin) return reply(res, 403, 'Origem não autorizada.');
      req.url = normalizedApiUrl(req, configuration.origin);
      const api = await initialize(configuration);
      return await api.handler(req, res);
    } catch (error) {
      if (error instanceof RouteError) return reply(res, 400, 'Rota inválida.');
      // Database error text can contain credentials or personal data. Log a fixed code only.
      log('OSCAR_CLOUD_UNAVAILABLE');
      return reply(res, 503, unavailable);
    }
  };
}
export default createVercelHandler();