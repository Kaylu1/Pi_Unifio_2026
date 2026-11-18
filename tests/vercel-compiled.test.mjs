import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createPgFixture } from './helpers/postgres-fixture.mjs';

test('função compilada inicia sem depender dos fontes TypeScript e usa PostgreSQL', { timeout: 60000 }, async t => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const artifactParent = resolve(projectRoot, 'data', 'test-runs');
  await mkdir(artifactParent, { recursive: true });
  const artifactDirectory = await mkdtemp(join(artifactParent, 'vercel-compiled-'));
  let fixture, server, runtimeStore, moduleGuard;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
    }
    moduleGuard?.deregister();
    await runtimeStore?.close();
    await fixture?.close();
    // O diretório removido é exclusivamente aquele criado por este teste.
    assert.equal(dirname(artifactDirectory), artifactParent);
    assert.ok(basename(artifactDirectory).startsWith('vercel-compiled-'));
    await rm(artifactDirectory, { recursive: true, force: true });
  });

  const configPath = resolve(projectRoot, 'api', 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configFile.error, undefined);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath), {
    rootDir: projectRoot,
    outDir: artifactDirectory,
  });
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  const format = items => ts.formatDiagnostics(items, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => '\n',
  });
  assert.equal(diagnostics.length, 0, format(diagnostics));
  const emitted = program.emit();
  assert.equal(emitted.emitSkipped, false, format(emitted.diagnostics));

  fixture = await createPgFixture();
  const sourceDirectories = ['server/', 'api/'].map(path => new URL('../' + path, import.meta.url).href);
  const emittedDirectoryUrl = pathToFileURL(artifactDirectory + '/').href;
  moduleGuard = registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolution = nextResolve(specifier, context);
      assert.ok(!sourceDirectories.some(directory => resolution.url.startsWith(directory)),
        'O JavaScript compilado tentou carregar um módulo da árvore original de fontes.');
      if (resolution.url.startsWith(emittedDirectoryUrl)) {
        assert.ok(!/\.[cm]?tsx?(?:[?#]|$)/i.test(resolution.url),
          'A função compilada depende de suporte de execução para TypeScript.');
      }
      return resolution;
    },
  });

  const { createVercelHandler } = await import(pathToFileURL(join(artifactDirectory, 'api', 'index.js')).href);
  const env = {
    APP_ORIGIN: 'https://oscar.example.test',
    DATABASE_URL: 'postgresql://fixture:offline-only@database.invalid:6543/postgres',
    CRON_SECRET: 'compiled-function-offline-maintenance-secret',
  };
  const logs = [];
  const handler = createVercelHandler({
    env,
    // loadApi permanece o padrão: importa o servidor efetivamente emitido em JavaScript.
    loadStore: async () => {
      const { createPostgresStore } = await import(pathToFileURL(join(artifactDirectory, 'server', 'postgres-store.js')).href);
      return {
        createPostgresStore: async options => {
          runtimeStore = await createPostgresStore({ ...options, pool: fixture.pool });
          return runtimeStore;
        },
      };
    },
    log: (...values) => logs.push(values),
    waitUntil: promise => void promise.catch(() => undefined),
  });
  server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function request(path) {
    return new Promise((resolveResponse, reject) => {
      const req = http.get({ host: '127.0.0.1', port: server.address().port, path,
        headers: { host: 'oscar.example.test' } }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolveResponse({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (error) { reject(error); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error('A função compilada não respondeu.')));
    });
  }

  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { status: 'ok', mode: 'cloud', database: 'postgres' });
  assert.equal((await request('/api/clients')).status, 401);
  assert.deepEqual(logs, []);
});
