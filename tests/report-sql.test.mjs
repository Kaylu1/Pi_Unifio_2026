import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.mjs';
import { reportOrders, reportPartConsumption } from '../server/report-sql.mjs';
import { createPgFixture } from './helpers/postgres-fixture.mjs';

async function exercise(store) {
  const ana = await store.save('clients', { name: 'Ana', active: true });
  const bia = await store.save('clients', { name: 'Bia', active: true });
  const firstVehicle = await store.save('vehicles', { clientId: ana.id, plate: 'ABC1D23', active: true });
  const secondVehicle = await store.save('vehicles', { clientId: bia.id, plate: 'DEF4G56', active: true });
  const firstMechanic = await store.save('users', { name: 'Rafa', email: 'rafa@example.test', role: 'mecanico', active: true });
  const secondMechanic = await store.save('users', { name: 'Lia', email: 'lia@example.test', role: 'mecanico', active: true });
  const part = await store.save('parts', { code: 'P-1', description: 'Pastilha', cost: 10, stock: 0, active: true });
  const returned = await store.save('parts', { code: 'P-2', description: 'Filtro', cost: 5, stock: 0, active: true });
  const firstOrder = await store.save('orders', { clientId: ana.id, vehicleId: firstVehicle.id,
    mechanicId: firstMechanic.id, number: 1001, status: 'aberta', items: [] });
  const secondOrder = await store.save('orders', { clientId: bia.id, vehicleId: secondVehicle.id,
    mechanicId: secondMechanic.id, number: 1002, status: 'aberta', items: [] });
  await store.save('clients', { ...ana, name: 'Ana Atualizada' });
  for (const [partId, orderId, type, quantity, date] of [
    [part.id, firstOrder.id, 'saida', 2, '2026-10-12'],
    [part.id, firstOrder.id, 'estorno', 0.5, '2026-10-13'],
    [part.id, secondOrder.id, 'saida', 3, '2026-10-14'],
    [part.id, firstOrder.id, 'saida', 1, '2026-09-30'],
    [part.id, null, 'entrada', 10, '2026-10-15'],
    [returned.id, firstOrder.id, 'saida', 1, '2026-10-16'],
    [returned.id, firstOrder.id, 'estorno', 1, '2026-10-17'],
  ]) await store.save('movements', { partId, orderId, type, quantity, date });

  const orders = await reportOrders(store, firstMechanic.id);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].order.id, firstOrder.id);
  assert.equal(orders[0].clientName, 'Ana Atualizada');
  assert.equal(orders[0].vehiclePlate, 'ABC1D23');

  const all = await reportPartConsumption(store, '2026-10-01', '2026-10-31');
  assert.deepEqual(all.map(row => [row.part.code, row.quantity]), [['P-1', 4.5]]);
  const filtered = await reportPartConsumption(store, '2026-10-01', '2026-10-31', firstMechanic.id);
  assert.deepEqual(filtered.map(row => [row.partId, row.quantity]), [[part.id, 1.5]]);
}

test('relatório usa JOIN e SUM no SQLite local', async () => {
  const store = createStore({ filename: ':memory:', seed: false });
  try { await exercise(store); } finally { store.close(); }
});

test('relatório usa JOIN e SUM no PostgreSQL local', async () => {
  const fixture = await createPgFixture();
  try { await exercise(fixture.store); } finally { await fixture.close(); }
});