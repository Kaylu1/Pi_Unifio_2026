import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(PROJECT, 'data', 'mysql-local');
const RUNTIME = join(PROJECT, 'data', 'mysql-runtime');
const VERSION = '8.4.13';
const ARCHIVE_NAME = 'mysql-' + VERSION + '-winx64.zip';
const ARCHIVE = join(RUNTIME, ARCHIVE_NAME);
const HOME = join(RUNTIME, 'mysql-' + VERSION + '-winx64');
const SERVER = join(HOME, 'bin', 'mysqld.exe');
const CLIENT = join(HOME, 'bin', 'mysql.exe');
const ADMIN = join(HOME, 'bin', 'mysqladmin.exe');
const DATA = join(LOCAL, 'datadir');
const SETTINGS = join(LOCAL, 'config.json');
const ADMIN_SETTINGS = join(LOCAL, 'admin.json');
const ADMIN_CLIENT = join(LOCAL, 'admin-client.ini');
const INI = join(LOCAL, 'my.ini');
const READY = join(LOCAL, 'bootstrap.done');
const URL = 'https://cdn.mysql.com/Downloads/MySQL-8.4/' + ARCHIVE_NAME;
const EXPECTED_MD5 = '7b94489d5524dea9b27097068bea25a8';
let startedServerPid = null;

export const localMysqlPaths = Object.freeze({ project: PROJECT, local: LOCAL, runtime: RUNTIME, data: DATA, settings: SETTINGS });

function ownedPath(candidate, base) {
  const absolute = resolve(candidate);
  const directory = resolve(base);
  if (absolute !== directory && !absolute.startsWith(directory + sep)) {
    throw new Error('O caminho do MySQL saiu da pasta local autorizada.');
  }
  return absolute;
}

function loadSettings() {
  if (!existsSync(SETTINGS)) throw new Error('Execute primeiro: node scripts/mysql-local.mjs setup');
  const config = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  if (config.host !== '127.0.0.1' || ![3307, 3308].includes(config.port)
      || config.user !== 'oscar_app' || config.database !== 'oscar_local' || config.testDatabase !== 'oscar_test') {
    throw new Error('Configuração recusada: esta instância aceita apenas os bancos locais exclusivos do OScar.');
  }
  return config;
}

export async function getLocalMysqlConfig({ test = false } = {}) {
  const config = loadSettings();
  return { host: config.host, port: config.port, user: config.user, password: config.password,
    database: test ? config.testDatabase : config.database };
}

export const readLocalMysqlConfig = getLocalMysqlConfig;

async function portOpen(port) {
  return await new Promise((resolveResult) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveResult(value);
    };
    socket.setTimeout(700, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function run(executable, args, { input, timeout = 120000 } = {}) {
  const result = spawnSync(executable, args, { cwd: PROJECT, input, encoding: 'utf8', windowsHide: true, timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Falha ao executar o MySQL local.').trim());
  }
  return result.stdout.trim();
}

function sql(sqlText, { blankRoot = false } = {}) {
  const config = loadSettings();
  const args = blankRoot
    ? ['--no-defaults', '--protocol=MEMORY', '--shared-memory-base-name=OSCAR_MYSQL_' + config.port, '--user=root', '--skip-password']
    : ['--defaults-extra-file=' + ADMIN_CLIENT];
  return run(CLIENT, [...args, '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4'], { input: sqlText });
}

function psLiteral(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function sqlLiteral(value) { return "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "''") + "'"; }
function iniPath(value) { return value.replaceAll('\\', '/'); }

async function md5(file) {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function installRuntime() {
  if (process.platform !== 'win32') throw new Error('Este instalador portátil foi preparado para Windows x64.');
  mkdirSync(ownedPath(RUNTIME, PROJECT), { recursive: true });
  if (!existsSync(ARCHIVE)) {
    console.log('Baixando MySQL Community ' + VERSION + ' do site oficial...');
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri "
        + psLiteral(URL) + ' -OutFile ' + psLiteral(ARCHIVE) + ' -TimeoutSec 600'], { timeout: 660000 });
  }
  if (await md5(ARCHIVE) !== EXPECTED_MD5) {
    throw new Error('O checksum do ZIP não confere com o publicado pelo MySQL. O arquivo foi preservado em ' + ARCHIVE);
  }
  if (!existsSync(SERVER)) {
    if (existsSync(HOME) && readdirSync(HOME).length) {
      throw new Error('Há uma extração incompleta em ' + HOME + '. Nenhum arquivo existente foi apagado.');
    }
    console.log('Extraindo o servidor portátil...');
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath " + psLiteral(ARCHIVE)
        + ' -DestinationPath ' + psLiteral(RUNTIME)], { timeout: 300000 });
  }
  if (!existsSync(SERVER) || !existsSync(CLIENT)) throw new Error('O ZIP não contém os executáveis esperados.');
}

async function writeConfiguration() {
  mkdirSync(ownedPath(LOCAL, PROJECT), { recursive: true });
  mkdirSync(join(LOCAL, 'files'), { recursive: true });
  if (!existsSync(SETTINGS)) {
    const port = !await portOpen(3307) ? 3307 : !await portOpen(3308) ? 3308 : null;
    if (!port) throw new Error('As portas locais 3307 e 3308 já estão ocupadas.');
    writeFileSync(SETTINGS, JSON.stringify({ host: '127.0.0.1', port, user: 'oscar_app', password: 'OscarLocal2026!',
      database: 'oscar_local', testDatabase: 'oscar_test', version: VERSION }, null, 2) + '\n', { mode: 0o600 });
  }
  const config = loadSettings();
  if (!existsSync(ADMIN_SETTINGS)) {
    if (existsSync(join(DATA, 'mysql'))) throw new Error('O diretório já foi inicializado, mas a credencial administrativa local está ausente.');
    writeFileSync(ADMIN_SETTINGS, JSON.stringify({ rootPassword: randomBytes(32).toString('base64url') }) + '\n', { mode: 0o600 });
  }
  const { rootPassword } = JSON.parse(readFileSync(ADMIN_SETTINGS, 'utf8'));
  writeFileSync(ADMIN_CLIENT, ['[client]', 'protocol=MEMORY', 'shared-memory-base-name=OSCAR_MYSQL_' + config.port, 'user=root',
    'password=' + rootPassword, 'default-character-set=utf8mb4', ''].join('\n'), { mode: 0o600 });
  const options = ['[mysqld]', 'basedir="' + iniPath(HOME) + '"', 'datadir="' + iniPath(DATA) + '"',
    'port=' + config.port, 'bind-address=127.0.0.1', 'mysqlx=OFF', 'skip-name-resolve', 'skip-log-bin',
    'shared-memory=ON', 'shared-memory-base-name=OSCAR_MYSQL_' + config.port,
    'log-error="' + iniPath(join(LOCAL, 'mysql-error.log')) + '"', 'pid-file="' + iniPath(join(LOCAL, 'mysql.pid')) + '"',
    'secure-file-priv="' + iniPath(join(LOCAL, 'files')) + '"', 'local-infile=0', 'character-set-server=utf8mb4',
    'collation-server=utf8mb4_0900_ai_ci', 'max-connections=40', 'innodb-buffer-pool-size=64M',
    'innodb-redo-log-capacity=64M', 'performance-schema=OFF', ''].join('\n');
  writeFileSync(INI, options);
}

async function initializeData() {
  if (existsSync(join(DATA, 'mysql'))) return;
  if (existsSync(DATA) && readdirSync(DATA).length) {
    throw new Error('A pasta de dados não está vazia e não foi inicializada. Nada foi apagado: ' + DATA);
  }
  console.log('Criando o diretório de dados exclusivo do OScar...');
  run(SERVER, ['--defaults-file=' + INI, '--initialize-insecure', '--console'], { timeout: 180000 });
}

function serverIdentity({ blankRoot = false } = {}) {
  const result = sql('SELECT @@version, @@port, @@datadir;', { blankRoot });
  const [version, port, data] = result.split('\t');
  const normalize = (value) => resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  if (!version || Number(port) !== loadSettings().port || normalize(data) !== normalize(DATA)) {
    throw new Error('A porta está ocupada por outra instância. Nenhum servidor externo ao OScar será alterado.');
  }
  return { version, port: Number(port), data: DATA };
}

async function startProcess({ allowBlankRoot = false } = {}) {
  const config = loadSettings();
  if (!await portOpen(config.port)) {
    const child = spawn(SERVER, ['--defaults-file=' + INI], { cwd: HOME, windowsHide: true, detached: true, stdio: 'ignore' });
    startedServerPid = child.pid;
    child.unref();
    let failed;
    child.once('error', (error) => { failed = error; });
    for (let attempt = 0; attempt < 80 && !await portOpen(config.port); attempt++) {
      if (failed) throw failed;
      await delay(250);
    }
    if (!await portOpen(config.port)) throw new Error('O MySQL não iniciou. Confira data/mysql-local/mysql-error.log.');
  }
  try { return serverIdentity(); }
  catch (error) {
    if (allowBlankRoot && !existsSync(READY)) return serverIdentity({ blankRoot: true });
    throw error;
  }
}

function bootstrap() {
  const config = loadSettings();
  const { rootPassword } = JSON.parse(readFileSync(ADMIN_SETTINGS, 'utf8'));
  let blankRoot = false;
  try { serverIdentity(); }
  catch (error) {
    if (existsSync(READY)) throw error;
    serverIdentity({ blankRoot: true });
    blankRoot = true;
  }
  const statements = [
    "ALTER USER 'root'@'localhost' IDENTIFIED BY " + sqlLiteral(rootPassword),
    'CREATE DATABASE IF NOT EXISTS oscar_local CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
    'CREATE DATABASE IF NOT EXISTS oscar_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
  ];
  for (const host of ['127.0.0.1', 'localhost']) {
    const account = "'oscar_app'@'" + host + "'";
    statements.push('CREATE USER IF NOT EXISTS ' + account + ' IDENTIFIED BY ' + sqlLiteral(config.password));
    statements.push('ALTER USER ' + account + ' IDENTIFIED BY ' + sqlLiteral(config.password));
    for (const database of ['oscar_local', 'oscar_test']) {
      statements.push('GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON ' + database + '.* TO ' + account);
    }
  }
  sql(statements.join(';\n') + ';\n', { blankRoot });
  writeFileSync(READY, 'MySQL Community ' + VERSION + ' configurado localmente.\n');
}

export async function setupLocalMysql() {
  await installRuntime();
  await writeConfiguration();
  await initializeData();
  await startProcess({ allowBlankRoot: true });
  bootstrap();
  const identity = serverIdentity();
  console.log('MySQL Community ' + identity.version + ' pronto em 127.0.0.1:' + identity.port + ' (oscar_local e oscar_test).');
  return await getLocalMysqlConfig();
}

export async function startLocalMysql() {
  if (!existsSync(READY) || !existsSync(SERVER)) return await setupLocalMysql();
  await writeConfiguration();
  const identity = await startProcess();
  console.log('MySQL Community ' + identity.version + ' em 127.0.0.1:' + identity.port + '.');
  return await getLocalMysqlConfig();
}

export async function stopLocalMysql() {
  const config = loadSettings();
  if (!await portOpen(config.port)) { console.log('MySQL local já está parado.'); return; }
  serverIdentity();
  run(ADMIN, ['--defaults-extra-file=' + ADMIN_CLIENT, 'shutdown']);
  for (let attempt = 0; attempt < 40 && await portOpen(config.port); attempt++) await delay(250);
  if (await portOpen(config.port)) throw new Error('O servidor ainda está encerrando. Nenhum processo foi forçado.');
  console.log('MySQL local encerrado com segurança.');
  startedServerPid = null;
}

export async function stopStartedLocalMysql() {
  const pidFile = join(LOCAL, 'mysql.pid');
  if (!startedServerPid || !existsSync(pidFile) || Number(readFileSync(pidFile, 'utf8').trim()) !== startedServerPid) return;
  await stopLocalMysql();
}

export async function statusLocalMysql() {
  if (!existsSync(SETTINGS)) { console.log('MySQL local ainda não configurado.'); return { running: false }; }
  const config = loadSettings();
  if (!await portOpen(config.port)) { console.log('MySQL local parado (127.0.0.1:' + config.port + ').'); return { running: false }; }
  const identity = serverIdentity();
  console.log('MySQL Community ' + identity.version + ' ativo em 127.0.0.1:' + identity.port + '.');
  return { running: true, ...identity };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actions = { setup: setupLocalMysql, start: startLocalMysql, stop: stopLocalMysql, status: statusLocalMysql };
  const command = process.argv[2] || 'status';
  if (!actions[command]) {
    console.error('Use: node scripts/mysql-local.mjs setup|start|stop|status');
    process.exitCode = 1;
  } else {
    try {
      await actions[command]();
      if (process.argv.includes('--keep-alive') && ['setup', 'start'].includes(command)) {
        const keeper = setInterval(() => {}, 60000);
        const close = async () => { clearInterval(keeper); await stopStartedLocalMysql(); process.exit(0); };
        process.once('SIGINT', close);
        process.once('SIGTERM', close);
      }
    }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
