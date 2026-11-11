import mysql from 'mysql2/promise';
import { getLocalMysqlConfig } from '../../scripts/mysql-local.mjs';
import { createMysqlStore } from '../../server/repositories/mysql-repository.ts';

const TEST_DATABASE = 'oscar_test';
const TABLES = Object.freeze([
  'clients', 'users', 'vehicles', 'services', 'suppliers', 'parts', 'service_requests',
  'appointments', 'appointment_services', 'orders', 'order_items', 'budgets', 'movements',
  'tickets', 'emails', 'audit', 'settings', 'sessions', 'reset_tokens', 'backups',
  'privacy_tombstones', 'service_request_tombstones',
]);
const DELETE_ORDER = Object.freeze([
  'reset_tokens', 'sessions', 'order_items', 'appointment_services', 'tickets', 'movements',
  'budgets', 'orders', 'appointments', 'service_requests', 'vehicles', 'parts', 'users',
  'clients', 'services', 'suppliers', 'emails', 'audit', 'settings', 'backups',
  'privacy_tombstones', 'service_request_tombstones',
]);

function assertTestTarget(config) {
  if (config.host !== '127.0.0.1' || config.database !== TEST_DATABASE || ![3307, 3308].includes(config.port)) {
    throw new Error('Fixture recusada: somente MySQL local 127.0.0.1:3307/3308 e banco oscar_test.');
  }
}

async function assertSchema(connection, config) {
  const [[identity]] = await connection.query('SELECT DATABASE() AS databaseName, @@port AS port, @@bind_address AS bindAddress, VERSION() AS version');
  if (identity.databaseName !== TEST_DATABASE || Number(identity.port) !== config.port || identity.bindAddress !== '127.0.0.1') {
    throw new Error('A conexão não aponta para a instância exclusiva de testes do OScar.');
  }
  const [tables] = await connection.execute('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=?', [TEST_DATABASE, 'BASE TABLE']);
  const names = tables.map(table => table.name).sort();
  if (names.length !== TABLES.length || TABLES.some(name => !names.includes(name)) || tables.some(table => table.engine !== 'InnoDB')) {
    throw new Error('O esquema de oscar_test não corresponde às tabelas esperadas. Nenhum registro foi apagado.');
  }
  return identity;
}

/** Limpa somente o banco descartável oscar_test, respeitando todas as FKs. */
async function resetTestData(connection, config) {
  const identity = await assertSchema(connection, config);
  await connection.beginTransaction();
  try {
    await connection.query('UPDATE service_requests SET appointmentId=NULL');
    await connection.query('UPDATE orders SET originOrderId=NULL');
    for (const table of DELETE_ORDER) await connection.query('DELETE FROM `' + table + '`');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const [sequences] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND EXTRA LIKE ?', [TEST_DATABASE, '%auto_increment%']);
  for (const table of sequences) {
    if (!TABLES.includes(table.name)) throw new Error('Sequência inesperada no banco de testes.');
    await connection.query('ALTER TABLE `' + table.name + '` AUTO_INCREMENT=1');
  }
  return identity;
}

export async function createMysqlFixture({ seed = true } = {}) {
  const config = await getLocalMysqlConfig({ test: true });
  assertTestTarget(config);
  const lease = await mysql.createConnection(config);
  let locked = false;
  let store;
  let released = false;
  try {
    const [[lock]] = await lease.execute('SELECT GET_LOCK(?, 60) AS acquired', ['oscar:oscar_test:fixture']);
    locked = Number(lock.acquired) === 1;
    if (!locked) throw new Error('Outro teste ou captura Postman está usando oscar_test.');
    const schemaStore = await createMysqlStore({ ...config, seed: false });
    await schemaStore.close();
    const identity = await resetTestData(lease, config);
    store = await createMysqlStore({ ...config, seed });
    const release = async () => {
      if (released) return;
      released = true;
      try { if (locked) await lease.execute('SELECT RELEASE_LOCK(?)', ['oscar:oscar_test:fixture']); }
      finally { await lease.end(); }
    };
    return { store, config, identity, release,
      async close() { try { await store.close(); } finally { await release(); } } };
  } catch (error) {
    if (store) await store.close().catch(() => {});
    if (locked) await lease.execute('SELECT RELEASE_LOCK(?)', ['oscar:oscar_test:fixture']).catch(() => {});
    await lease.end();
    throw error;
  }
}
