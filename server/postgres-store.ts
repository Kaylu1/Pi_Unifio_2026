import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { redactServiceRequest, serviceRequestBelongsToClient } from './privacy.ts';
const { Pool } = pg;
const SCHEMA = 'oscar_private';
const LOCK_KEY = 68462731;
const DAY = 86400000;
export const ENTITY_RELATIONS: Readonly<Record<string, string[]>> = Object.freeze({
    clients: [], vehicles: ['clientId'], users: ['clientId'], services: [], suppliers: [],
    parts: ['supplierId'], appointments: ['clientId', 'vehicleId', 'mechanicId'],
    orders: ['clientId', 'vehicleId', 'mechanicId', 'appointmentId', 'originOrderId'],
    budgets: ['orderId'], movements: ['partId', 'orderId', 'supplierId'],
    tickets: ['orderId', 'clientId'], service_requests: [], emails: [], audit: [],
});
const ENTITIES = Object.keys(ENTITY_RELATIONS);
const TABLES = new Set([...ENTITIES, 'settings', 'sessions', 'reset_tokens', 'rate_limits', 'backups', 'privacy_tombstones', 'service_request_tombstones']);
const ROW_NAMES: Record<string, string> = { userid: 'userId', clientid: 'clientId', vehicleid: 'vehicleId', mechanicid: 'mechanicId',
    appointmentid: 'appointmentId', originorderid: 'originOrderId', orderid: 'orderId', partid: 'partId',
    supplierid: 'supplierId', lastseen: 'lastSeen', expiresat: 'expiresAt', passwordhash: 'passwordHash',
    keyhash: 'keyHash', createdat: 'createdAt', erasedat: 'erasedAt', actorid: 'actorId' };
const NUMERIC_COLUMNS = new Set(['id', 'userId', 'clientId', 'vehicleId', 'mechanicId', 'appointmentId',
    'originOrderId', 'orderId', 'partId', 'supplierId', 'lastSeen', 'expiresAt', 'actorId', 'count', 'used']);
const now = () => new Date().toISOString();
const clone = (value: any) => structuredClone(value);
function passwordHash() {
    const salt = randomBytes(16).toString('hex');
    return salt + ':' + scryptSync(randomBytes(32).toString('hex'), salt, 64).toString('hex');
}
function checkTable(name: any) {
    if (!Object.hasOwn(ENTITY_RELATIONS, name))
        throw new Error('Tabela não permitida.');
    return SCHEMA + '.' + name;
}
function numericId(value: any) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1)
        throw new Error('Identificador inválido.');
    return id;
}
function normalizeRow(row: any) {
    if (!row)
        return row;
    return Object.fromEntries(Object.entries(row).map(([key, value]: any) => {
        const name = ROW_NAMES[key] ?? key;
        if (value !== null && NUMERIC_COLUMNS.has(name) && typeof value === 'string' && /^-?\d+$/.test(value)) {
            const parsed = Number(value);
            if (!Number.isSafeInteger(parsed))
                throw new Error('Valor inteiro fora do limite seguro da aplicação.');
            return [name, parsed];
        }
        return [name, value];
    }));
}
/** A URI nunca pode substituir a verificação TLS explícita do driver. */
export function postgresPoolOptions({ connectionString = process.env.DATABASE_URL, sslCa = process.env.DATABASE_SSL_CA, max = 1 }: any = {}) {
    if (!connectionString)
        throw new Error('Configure DATABASE_URL somente no servidor para usar PostgreSQL.');
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
        throw new Error('DATABASE_URL deve ser PostgreSQL.');
    const mode = url.searchParams.get('sslmode');
    if (mode && !['require', 'verify-full', 'verify-ca'].includes(mode))
        throw new Error('A conexão PostgreSQL precisa de TLS verificado; remova a opção SSL insegura.');
    if (!Number.isInteger(max) || max < 1 || max > 3)
        throw new Error('O pool deve ter de 1 a 3 conexões.');
    // Nenhuma propriedade SSL, SET ou opção de sessão vinda da URI sobrepõe o contrato.
    url.search = '';
    const ca = sslCa ? String(sslCa).replace(/\\n/g, '\n') : undefined;
    if (ca && !ca.includes('-----BEGIN CERTIFICATE-----'))
        throw new Error('DATABASE_SSL_CA deve conter um certificado PEM.');
    return {
        connectionString: url.toString(), max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
        allowExitOnIdle: true, application_name: 'oscar_api', query_timeout: 15000,
        ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    };
}
/** Compatibilidade interna com SQL fixo do adaptador SQLite. Nunca recebe SQL do navegador. */
function translateSql(sql: any) {
    let result = String(sql).trim().replace(/;$/, '');
    if (result.includes(';') || /--|\/\*/.test(result))
        throw new Error('SQL interno não permitido.');
    if (!/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(result))
        throw new Error('Operação SQL interna não permitida.');
    result = result.replace(/\b(FROM|JOIN|INTO|UPDATE)\s+(?:oscar_private\.)?([a-z_][a-z_0-9]*)\b/gi, (all: any, keyword: any, table: any) => {
        if (!TABLES.has(table.toLowerCase()))
            throw new Error('Tabela SQL interna não permitida.');
        return keyword + ' ' + SCHEMA + '.' + table.toLowerCase();
    });
    let output = '', quoted = false, index = 0;
    for (let i = 0; i < result.length; i++) {
        const char = result[i];
        if (char === "'") {
            output += char;
            if (quoted && result[i + 1] === "'") {
                output += "'";
                i++;
                continue;
            }
            quoted = !quoted;
            continue;
        }
        output += char === '?' && !quoted ? '$' + (++index) : char;
    }
    return output;
}
function redactSnapshot(input: any, erasedIds: any, erasedRequestIds: any = []) {
    const snapshot = clone(input), records = snapshot.records ?? {};
    const erasedRequests = new Set([...erasedRequestIds].map(Number));
    for (const [index, request] of (records.service_requests ?? []).entries())
        if (erasedRequests.has(request.id))
            records.service_requests[index] = redactServiceRequest(request);
    const erase = new Set([...erasedIds].map(Number));
    for (const clientId of erase) {
        const client = (records.clients ?? []).find((c: any) => c.id === clientId);
        if (!client)
            continue;
        const users = (records.users ?? []).filter((u: any) => u.clientId === clientId), userIds = new Set(users.map((u: any) => u.id));
        const vehicles = (records.vehicles ?? []).filter((v: any) => v.clientId === clientId), vehicleIds = new Set(vehicles.map((v: any) => v.id));
        const orders = (records.orders ?? []).filter((o: any) => o.clientId === clientId), orderIds = new Set(orders.map((o: any) => o.id));
        const appointments = (records.appointments ?? []).filter((a: any) => a.clientId === clientId), appointmentIds = new Set(appointments.map((a: any) => a.id));
        const tickets = (records.tickets ?? []).filter((t: any) => t.clientId === clientId), ticketIds = new Set(tickets.map((t: any) => t.id));
        const budgets = (records.budgets ?? []).filter((b: any) => orderIds.has(b.orderId)), budgetIds = new Set(budgets.map((b: any) => b.id));
        const identifiers = [client.name, client.email, client.cpf, client.phone, ...vehicles.flatMap((v: any) => [v.plate, v.chassis])].filter(Boolean);
        const phoneDigits = String(client.phone ?? '').replace(/\D/g, '');
        const plates = new Set(vehicles.map((v: any) => String(v.plate ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()).filter(Boolean));
        for (const [index, request] of (records.service_requests ?? []).entries())
            if (serviceRequestBelongsToClient(request, { clientId, vehicleIds, phoneDigits, plates })) {
                records.service_requests[index] = redactServiceRequest(request);
                erasedRequests.add(request.id);
            }
        const name = 'Cliente anonimizado ' + clientId, email = 'anonimizado-' + clientId + '@oscar.invalid';
        Object.assign(client, { name, email, cpf: '', phone: '', active: false, anonymizedAt: now() });
        for (const user of users)
            Object.assign(user, { name, email: 'anonimizado-user-' + user.id + '@oscar.invalid', active: false });
        for (const credential of snapshot.credentials ?? [])
            if (userIds.has(credential.id))
                credential.passwordHash = passwordHash();
        for (const vehicle of vehicles)
            Object.assign(vehicle, { plate: 'REMOVIDO' + vehicle.id, chassis: '', active: false });
        for (const message of records.emails ?? [])
            if (identifiers.some((id: any) => JSON.stringify(message).includes(id)))
                Object.assign(message, { to: email, subject: 'Dados removidos', text: 'Conteúdo removido por solicitação do titular.', link: null, status: 'anonimizado' });
        for (const order of orders) {
            order.assessmentNotes = '';
            for (const item of [...(order.items ?? []), ...(order.findings ?? [])]) {
                item.approvalNotes = '';
                item.justification = '';
                for (const reversal of item.reversals ?? [])
                    reversal.reason = '';
            }
            for (const check of order.inspections ?? [])
                check.notes = '';
            for (const event of order.timeline ?? [])
                if (userIds.has(event.userId))
                    event.userName = name;
        }
        for (const appointment of appointments)
            appointment.reason = '';
        for (const ticket of tickets)
            Object.assign(ticket, { description: 'Conteúdo removido por solicitação do titular.', notes: '' });
        for (const budget of budgets) {
            budget.tokenHash = null;
            budget.link = null;
            if (budget.status === 'publicado')
                budget.status = 'cancelado';
            for (const item of budget.items ?? []) {
                item.approvalNotes = '';
                item.justification = '';
            }
        }
        for (const entry of records.audit ?? []) {
            const related = userIds.has(entry.actorId)
                || (entry.entity === 'clients' && entry.recordId === clientId)
                || (entry.entity === 'users' && userIds.has(entry.recordId))
                || (entry.entity === 'vehicles' && vehicleIds.has(entry.recordId))
                || (entry.entity === 'orders' && orderIds.has(entry.recordId))
                || (entry.entity === 'appointments' && appointmentIds.has(entry.recordId))
                || (entry.entity === 'tickets' && ticketIds.has(entry.recordId))
                || (entry.entity === 'budgets' && budgetIds.has(entry.recordId));
            if (related) {
                entry.details = { redacted: true };
                if (userIds.has(entry.actorId))
                    entry.actorName = name;
            }
        }
    }
    for (const entry of records.audit ?? [])
        if (entry.entity === 'service_requests' && erasedRequests.has(entry.recordId))
            entry.details = { redacted: true };
    snapshot.erasedClientIds = [...new Set([...(snapshot.erasedClientIds ?? []), ...erase])];
    return snapshot;
}
/**
 * Persistência privada para API REST. O pool é injetável; testes usam PostgreSQL WASM local.
 * Não cria esquema nem usuários em produção. A migração é um arquivo SQL separado.
 */
export async function createPostgresStore({ pool, connectionString, sslCa, max = 1 }: any = {}) {
    const ownPool = !pool;
    const databasePool = pool ?? new Pool(postgresPoolOptions({ connectionString, sslCa, max }));
    const txContext = new AsyncLocalStorage<any>(), exclusiveContext = new AsyncLocalStorage<boolean>();
    let queue = Promise.resolve(), savepoint = 0;
    const execute = async (sql: any, values: any = []) => {
        const client = txContext.getStore()?.client;
        return (client ?? databasePool).query(sql, values);
    };
    const store = {
        dialect: 'postgres', filename: null,
        async runExclusive(operation: any) {
            if (exclusiveContext.getStore())
                return operation();
            const previous = queue;
            let release: () => void = () => {};
            queue = new Promise((resolve: any) => { release = resolve; });
            await previous;
            try {
                return await exclusiveContext.run(true, operation);
            }
            finally {
                release();
            }
        },
        async transaction(operation: any) {
            const parent = txContext.getStore();
            if (parent) {
                const name = 'oscar_sp_' + (++savepoint);
                await parent.client.query('SAVEPOINT ' + name);
                try {
                    const result = await operation();
                    await parent.client.query('RELEASE SAVEPOINT ' + name);
                    return result;
                }
                catch (error) {
                    await parent.client.query('ROLLBACK TO SAVEPOINT ' + name);
                    await parent.client.query('RELEASE SAVEPOINT ' + name);
                    throw error;
                }
            }
            return store.runExclusive(async () => {
                const client = await databasePool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
                    const result = await txContext.run({ client }, operation);
                    await client.query('COMMIT');
                    return result;
                }
                catch (error) {
                    try {
                        await client.query('ROLLBACK');
                    }
                    catch { }
                    throw error;
                }
                finally {
                    client.release();
                }
            });
        },
        db: {
            prepare(sql: any) {
                const query = translateSql(sql);
                return {
                    async all(...values: any[]) { return (await execute(query, values)).rows.map(normalizeRow); },
                    async get(...values: any[]) { return normalizeRow((await execute(query, values)).rows[0]); },
                    async run(...values: any[]) {
                        const match = /^INSERT INTO oscar_private\.([a-z_]+)/i.exec(query);
                        const withId = match && ENTITIES.includes(match[1]) && !/\bRETURNING\b/i.test(query);
                        const result = await execute(query + (withId ? ' RETURNING id' : ''), values);
                        return { changes: result.rowCount ?? result.affectedRows ?? 0,
                            ...(result.rows?.[0]?.id !== undefined ? { lastInsertRowid: Number(result.rows[0].id) } : {}) };
                    },
                };
            },
            async exec(sql: any) {
                // Compactação física é responsabilidade do provedor PostgreSQL; não executar VACUUM em função serverless.
                if (/^(?:\s*(?:PRAGMA[^;]*|VACUUM)\s*;?)+$/i.test(sql))
                    return;
                throw new Error('DDL e SQL livre não são executados pelo adaptador PostgreSQL.');
            },
        },
        async list(table: any) { return (await execute('SELECT data FROM ' + checkTable(table) + ' ORDER BY id DESC')).rows.map((row: any) => clone(row.data)); },
        async get(table: any, id: any) { const row = (await execute('SELECT data FROM ' + checkTable(table) + ' WHERE id=$1', [numericId(id)])).rows[0]; return row ? clone(row.data) : null; },
        async save(table: any, record: any) {
            const target = checkTable(table);
            if (!record || typeof record !== 'object' || Array.isArray(record))
                throw new Error('Registro inválido.');
            const operation = async () => {
                const data = { ...record, updatedAt: now() };
                const hash = table === 'users' ? record.passwordHash : undefined;
                delete data.passwordHash;
                const fields = [...ENTITY_RELATIONS[table], ...(table === 'users' ? ['email'] : [])];
                if (!data.id) {
                    data.createdAt ??= now();
                    const insertFields = [...fields, ...(table === 'users' ? ['passwordHash'] : [])];
                    const values = insertFields.map((key: any) => key === 'passwordHash' ? (hash ?? passwordHash()) : (data[key] ?? null));
                    const columns = insertFields.map((key: any) => key.toLowerCase());
                    const result = await execute('INSERT INTO ' + target + '(data' + (columns.length ? ',' + columns.join(',') : '') + ') VALUES($1'
                        + values.map((_: any, i: any) => ',$' + (i + 2)).join('') + ') RETURNING id', [JSON.stringify(data), ...values]);
                    data.id = Number(result.rows[0].id);
                }
                else {
                    data.id = numericId(data.id);
                    const existing = await store.get(table, data.id);
                    if (!existing)
                        throw new Error('Registro não encontrado para atualização.');
                }
                const values = fields.map((key: any) => data[key] ?? null);
                if (table === 'users' && hash)
                    await execute('UPDATE ' + target + ' SET passwordhash=$1 WHERE id=$2', [hash, data.id]);
                await execute('UPDATE ' + target + ' SET data=$1' + fields.map((key: any, i: any) => ',' + key.toLowerCase() + '=$' + (i + 2)).join('')
                    + ' WHERE id=$' + (values.length + 2), [JSON.stringify(data), ...values, data.id]);
                return clone(data);
            };
            return txContext.getStore() ? operation() : store.transaction(operation);
        },
        async settings() {
            const row = (await execute('SELECT data FROM oscar_private.settings WHERE id=1')).rows[0];
            if (!row)
                throw new Error('Aplique a migração privada do OScar antes de iniciar a API.');
            return clone(row.data);
        },
        async saveSettings(data: any) {
            await execute('INSERT INTO oscar_private.settings(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=excluded.data', [JSON.stringify(data)]);
            return clone(data);
        },
        async audit(actor: any, action: any, entity: any, recordId: any, details: any = {}) {
            return store.save('audit', { actorId: actor?.id ?? null, actorName: actor?.name ?? 'Sistema', action, entity, recordId, date: now(), details });
        },
        async consumeRate(key: any, limit: any, minutes: any, { time = Date.now() }: any = {}) {
            if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(minutes) || minutes <= 0)
                throw new Error('Limite de tentativas inválido.');
            const hash = createHash('sha256').update(String(key)).digest('hex'), expiresAt = time + minutes * 60000;
            const row = (await execute(`INSERT INTO oscar_private.rate_limits(keyhash,count,expiresat) VALUES($1,1,$2)
    ON CONFLICT(keyhash) DO UPDATE SET
     count=CASE WHEN oscar_private.rate_limits.expiresat<=$3 THEN 1 ELSE oscar_private.rate_limits.count+1 END,
     expiresat=CASE WHEN oscar_private.rate_limits.expiresat<=$3 THEN $2 ELSE oscar_private.rate_limits.expiresat END
    RETURNING count,expiresat`, [hash, expiresAt, time])).rows[0];
            const result = { allowed: Number(row.count) <= limit, count: Number(row.count), expiresAt: Number(row.expiresat) };
            return result;
        },
        async backup({ day = now().slice(0, 10) }: any = {}) {
            return store.transaction(async () => {
                const existing = (await execute('SELECT id,createdat FROM oscar_private.backups WHERE day=$1', [day])).rows[0];
                if (existing)
                    return { id: Number(existing.id), day, createdAt: new Date(existing.createdat).toISOString(), storage: 'postgres_private' };
                const records: Record<string, any[]> = {};
                for (const table of ENTITIES)
                    records[table] = await store.list(table);
                for (const budget of records.budgets) {
                    budget.tokenHash = null;
                    budget.link = null;
                    if (budget.status === 'publicado')
                        budget.status = 'expirado';
                }
                for (const message of records.emails)
                    if (message.kind === 'convite' || message.kind === 'recuperacao' || /\/(?:redefinir|orcamento)\//.test(message.text ?? ''))
                        Object.assign(message, { text: 'Links temporários não são incluídos em snapshots.', link: null });
                const credentials = (await execute('SELECT id,passwordhash FROM oscar_private.users')).rows.map((row: any) => ({ id: Number(row.id), passwordHash: row.passwordhash }));
                const erasedIds = (await execute('SELECT clientid FROM oscar_private.privacy_tombstones')).rows.map((row: any) => Number(row.clientid));
                const erasedRequestIds = (await execute('SELECT requestid FROM oscar_private.service_request_tombstones')).rows.map((row: any) => Number(row.requestid));
                const snapshot = redactSnapshot({ version: 1, createdAt: now(), settings: await store.settings(), records, credentials }, erasedIds, erasedRequestIds);
                const result = (await execute('INSERT INTO oscar_private.backups(day,data) VALUES($1,$2) RETURNING id,createdat', [day, JSON.stringify(snapshot)])).rows[0];
                return { id: Number(result.id), day, createdAt: new Date(result.createdat).toISOString(), storage: 'postgres_private' };
            });
        },
        async markErasedClient(clientId: any, actor: any) {
            clientId = numericId(clientId);
            await execute('INSERT INTO oscar_private.privacy_tombstones(clientid,actorid) VALUES($1,$2) ON CONFLICT(clientid) DO NOTHING', [clientId, actor?.id ?? null]);
            return { clientId };
        },
        async purgeClientBackups(clientId: any, actor: any) {
            return store.transaction(async () => {
                clientId = numericId(clientId);
                await execute('INSERT INTO oscar_private.privacy_tombstones(clientid,actorid) VALUES($1,$2) ON CONFLICT(clientid) DO NOTHING', [clientId, actor?.id ?? null]);
                const backups = (await execute('SELECT id,data FROM oscar_private.backups FOR UPDATE')).rows;
                const erasedRequestIds = (await execute('SELECT requestid FROM oscar_private.service_request_tombstones')).rows.map((row: any) => Number(row.requestid));
                for (const row of backups)
                    await execute('UPDATE oscar_private.backups SET data=$1 WHERE id=$2', [JSON.stringify(redactSnapshot(row.data, [clientId], erasedRequestIds)), row.id]);
                return { processed: backups.length, storage: 'postgres_private', physicalRetention: 'provider_managed' };
            });
        },
        async markErasedServiceRequest(requestId: any, actor: any) {
            requestId = numericId(requestId);
            await execute('INSERT INTO oscar_private.service_request_tombstones(requestid,actorid) VALUES($1,$2) ON CONFLICT(requestid) DO NOTHING', [requestId, actor?.id ?? null]);
            return { requestId };
        },
        async purgeServiceRequestBackups(requestId: any, actor: any) {
            return store.transaction(async () => {
                requestId = numericId(requestId);
                await execute('INSERT INTO oscar_private.service_request_tombstones(requestid,actorid) VALUES($1,$2) ON CONFLICT(requestid) DO NOTHING', [requestId, actor?.id ?? null]);
                const backups = (await execute('SELECT id,data FROM oscar_private.backups FOR UPDATE')).rows;
                for (const row of backups)
                    await execute('UPDATE oscar_private.backups SET data=$1 WHERE id=$2', [JSON.stringify(redactSnapshot(row.data, [], [requestId])), row.id]);
                return { processed: backups.length, storage: 'postgres_private', physicalRetention: 'provider_managed' };
            });
        },
        async restoreBackup(id: any) {
            return store.transaction(async () => {
                const row = (await execute('SELECT data FROM oscar_private.backups WHERE id=$1', [numericId(id)])).rows[0];
                if (!row || row.data.version !== 1 || !Array.isArray(row.data.credentials) || !row.data.settings
                    || !ENTITIES.every((table: any) => Array.isArray(row.data.records?.[table])))
                    throw new Error('Snapshot inválido ou não encontrado.');
                const erasedIds = (await execute('SELECT clientid FROM oscar_private.privacy_tombstones')).rows.map((r: any) => Number(r.clientid));
                const erasedRequestIds = (await execute('SELECT requestid FROM oscar_private.service_request_tombstones')).rows.map((r: any) => Number(r.requestid));
                const snapshot = redactSnapshot(row.data, erasedIds, erasedRequestIds);
                await execute('DELETE FROM oscar_private.sessions');
                await execute('DELETE FROM oscar_private.reset_tokens');
                for (const table of [...ENTITIES].reverse())
                    await execute('DELETE FROM ' + checkTable(table));
                for (const table of ENTITIES)
                    for (const record of snapshot.records[table] ?? []) {
                        const keys = ENTITY_RELATIONS[table], fields = ['id', 'data', ...keys.map((k: any) => k.toLowerCase()), ...(table === 'users' ? ['email', 'passwordhash'] : [])];
                        const credential = snapshot.credentials.find((c: any) => c.id === record.id);
                        const values = [record.id, JSON.stringify(record), ...keys.map((k: any) => record[k] ?? null), ...(table === 'users' ? [record.email, credential?.passwordHash ?? passwordHash()] : [])];
                        await execute('INSERT INTO ' + checkTable(table) + '(' + fields.join(',') + ') VALUES(' + values.map((_: any, i: any) => '$' + (i + 1)).join(',') + ')', values);
                    }
                for (const table of ENTITIES) {
                    const maxId = Number((await execute('SELECT COALESCE(MAX(id),0) AS maximum FROM ' + checkTable(table))).rows[0].maximum);
                    await execute('SELECT setval(pg_get_serial_sequence($1,\'id\'),$2,$3)', [SCHEMA + '.' + table, Math.max(1, maxId), maxId > 0]);
                }
                await store.saveSettings(snapshot.settings);
                await store.audit({ name: 'Restauração restrita' }, 'restaurar', 'backup', Number(id), { erasedClientsPreserved: erasedIds.length, erasedRequestsPreserved: erasedRequestIds.length });
                return { restored: true, erasedClientsPreserved: erasedIds.length, erasedRequestsPreserved: erasedRequestIds.length };
            });
        },
        async maintenance() {
            await store.db.prepare('DELETE FROM sessions WHERE lastSeen<?').run(Date.now() - 30 * 60000);
            await store.db.prepare('DELETE FROM reset_tokens WHERE expiresAt<?').run(Date.now() - DAY);
            await execute('DELETE FROM oscar_private.rate_limits WHERE expiresat<$1', [Date.now()]);
            await store.transaction(async () => {
                for (const budget of (await store.list('budgets')).filter((b: any) => b.status === 'publicado' && Date.parse(b.expiresAt) <= Date.now()))
                    await store.save('budgets', { ...budget, status: 'expirado', link: null, tokenHash: null });
            });
            return store.backup();
        },
        async close() { if (ownPool)
            await databasePool.end(); },
    };
    try {
        await store.settings();
    }
    catch (error) {
        if (ownPool)
            await databasePool.end();
        throw error;
    }
    return store;
}
export const createPgStore = createPostgresStore;
