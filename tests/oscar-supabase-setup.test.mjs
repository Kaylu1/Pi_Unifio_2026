import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
 FIRST_MANAGER, initializeOscarDatabase, migrationBody, oscarConnectionString, readSavedCredentials,
 oscarVerifiedPoolOptions, oscarSupabaseChildEnv, readOscarSupabaseCa,
 readOscarMigrations
} from '../scripts/oscar-supabase.mjs';
import { assertOscarSupabaseTarget } from '../scripts/oscar-supabase-target.mjs';
import { verifyPassword } from '../server/auth-crypto.mjs';

test('builds only the dedicated project URI, including special password characters', () => {
 const connection = oscarConnectionString('Teste@2026:/?#%');
 assert.equal(assertOscarSupabaseTarget(connection).projectRef, 'kotiorssahochknggjzc');
 assert.equal(new URL(connection).password, 'Teste%402026%3A%2F%3F%23%25');
 assert.throws(() => oscarConnectionString(''));
 assert.throws(() => migrationBody('BEGIN; SELECT 1; COMMIT;'));
});

test('loads only local credentials for the dedicated OScar project', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'oscar-saved-credentials-'));
 const file = join(directory, 'local.json');
 try {
  await writeFile(file, JSON.stringify({ projectRef: 'kotiorssahochknggjzc',
   databasePassword: 'FixtureBanco2026!', managerPassword: 'FixtureGerente2026!' }));
  const saved = await readSavedCredentials(file);
  assert.equal(saved.databasePassword, 'FixtureBanco2026!');
  assert.equal(saved.managerPassword, 'FixtureGerente2026!');
  await writeFile(file, JSON.stringify({ projectRef: 'oldcontrolprojectref',
   databasePassword: 'FixtureBanco2026!', managerPassword: 'FixtureGerente2026!' }));
  await assert.rejects(readSavedCredentials(file), /não corresponde ao Supabase do OScar/);
  await writeFile(file, '{invalid');
  await assert.rejects(readSavedCredentials(file), /é inválido/);
 } finally { await unlink(file); await rmdir(directory); }
});

test('setup and local API use the pinned Supabase CA with TLS verification enabled', async () => {
 const uri = oscarConnectionString('FixtureBanco2026!');
 const ca = await readOscarSupabaseCa();
 const pool = await oscarVerifiedPoolOptions(uri);
 const env = await oscarSupabaseChildEnv(uri, { DATABASE_SSL_CA: 'old-project-ca' });
 assert.match(ca, /-----BEGIN CERTIFICATE-----/);
 assert.equal(pool.ssl.rejectUnauthorized, true);
 assert.equal(pool.ssl.ca, ca);
 assert.equal(env.DATABASE_SSL_CA, ca);
 assert.equal(env.DATABASE_URL, uri);
 await assert.rejects(oscarVerifiedPoolOptions(uri.replace('kotiorssahochknggjzc', 'oldprojectreference')));
});

test('sets up a blank catalog and the sole Roberto manager in one local PostgreSQL transaction', async () => {
 const db = new PGlite();
 try {
  await db.waitReady;
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');
  const result = await initializeOscarDatabase(db,
   { ...FIRST_MANAGER, password: 'RobertoTeste2026' }, await readOscarMigrations());
  assert.deepEqual(result, { manager: 'Roberto', email: 'roberto@oscar.local', services: 0 });
  const users = (await db.query('SELECT id,data,email,passwordhash FROM oscar_private.users')).rows;
  assert.equal(users.length, 1);
  assert.equal(users[0].data.id, Number(users[0].id));
  assert.equal(users[0].data.role, 'gerente');
  assert.equal(users[0].email, FIRST_MANAGER.email);
  assert.ok(verifyPassword('RobertoTeste2026', users[0].passwordhash));
  assert.equal((await db.query('SELECT count(*)::integer AS total FROM oscar_private.services')).rows[0].total, 0);
  assert.equal((await db.query("SELECT count(*)::integer AS total FROM pg_tables WHERE schemaname='oscar_private' AND tablename='service_requests'")).rows[0].total, 1);
  await assert.rejects(initializeOscarDatabase(db,
   { ...FIRST_MANAGER, password: 'OutroTeste2026' }, await readOscarMigrations()), /já existe/);
  assert.equal((await db.query('SELECT count(*)::integer AS total FROM oscar_private.users')).rows[0].total, 1);
 } finally { await db.close(); }
});

test('rolls back the entire schema if an additional migration fails', async () => {
 const db = new PGlite();
 try {
  await db.waitReady;
  const [base] = await readOscarMigrations();
  await assert.rejects(initializeOscarDatabase(db,
   { ...FIRST_MANAGER, password: 'RobertoTeste2026' }, [base, 'SELECT * FROM oscar_private.no_such_table;']));
  assert.equal((await db.query("SELECT count(*)::integer AS total FROM pg_namespace WHERE nspname='oscar_private'")).rows[0].total, 0);
 } finally { await db.close(); }
});

test('CLI rejects credentials passed as arguments without echoing them', () => {
 const script = new URL('../scripts/oscar-supabase.mjs', import.meta.url);
 const result = spawnSync(process.execPath,
  [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'setup', '--password=NeverEcho2026'],
  { encoding: 'utf8' });
 assert.equal(result.status, 1);
 assert.match(result.stderr, /Não passe senhas por argumento/);
 assert.ok(!result.stderr.includes('NeverEcho2026'));
});
