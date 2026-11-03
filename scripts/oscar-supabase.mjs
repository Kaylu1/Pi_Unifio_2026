import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { hiddenQuestion, validateAdministrator } from './admin-sql.mjs';
import {
 assertOscarSupabaseTarget, OSCAR_SUPABASE_POOLER_HOST, OSCAR_SUPABASE_PROJECT_REF
} from './oscar-supabase-target.mjs';
import { hashPassword } from '../server/auth-crypto.mjs';
import { postgresPoolOptions } from '../server/postgres-store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const savedCredentialsPath = resolve(root, 'data/oscar-supabase.local.json');
const supabaseCaPath = resolve(root, 'server/supabase-root-2021.cer');
const SUPABASE_CA_FINGERPRINT = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
const { Pool } = pg;
export const FIRST_MANAGER = Object.freeze({ name: 'Roberto', email: 'roberto@oscar.local' });

/** The only accepted target is this OScar project. */
export function oscarConnectionString(password) {
 if (typeof password !== 'string' || !password || password.length > 1024)
  throw new Error('Informe a senha do banco OScar no terminal.');
 const url = new URL(`postgresql://postgres.${OSCAR_SUPABASE_PROJECT_REF}@${OSCAR_SUPABASE_POOLER_HOST}:5432/postgres`);
 url.password = encodeURIComponent(password);
 const connectionString = url.toString();
 assertOscarSupabaseTarget(connectionString);
 return connectionString;
}

/** Extracts the SQL body so both migrations and the manager run in one transaction. */
export function migrationBody(source) {
 const matches = [...source.matchAll(/(?:^|\r?\n)BEGIN;\s*\r?\n([\s\S]*?)(?:\r?\n)COMMIT;/g)];
 if (matches.length !== 1) throw new Error('A migração SQL do OScar precisa de uma única transação.');
 return matches[0][1];
}

export async function readOscarMigrations() {
 const [base, requests] = await Promise.all([
  readFile(resolve(root, 'supabase/migrations/202610220001_oscar_private.sql'), 'utf8'),
  readFile(resolve(root, 'docs/SQL_PARA_APLICAR_DEPOIS.txt'), 'utf8')
 ]);
 return [migrationBody(base), migrationBody(requests)];
}

/** Local-only credentials; never read a URL or project target from this file. */
export async function readSavedCredentials(filePath = savedCredentialsPath) {
 let source;
 try { source = await readFile(filePath, 'utf8'); }
 catch (error) {
  if (error.code === 'ENOENT') return null;
  throw new Error('Não foi possível abrir as credenciais locais do OScar.');
 }
 let saved;
 try { saved = JSON.parse(source); }
 catch { throw new Error('O arquivo de credenciais locais do OScar é inválido.'); }
 if (!saved || Array.isArray(saved) || saved.projectRef !== OSCAR_SUPABASE_PROJECT_REF ||
  typeof saved.databasePassword !== 'string' || !saved.databasePassword ||
  typeof saved.managerPassword !== 'string')
  throw new Error('O arquivo de credenciais locais não corresponde ao Supabase do OScar.');
 oscarConnectionString(saved.databasePassword);
 validateAdministrator({ ...FIRST_MANAGER, password: saved.managerPassword });
 return { databasePassword: saved.databasePassword, managerPassword: saved.managerPassword };
}

/** Trust only the pinned Supabase root CA; keep TLS and hostname verification enabled. */
export async function readOscarSupabaseCa(filePath = supabaseCaPath) {
 let pem;
 try { pem = await readFile(filePath, 'utf8'); }
 catch { throw new Error('Certificado CA do Supabase ausente na pasta local do OScar.'); }
 let certificate;
 try { certificate = new X509Certificate(pem); }
 catch { throw new Error('Certificado CA local do Supabase inválido.'); }
 if (certificate.fingerprint256.replaceAll(':', '').toLowerCase() !== SUPABASE_CA_FINGERPRINT ||
  !certificate.verify(certificate.publicKey))
  throw new Error('Certificado CA local não corresponde à raiz do Supabase.');
 return pem;
}

export async function oscarVerifiedPoolOptions(connectionString) {
 assertOscarSupabaseTarget(connectionString);
 return postgresPoolOptions({ connectionString, sslCa: await readOscarSupabaseCa(), max: 1 });
}

export async function oscarSupabaseChildEnv(connectionString, baseEnv = process.env) {
 assertOscarSupabaseTarget(connectionString);
 return { ...baseEnv, DATABASE_URL: connectionString, DATABASE_SSL_CA: await readOscarSupabaseCa() };
}

/** Only initializes a new empty OScar schema. No demonstration records are copied. */
export async function initializeOscarDatabase(client, { name, email, password }, migrations) {
 const manager = validateAdministrator({ name, email, password });
 const sql = migrations ?? await readOscarMigrations();
 if (!Array.isArray(sql) || sql.length !== 2) throw new Error('Migrações do OScar incompletas.');
 const exists = await client.query("SELECT 1 FROM pg_namespace WHERE nspname='oscar_private' LIMIT 1");
 if (exists.rows.length) throw new Error('O esquema oscar_private já existe neste banco. Nenhuma alteração foi feita.');
 await client.query('BEGIN');
 try {
  // pg accepts a trusted, parameter-free SQL batch; PGlite's exec is used in local tests.
  for (const body of sql) {
   if (typeof client.exec === 'function') await client.exec(body);
   else await client.query(body);
  }
  const time = new Date().toISOString();
  const data = { name: manager.name, email: manager.email, role: 'gerente', active: true,
   clientId: null, createdAt: time, updatedAt: time };
  const created = await client.query(`WITH allocated AS (
   SELECT nextval(pg_get_serial_sequence('oscar_private.users','id')) AS id
  ) INSERT INTO oscar_private.users(id,data,email,passwordhash,clientid)
   SELECT id,$1::jsonb || jsonb_build_object('id',id),$2,$3,NULL FROM allocated
   RETURNING id`, [JSON.stringify(data), manager.email, hashPassword(manager.password)]);
  if (created.rows.length !== 1) throw new Error('Não foi possível criar o primeiro gerente.');
  const count = await client.query('SELECT count(*)::integer AS total FROM oscar_private.services');
  if (count.rows[0]?.total !== 0) throw new Error('O catálogo deveria começar vazio.');
  await client.query('COMMIT');
  return { manager: manager.name, email: manager.email, services: 0 };
 } catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
  throw error;
 }
}

async function setup() {
 const saved = await readSavedCredentials();
 if (!saved && (!stdin.isTTY || !stdout.isTTY)) throw new Error('Use um terminal interativo para informar as senhas do OScar.');
 stdout.write(`Projeto Supabase exclusivo do OScar: ${OSCAR_SUPABASE_PROJECT_REF}\n`);
 stdout.write(`Primeiro gerente: ${FIRST_MANAGER.name} <${FIRST_MANAGER.email}>\n`);
 stdout.write('O catálogo começará vazio.\n');
 if (saved) stdout.write('Credenciais locais do OScar carregadas.\n');
 const databasePassword = saved?.databasePassword ?? await hiddenQuestion('Senha do banco Supabase: ');
 const connectionString = oscarConnectionString(databasePassword);
 const password = saved?.managerPassword ?? await hiddenQuestion('Nova senha do gerente Roberto: ');
 if (!saved) {
  const confirmation = await hiddenQuestion('Confirme a senha do gerente: ');
  if (password !== confirmation) throw new Error('As senhas do gerente não coincidem. Nenhuma alteração foi feita.');
 }
 const manager = validateAdministrator({ ...FIRST_MANAGER, password });
 const [migrations, poolOptions] = await Promise.all([readOscarMigrations(), oscarVerifiedPoolOptions(connectionString)]);
 const pool = new Pool(poolOptions);
 try {
  const client = await pool.connect();
  try {
   const result = await initializeOscarDatabase(client, manager, migrations);
   stdout.write(`Banco OScar preparado. Gerente: ${result.name ?? result.manager} <${result.email}>. Serviços: 0.\n`);
  } finally { client.release(); }
 } finally { await pool.end(); }
}

async function start() {
 const saved = await readSavedCredentials();
 if (!saved && (!stdin.isTTY || !stdout.isTTY)) throw new Error('Use um terminal interativo para informar a senha do OScar.');
 stdout.write(`Conexão exclusiva com o Supabase OScar ${OSCAR_SUPABASE_PROJECT_REF}.\n`);
 if (saved) stdout.write('Credenciais locais do OScar carregadas.\n');
 const databasePassword = saved?.databasePassword ?? await hiddenQuestion('Senha do banco Supabase: ');
 const connectionString = oscarConnectionString(databasePassword);
 const env = await oscarSupabaseChildEnv(connectionString);
 const child = spawn(process.execPath, ['scripts/dev.mjs', '--oscar-supabase'],
  { cwd: root, stdio: 'inherit', env });
 process.once('SIGINT', () => child.kill('SIGTERM'));
 process.once('SIGTERM', () => child.kill('SIGTERM'));
 const code = await new Promise((done, fail) => {
  child.once('error', fail);
  child.once('exit', (exitCode, signal) => done(exitCode ?? (signal ? 1 : 0)));
 });
 process.exitCode = code;
}

export async function runOscarSupabaseCli(args = process.argv.slice(2)) {
 if (args.length !== 1 || !['setup', 'start'].includes(args[0]))
  throw new Error('Use npm run setup:oscar-supabase ou npm run start:oscar-supabase. Não passe senhas por argumento.');
 if (args[0] === 'setup') await setup();
 else await start();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
 runOscarSupabaseCli().catch(error => {
  // Database driver errors may contain connection details: never print them here.
  const safe = error.message?.startsWith('O esquema oscar_private já existe') ||
   error.message?.startsWith('Use um terminal interativo') ||
   error.message?.startsWith('Use npm run') ||
   error.message?.startsWith('O arquivo de credenciais locais') ||
   error.message?.startsWith('Não foi possível abrir as credenciais locais') ||
   error.message?.startsWith('Certificado CA') ||
   error.message?.startsWith('Informe a senha') ||
   error.message?.startsWith('As senhas do gerente não coincidem') ||
   error.message?.startsWith('Use senha de 10 a 128') ||
   error.message?.startsWith('A senha do banco OScar ainda não foi informada');
  const connectionErrors = {
   '28P01': 'Senha do banco recusada. Em Supabase → Database → Settings, redefina-a para o valor salvo em data/oscar-supabase.local.json e repita o comando.',
   '42501': 'A conta do banco não tem permissão para criar o esquema OScar.',
   ENOTFOUND: 'O host do Supabase não foi encontrado.',
   ECONNREFUSED: 'A conexão com o Supabase foi recusada.',
   ETIMEDOUT: 'A conexão com o Supabase excedeu o tempo limite.',
   CERT_HAS_EXPIRED: 'O certificado TLS do Supabase expirou ou o relógio local está incorreto.',
  };
  console.error(safe ? error.message : connectionErrors[error.code] ??
   `Falha ao acessar o Supabase OScar (${String(error.code ?? 'sem código').replace(/[^A-Za-z0-9_-]/g, '')}).`);
  process.exitCode = 1;
 });
