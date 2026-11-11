import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword, timestamp } from '../auth-crypto.ts';
import { migrateLocalServicePurposes } from '../service-purpose.ts';
export { hashPassword, verifyPassword, hashToken, timestamp } from '../auth-crypto.ts';
const relations: Record<string, string[]> = {
    clients: [], vehicles: ['clientId'], users: ['clientId'], services: [], suppliers: [],
    parts: ['supplierId'], appointments: ['clientId', 'vehicleId', 'mechanicId'],
    orders: ['clientId', 'vehicleId', 'mechanicId', 'appointmentId', 'originOrderId'],
    budgets: ['orderId'], movements: ['partId', 'orderId', 'supplierId'], tickets: ['orderId', 'clientId'], service_requests: [], emails: [], audit: [],
};
const tableSchema = {
    clients: '', vehicles: ', clientId INTEGER NOT NULL REFERENCES clients(id)',
    users: ', clientId INTEGER REFERENCES clients(id), email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL',
    services: '', suppliers: '', parts: ', supplierId INTEGER REFERENCES suppliers(id)',
    appointments: ', clientId INTEGER NOT NULL REFERENCES clients(id), vehicleId INTEGER NOT NULL REFERENCES vehicles(id), mechanicId INTEGER NOT NULL REFERENCES users(id)',
    orders: ', clientId INTEGER NOT NULL REFERENCES clients(id), vehicleId INTEGER NOT NULL REFERENCES vehicles(id), mechanicId INTEGER NOT NULL REFERENCES users(id), appointmentId INTEGER REFERENCES appointments(id), originOrderId INTEGER REFERENCES orders(id)',
    budgets: ', orderId INTEGER NOT NULL REFERENCES orders(id)',
    movements: ', partId INTEGER NOT NULL REFERENCES parts(id), orderId INTEGER REFERENCES orders(id), supplierId INTEGER REFERENCES suppliers(id)',
    tickets: ', orderId INTEGER NOT NULL REFERENCES orders(id), clientId INTEGER NOT NULL REFERENCES clients(id)', service_requests: '', emails: '', audit: '',
};
export function createStore({ filename = resolve('data/oscar.sqlite'), seed = true }: any = {}) {
    if (filename !== ':memory:')
        mkdirSync(dirname(filename), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
    for (const [name, extra] of Object.entries(tableSchema))
        db.exec(`CREATE TABLE IF NOT EXISTS ${name}(id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL${extra});`);
    db.exec(`CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,lastSeen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reset_tokens(token TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users(id),expiresAt INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_appointments_mechanic ON appointments(mechanicId);
    CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(clientId); CREATE INDEX IF NOT EXISTS idx_orders_mechanic ON orders(mechanicId);
    CREATE INDEX IF NOT EXISTS idx_movements_part ON movements(partId); CREATE INDEX IF NOT EXISTS idx_budgets_order ON budgets(orderId);
    CREATE INDEX IF NOT EXISTS idx_vehicles_client ON vehicles(clientId); CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(clientId);`);
    const checkTable = (table: any) => { if (!Object.hasOwn(relations, table))
        throw new Error('Tabela não permitida.'); };
    let queue: Promise<any> = Promise.resolve();
    const exclusiveContext = new AsyncLocalStorage();
    const store = {
        db, filename, dialect: 'sqlite',
        runExclusive(operation: any) { if (exclusiveContext.getStore())
            return operation(); const run = queue.then(() => exclusiveContext.run(true, operation), () => exclusiveContext.run(true, operation)); queue = run.catch(() => { }); return run; },
        list(table: any) { checkTable(table); return db.prepare(`SELECT data FROM ${table} ORDER BY id DESC`).all().map((r: any) => JSON.parse(r.data)); },
        get(table: any, id: any) { checkTable(table); const row = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(Number(id)); return row ? JSON.parse(String(row.data)) : null; },
        save(table: any, record: any) {
            checkTable(table);
            const data = { ...record, updatedAt: timestamp() };
            if (!data.id) {
                data.createdAt ??= timestamp();
                const keys = [...relations[table], ...(table === 'users' ? ['email', 'passwordHash'] : [])];
                const values = keys.map((k: any) => k === 'passwordHash' ? record.passwordHash ?? hashPassword(randomBytes(24).toString('hex')) : data[k] ?? null);
                delete data.passwordHash;
                const info = db.prepare(`INSERT INTO ${table}(data${keys.length ? ',' + keys.join(',') : ''}) VALUES(?${keys.map(() => ',?').join('')})`).run(JSON.stringify(data), ...values);
                data.id = Number(info.lastInsertRowid);
            }
            const keys = [...relations[table], ...(table === 'users' ? ['email'] : [])];
            const values = keys.map((k: any) => data[k] ?? null);
            if (table === 'users' && record.passwordHash)
                db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(record.passwordHash, data.id);
            delete data.passwordHash;
            db.prepare(`UPDATE ${table} SET data=?${keys.map((k: any) => `,${k}=?`).join('')} WHERE id=?`).run(JSON.stringify(data), ...values, data.id);
            return data;
        },
        remove(table: string, id: number) { checkTable(table); return db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); },
        settings() { return JSON.parse(String(db.prepare('SELECT data FROM settings WHERE id=1').get()!.data)); },
        saveSettings(data: any) { db.prepare('INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(data)); return data; },
        audit(actor: any, action: any, entity: any, recordId: any, details: any = {}) { return this.save('audit', { actorId: actor?.id ?? null, actorName: actor?.name ?? 'Sistema', action, entity, recordId, date: timestamp(), details }); },
        transaction(operation: any) { db.exec('BEGIN IMMEDIATE'); try {
            const result = operation();
            if (result && typeof result.then === 'function')
                return Promise.resolve(result).then((value: any) => { db.exec('COMMIT'); return value; }, (error: any) => { db.exec('ROLLBACK'); throw error; });
            db.exec('COMMIT');
            return result;
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        } },
        backup() {
            if (filename === ':memory:')
                return null;
            const folder = resolve(dirname(filename), 'backups');
            mkdirSync(folder, { recursive: true });
            const target = resolve(folder, `oscar-${new Date().toISOString().slice(0, 10)}.sqlite`);
            if (!existsSync(target))
                db.prepare('VACUUM INTO ?').run(target);
            return { filename: `oscar-${new Date().toISOString().slice(0, 10)}.sqlite`, createdAt: timestamp() };
        },
        close() { db.close(); },
    };
    if (!db.prepare('SELECT id FROM settings WHERE id=1').get())
        store.saveSettings({ workshopName: 'OScar Oficina', approvalMethods: ['presencial', 'telefone', 'mensagem'], warrantyDays: 90, consumptionWindowDays: 30, defaultLeadDays: 5, budgetValidityHours: 48, openingHour: 8, closingHour: 18, appointmentIntervalMinutes: 30 });
    if (seed && store.list('users').length === 0)
        seedDemo(store);
    migrateLocalServicePurposes(store);
    return store;
}
function seedDemo(s: any) {
    const older = new Date(Date.now() - 60 * 86400000).toISOString();
    const day = (offset: any) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    s.transaction(() => {
        const clients = [
            ['Mariana Oliveira', '12345678909', '14999990001', 'cliente@oscar.local'],
            ['Lucas Ferreira', '98765432100', '14999990002', 'lucas@exemplo.local'],
            ['Camila Santos', '11144477735', '14999990003', 'camila@exemplo.local'],
        ].map(([name, cpf, phone, email]: any) => s.save('clients', { name, cpf, phone, email, active: true }));
        const credentials = hashPassword('Oscar@2026!');
        for (const [name, email, role, clientId] of [
            ['Beatriz Rocha', 'gerente@oscar.local', 'gerente', null], ['Caio Almeida', 'atendente@oscar.local', 'atendente', null],
            ['Rafael Lima', 'mecanico@oscar.local', 'mecanico', null], ['Ana Martins', 'consultor@oscar.local', 'consultor', null],
            ['Mariana Oliveira', 'cliente@oscar.local', 'cliente', clients[0].id], ['Pedro Souza', 'pedro@oscar.local', 'mecanico', null],
        ])
            s.save('users', { name, email, role, clientId, active: true, passwordHash: credentials });
        [
            { clientId: 1, plate: 'ABC1D23', chassis: '9BWZZZ377VT004251', brand: 'Volkswagen', model: 'Polo', year: 2021, mileage: 42850 },
            { clientId: 2, plate: 'DEF4G56', chassis: '9BGKS48B0PG123456', brand: 'Chevrolet', model: 'Onix', year: 2023, mileage: 19200 },
            { clientId: 3, plate: 'GHI7J89', chassis: '93HFC2630LZ123456', brand: 'Honda', model: 'Civic', year: 2020, mileage: 68400 },
            { clientId: 1, plate: 'JKL0M12', chassis: '9BD17164LA1234567', brand: 'Fiat', model: 'Argo', year: 2022, mileage: 31000 },
        ].forEach((v: any) => s.save('vehicles', { ...v, active: true }));
        [
            ['Troca de óleo', 'Substituição de óleo e filtro do motor.', 120, 45, ['Nível e estado do óleo', 'Filtro de óleo', 'Vazamentos']],
            ['Revisão preventiva', 'Inspeção geral dos principais sistemas.', 280, 120, ['Fluidos e filtros', 'Freios e suspensão', 'Iluminação', 'Correias']],
            ['Alinhamento', 'Alinhamento da direção e geometria.', 95, 45, ['Desgaste dos pneus', 'Folgas na direção', 'Geometria']],
            ['Sistema de freios', 'Inspeção e manutenção do sistema de freios.', 180, 90, ['Pastilhas', 'Discos', 'Fluido de freio']],
            ['Diagnóstico eletrônico', 'Leitura de falhas e diagnóstico com scanner.', 150, 60, ['Códigos de falha', 'Sensores', 'Teste de funcionamento']],
            ['Troca de correia', 'Substituição da correia de distribuição.', 350, 180, ['Estado da correia', 'Tensionadores', 'Sincronismo']],
        ].forEach(([name, description, price, durationMinutes, inspectionItems]: any) => s.save('services', { name, description, price, durationMinutes, inspectionItems, purpose: name === 'Diagnóstico eletrônico' ? 'avaliacao' : 'execucao', active: true }));
        s.save('suppliers', { name: 'Autopeças Horizonte', cnpj: '11222333000181', contact: 'compras@horizonte.exemplo', leadDays: 3, active: true });
        s.save('suppliers', { name: 'Distribuidora Motor Brasil', cnpj: '11444777000161', contact: '(14) 3333-2000', leadDays: 5, active: true });
        [
            ['OL-5W30', 'Óleo sintético 5W30', 'L', 25, 45, 1, 18, 10], ['FO-001', 'Filtro de óleo', 'UN', 18, 35, 1, 3, 5],
            ['PA-001', 'Pastilha de freio dianteira', 'JG', 85, 145, 2, 2, 4], ['FA-001', 'Filtro de ar do motor', 'UN', 22, 45, 1, 12, 3],
            ['FL-001', 'Fluido de freio DOT4', 'L', 32, 55, 2, 6, 3], ['CO-001', 'Kit correia dentada', 'KIT', 160, 290, 2, 1, 2],
            ['VE-001', 'Vela de ignição', 'UN', 16, 30, 1, 24, 8], ['AM-001', 'Amortecedor dianteiro', 'UN', 190, 340, 2, 4, 2],
        ].forEach(([code, description, unit, cost, price, supplierId, stock, manualMinimum]: any) => s.save('parts', { code, description, unit, cost, price, supplierId, stock, manualMinimum, historyStartedAt: older, active: true }));
        const makeItem = (id: any, serviceId: any, executed: any = false) => { const service = s.get('services', serviceId); return { id: `item-${id}`, serviceId, partId: null, kind: 'servico', description: service.name, quantity: 1, price: service.price, total: service.price, decision: 'aprovado', approvedAt: older, approvalMethod: 'presencial', approvalBy: 2, executedAt: executed ? older : null, executedBy: executed ? 3 : null, source: 'inicial', suppliedByClient: false }; };
        [
            [1, 1, 3, 'inspecao', [1, 2]], [2, 2, 6, 'execucao', [3]], [3, 3, 3, 'aberta', [4]],
            [1, 4, 6, 'aguardando_aprovacao', [5]], [2, 2, 3, 'concluida', [1]], [1, 1, 3, 'encerrada', [2]],
        ].forEach(([clientId, vehicleId, mechanicId, status, serviceIds]: any, index: any) => {
            const openedAt = new Date(Date.now() - (status === 'encerrada' ? 12 * 86400000 : (index + 1) * 3600000)).toISOString();
            const closedAt = status === 'encerrada' ? new Date(Date.now() - 10 * 86400000).toISOString() : null;
            const lastAt = closedAt ?? new Date(Date.now() - 1800000).toISOString();
            const items = serviceIds.map((serviceId: any) => ({ ...makeItem(`${index + 1}-${serviceId}`, serviceId, ['concluida', 'encerrada'].includes(status)), approvedAt: openedAt, executedAt: ['concluida', 'encerrada'].includes(status) ? new Date(Date.parse(lastAt) - 600000).toISOString() : null, executedBy: ['concluida', 'encerrada'].includes(status) ? mechanicId : null }));
            const stages = ['aberta', 'inspecao', 'aguardando_aprovacao', 'execucao', 'concluida', 'encerrada'];
            const stageCount = stages.indexOf(status) + 1;
            const timeline = stages.slice(0, stageCount).map((step: any, position: any) => ({ status: step, date: new Date(Date.parse(openedAt) + ((Date.parse(lastAt) - Date.parse(openedAt)) * position / Math.max(1, stageCount - 1))).toISOString(), userId: position === 0 || step === 'encerrada' ? 2 : mechanicId, userName: position === 0 || step === 'encerrada' ? 'Caio Almeida' : s.get('users', mechanicId).name }));
            s.save('orders', { number: 1001 + index, clientId, vehicleId, mechanicId, appointmentId: null, originOrderId: null, type: 'normal', status, items, inspections: items.flatMap((item: any) => s.get('services', item.serviceId).inspectionItems.map((description: any, i: any) => ({ id: `${item.id}-check-${i}`, itemId: item.id, description, result: '', notes: '' }))), findings: [], timeline, createdAt: openedAt, closedAt, warrantyDays: 90 });
        });
        const pending = { id: 'budget-item-demo', serviceId: null, partId: 3, kind: 'peca', description: 'Pastilha de freio dianteira', quantity: 1, price: 145, total: 145, decision: 'pendente', executedAt: null, source: 'complementar', justification: 'Desgaste identificado durante a inspeção', suppliedByClient: false };
        const order = s.get('orders', 4);
        order.findings.push(pending);
        s.save('orders', order);
        s.save('budgets', { orderId: 4, number: 2001, items: [pending], status: 'rascunho', publishedAt: null, expiresAt: null, answeredAt: null, tokenHash: null, link: null });
        for (let i = 0; i < 3; i++)
            s.save('appointments', { clientId: i + 1, vehicleId: i + 1, mechanicId: i % 2 ? 6 : 3, serviceIds: [i + 1], date: day(i), time: ['09:00', '10:30', '14:00'][i], durationMinutes: s.get('services', i + 1).durationMinutes, status: 'agendado', reason: 'Agendamento demonstrativo' });
        for (const part of s.list('parts'))
            s.save('movements', { partId: part.id, orderId: null, supplierId: part.supplierId, type: 'entrada', quantity: part.stock, date: older.slice(0, 10), createdAt: older, notes: 'Saldo inicial demonstrativo', userId: 1 });
        s.audit({ id: 1, name: 'Beatriz Rocha' }, 'criar', 'demonstracao', 0, { description: 'Base fictícia inicializada para uso exclusivamente local.' });
    });
}
