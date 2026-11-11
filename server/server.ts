import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { assert } from './domain.ts';
import { startEmailWorker } from './email-worker.ts';
import { validOrigin } from './http-policy.ts';
import { ApiController } from './controllers/api-controller.ts';
import { ApplicationService } from './services/application-service.ts';
import type { WorkshopRepository } from './contracts.ts';
const require = createRequire(import.meta.url);

export interface ApiOptions {
  store?: WorkshopRepository;
  filename?: string;
  seed?: boolean;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  appOrigin?: string;
  secureCookies?: boolean;
  tls?: https.ServerOptions;
  runMaintenance?: boolean;
  trustProxy?: boolean;
  cronSecret?: string;
  waitUntil?: (promise: Promise<unknown>) => void;
  emailTransport?: any;
}

export function createApi(options: ApiOptions = {}) {
  const allowedOrigins = options.allowedOrigins ?? ['https://localhost:4201', 'https://127.0.0.1:4201', 'https://localhost:4200', 'https://127.0.0.1:4200'];
  const allowedHosts = (options.allowedHosts ?? ['localhost', '127.0.0.1', '[::1]']).map(host => host.toLowerCase());
  if (!options.store) assert(!process.env.VERCEL, 'O ambiente de nuvem exige banco configurado. Nenhum banco local será criado.', 503);
  const store: WorkshopRepository = options.store ?? require('./store.ts').createStore({ filename: options.filename, seed: options.seed ?? true });
  const application = new ApplicationService(store, { origin: options.appOrigin ?? allowedOrigins[0],
    secureCookies: options.secureCookies, cronSecret: options.cronSecret ?? process.env.CRON_SECRET,
    emailTransport: options.emailTransport });
  const controller = new ApiController(application, { allowedHosts, allowedOrigins,
    trustProxy: options.trustProxy, waitUntil: options.waitUntil });
  const server = options.tls ? https.createServer(options.tls, controller.handle) : http.createServer(controller.handle);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let timer: ReturnType<typeof setInterval> | undefined;
  if (options.runMaintenance !== false) {
    const maintain = () => application.maintenance().catch(error => console.error('Rotina de manutenção indisponível:', error?.code ?? 'MAINTENANCE'));
    void maintain();
    timer = setInterval(() => void maintain(), 60000);
    timer.unref();
  }
  server.on('close', () => { if (timer) clearInterval(timer); });
  return { server, store, handler: controller.handle, maintenance: () => application.maintenance(),
    close: async () => {
      if (timer) clearInterval(timer);
      await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
      if (store.runExclusive) await store.runExclusive(() => store.close());
      else await store.close();
    } };
}

export async function startServer(options: ApiOptions = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const certificate = process.env.OSCAR_TLS_CERT;
  const key = process.env.OSCAR_TLS_KEY;
  let store = options.store;
  if (!store && process.env.OSCAR_STORAGE === 'mysql') {
    const { createMysqlStore } = await import('./repositories/mysql-repository.ts');
    const setupModulePath = '../scripts/mysql-local.mjs';
    const { getLocalMysqlConfig } = await import(setupModulePath);
    store = await createMysqlStore({ ...await getLocalMysqlConfig(), importSqlite: resolve(root, 'data/oscar.sqlite') });
  }
  if (!store && process.env.OSCAR_STORAGE === 'postgres') {
    const targetModulePath = '../scripts/oscar-supabase-target.mjs';
    const { assertOscarSupabaseTarget } = await import(targetModulePath);
    assertOscarSupabaseTarget(process.env.DATABASE_URL);
    throw new Error('Esta execução do OScar utiliza MySQL local. Inicie com npm start.');
  }
  const origin = process.env.OSCAR_ORIGIN ? validOrigin(process.env.OSCAR_ORIGIN, { localOnly: true }) : undefined;
  const api = createApi({ ...options, store, filename: process.env.OSCAR_DB ?? resolve(root, 'data/oscar.sqlite'),
    ...(origin ? { allowedOrigins: [origin], appOrigin: origin } : {}),
    tls: options.tls ?? (certificate && key ? { cert: readFileSync(certificate), key: readFileSync(key) } : undefined) });
  const port = Number(process.env.OSCAR_API_PORT ?? 4301);
  api.server.listen(port, '127.0.0.1', () => console.log('OScar API ' + api.store.dialect + ': ' + (certificate && key ? 'https' : 'http') + '://127.0.0.1:' + port + '/api/health'));
  const worker = startEmailWorker(api.store);
  const stop = () => { worker.stop(); void api.close().then(() => process.exit(0)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return api;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startServer();
