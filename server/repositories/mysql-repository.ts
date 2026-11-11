import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { hashPassword, timestamp } from '../auth-crypto.ts';
import type { EntityName } from '../models.ts';

export interface MysqlOptions {
  host: string; port: number; user: string; password: string; database: string;
  seed?: boolean; importSqlite?: string;
}
export interface WorkshopRecord { id: number; [field: string]: any }
type Row = RowDataPacket & Record<string, any>;
interface Snapshot {
  records: Record<string, WorkshopRecord[]>;
  credentials: { id: number; passwordHash: string }[];
  settings: Record<string, any>;
}
const columns: Record<string, string[]> = {
  clients: ['name','cpf','phone','email','active','registrationStatus'],
  users: ['clientId','name','email','role','active'],
  vehicles: ['clientId','plate','chassis','brand','model','year','mileage','active','registrationStatus'],
  services: ['name','description','price','durationMinutes','purpose','active'],
  suppliers: ['name','cnpj','contact','leadDays','active'],
  parts: ['supplierId','code','description','unit','cost','price','stock','manualMinimum','active'],
  service_requests: ['clientId','vehicleId','appointmentId','name','phone','vehicle','plate','symptoms','status','preferredDate','preferredPeriod','total','durationMinutes'],
  appointments: ['clientId','vehicleId','mechanicId','serviceRequestId','date','time','durationMinutes','status','reason'],
  orders: ['clientId','vehicleId','mechanicId','appointmentId','originOrderId','number','type','status','assessmentNotes','closedAt'],
  budgets: ['orderId','number','status','publishedAt','expiresAt','answeredAt','tokenHash','link'],
  movements: ['partId','orderId','supplierId','userId','type','quantity','date','notes'],
  tickets: ['orderId','clientId','status','description','notes'], emails: [], audit: [],
};
const entityNames = Object.keys(columns) as EntityName[];
const defaults: Record<string, unknown> = {
  active: true, purpose: 'execucao', type: 'normal', leadDays: 0, total: 0, durationMinutes: 0,
};
const defaultSettings = {
  workshopName: 'OScar Oficina', approvalMethods: ['presencial','telefone','mensagem'],
  warrantyDays: 90, consumptionWindowDays: 30, defaultLeadDays: 5,
  budgetValidityHours: 48, openingHour: 8, closingHour: 18, appointmentIntervalMinutes: 30,
};
const quote = (name: string) => '`' + name + '`';
const json = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
function tableName(table: string) {
  if (!Object.hasOwn(columns, table)) throw new Error('Tabela de domínio não permitida.');
  return quote(table);
}
function decode(table: string, row: Row): WorkshopRecord {
  const data = { ...json(row.data), id: Number(row.id) };
  for (const key of columns[table]!) {
    // A janela de consumo usa o instante da saída; a coluna DATE atende aos relatórios por dia.
    if (table==='movements' && key==='date' && typeof data.date==='string' && data.date.includes('T')) continue;
    // Campos únicos opcionais usam NULL no SQL e mantêm a string vazia do contrato da interface.
    if (row[key] === null && data[key] === '') continue;
    if (row[key] !== null || Object.hasOwn(data, key)) data[key] = key === 'active' ? Boolean(row[key]) : row[key];
  }
  delete data.passwordHash;
  return data;
}
function columnValue(key: string, record: Record<string, any>): any {
  const value = record[key] ?? defaults[key] ?? null;
  if (['cpf','cnpj','plate','chassis','preferredDate'].includes(key) && value === '') return null;
  if (['date','preferredDate'].includes(key) && typeof value === 'string') return value.slice(0,10);
  return value === undefined ? null : value;
}

/** O JSON preserva os componentes da O.S.; os campos de negócio e suas relações são colunas SQL. */
export async function createMysqlStore(options: MysqlOptions) {
  if (!['127.0.0.1','localhost','::1'].includes(options.host)) throw new Error('O MySQL do OScar deve ser local.');
  if (!['oscar_local','oscar_test'].includes(options.database)) throw new Error('Use somente os bancos locais exclusivos do OScar.');
  const pool = mysql.createPool({ host: options.host, port: options.port, user: options.user,
    password: options.password, database: options.database, connectionLimit: 5,
    dateStrings: true, decimalNumbers: true, supportBigNumbers: true,
    multipleStatements: false, charset: 'utf8mb4' });
  const transactionContext = new AsyncLocalStorage<PoolConnection>();
  const exclusiveContext = new AsyncLocalStorage<boolean>();
  let queue: Promise<unknown> = Promise.resolve();
  let savepoint = 0;
  const execute = async (sql: string, values: any[] = []) => {
    const connection = transactionContext.getStore() ?? pool;
    return connection.execute(sql, values);
  };
  const rows = async (sql: string, values: any[] = []) => (await execute(sql, values))[0] as Row[];
  const run = async (sql: string, values: any[] = []) => {
    const [result] = await execute(sql, values) as [ResultSetHeader, unknown];
    return { changes: result.affectedRows, lastInsertRowid: result.insertId };
  };
  async function exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    if (exclusiveContext.getStore()) return await operation();
    const result = queue.then(() => exclusiveContext.run(true, operation), () => exclusiveContext.run(true, operation));
    queue = result.catch(() => undefined);
    return await result;
  }
  async function transaction<T>(operation: () => T | Promise<T>): Promise<T> {
    const parent = transactionContext.getStore();
    if (parent) {
      const name = 'oscar_sp_' + (++savepoint);
      await parent.query('SAVEPOINT ' + name);
      try { const value = await operation(); await parent.query('RELEASE SAVEPOINT ' + name); return value; }
      catch (error) { await parent.query('ROLLBACK TO SAVEPOINT ' + name); await parent.query('RELEASE SAVEPOINT ' + name); throw error; }
    }
    return exclusive(async () => {
      const connection = await pool.getConnection();
      const lock = 'oscar:' + options.database + ':mutation';
      let acquired = false;
      try {
        const [answer] = await connection.execute<Row[]>('SELECT GET_LOCK(?, 10) AS acquired', [lock]);
        acquired = Number(answer[0]?.acquired) === 1;
        if (!acquired) throw new Error('Outra operação está em andamento. Tente novamente.');
        await connection.beginTransaction();
        const value = await transactionContext.run(connection, operation);
        await connection.commit();
        return value;
      } catch (error) { await connection.rollback(); throw error; }
      finally { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); connection.release(); }
    });
  }
  async function syncComponents(table: string, record: WorkshopRecord) {
    if (table === 'appointments') {
      await execute('DELETE FROM appointment_services WHERE appointmentId=?', [record.id]);
      for (const serviceId of new Set<number>(record.serviceIds ?? []))
        await execute('INSERT INTO appointment_services(appointmentId,serviceId) VALUES(?,?)', [record.id, serviceId]);
    }
    if (table === 'orders') {
      await execute('DELETE FROM order_items WHERE orderId=?', [record.id]);
      for (const section of ['items','findings']) for (const item of record[section] ?? [])
        await execute('INSERT INTO order_items(orderId,itemId,section,serviceId,partId,kind,description,quantity,price,decision,data) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          [record.id,String(item.id),section,item.serviceId ?? null,item.partId ?? null,item.kind,item.description,
            item.quantity,item.price,item.decision,JSON.stringify(item)]);
    }
  }
  async function save(table: string, input: Record<string, any>): Promise<WorkshopRecord> {
    tableName(table);
    return transaction(async () => {
      const record: WorkshopRecord = { ...input, id: Number(input.id ?? 0), updatedAt: timestamp() };
      record.createdAt ??= timestamp();
      const existing = record.id ? (await rows('SELECT id FROM ' + tableName(table) + ' WHERE id=?', [record.id]))[0] : null;
      const keys = [...columns[table]!];
      const values = keys.map(key => columnValue(key, record));
      if (table === 'users' && (!existing || input.passwordHash)) {
        keys.push('passwordHash'); values.push(input.passwordHash ?? hashPassword(randomBytes(32).toString('hex')));
      }
      delete record.passwordHash;
      keys.push('data'); values.push(JSON.stringify(record));
      if (existing) {
        await execute('UPDATE ' + tableName(table) + ' SET ' + keys.map(key => quote(key) + '=?').join(',') + ' WHERE id=?', [...values,record.id]);
      } else {
        if (record.id) { keys.unshift('id'); values.unshift(record.id); }
        const inserted = await run('INSERT INTO ' + tableName(table) + '(' + keys.map(quote).join(',') + ') VALUES(' + keys.map(() => '?').join(',') + ')', values);
        record.id ||= inserted.lastInsertRowid;
        await execute('UPDATE ' + tableName(table) + ' SET data=? WHERE id=?', [JSON.stringify(record),record.id]);
      }
      await syncComponents(table, record);
      return structuredClone(record);
    });
  }
  const store = {
    dialect: 'mysql', filename: null,
    db: {
      prepare(sql: string) {
        if (!/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql.trim()) || /;\s*\S/.test(sql)) throw new Error('SQL interno não permitido.');
        return { all: (...values: any[]) => rows(sql, values),
          get: async (...values: any[]) => (await rows(sql, values))[0],
          run: (...values: any[]) => run(sql, values) };
      },
      async exec(sql: string) { await execute(sql); },
    },
    runExclusive: exclusive, transaction, save,
    async list(table: string): Promise<WorkshopRecord[]> {
      return (await rows('SELECT * FROM ' + tableName(table) + ' ORDER BY id DESC')).map(row => decode(table,row));
    },
    async get(table: string, id: number | string): Promise<WorkshopRecord | null> {
      const result = (await rows('SELECT * FROM ' + tableName(table) + ' WHERE id=?', [Number(id)]))[0];
      return result ? decode(table,result) : null;
    },
    async remove(table: string, id: number) { return (await run('DELETE FROM ' + tableName(table) + ' WHERE id=?', [id])).changes > 0; },
    async settings() { const row = (await rows('SELECT data FROM settings WHERE id=1'))[0]; return row ? json(row.data) : structuredClone(defaultSettings); },
    async saveSettings(data: Record<string, any>) {
      await execute('INSERT INTO settings(id,data) VALUES(1,?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [JSON.stringify(data)]); return data;
    },
    async audit(actor: Record<string, any> | null, action: string, entity: string, recordId: number, details = {}) {
      return save('audit', { actorId: actor?.id ?? null, actorName: actor?.name ?? 'Sistema', action, entity, recordId, date: timestamp(), details });
    },
    async appointmentsByDate(date: string, mechanicId?: number | null) {
      return (await rows(`SELECT a.*, c.name AS clientName, v.plate AS vehiclePlate, u.name AS mechanicName
        FROM appointments a JOIN clients c ON c.id=a.clientId JOIN vehicles v ON v.id=a.vehicleId
        JOIN users u ON u.id=a.mechanicId WHERE a.date=? AND (?=0 OR a.mechanicId=?) ORDER BY a.time,a.id`,
        [date,mechanicId ?? 0,mechanicId ?? 0])).map(row => ({ ...decode('appointments',row),clientName:row.clientName,vehiclePlate:row.vehiclePlate,mechanicName:row.mechanicName }));
    },
    async lowStockParts() {
      const settings = await store.settings();
      const windowDays = settings.consumptionWindowDays ?? 30;
      const now = timestamp();
      const start = new Date(Date.parse(now)-windowDays*86400000).toISOString();
      const historyLimit = new Date(Date.parse(now)-Math.max(30,windowDays)*86400000).toISOString();
      const result = await rows(`SELECT p.*,
        CASE WHEN p.manualMinimum IS NOT NULL THEN CEIL(p.manualMinimum)
          WHEN COALESCE(NULLIF(p.data->>'$.historyStartedAt','null'),p.data->>'$.createdAt')<=?
          THEN CEIL(ROUND(GREATEST(COALESCE(m.net,0),0)/?*COALESCE(s.leadDays,?),12)) ELSE 0 END AS minimum
        FROM parts p LEFT JOIN suppliers s ON s.id=p.supplierId
        LEFT JOIN (SELECT partId,SUM(CASE WHEN type='saida' THEN quantity ELSE -quantity END) AS net
          FROM movements WHERE type IN ('saida','estorno') AND data->>'$.date' BETWEEN ? AND ? GROUP BY partId) m ON m.partId=p.id
        WHERE p.active=1 HAVING p.stock<=minimum ORDER BY p.stock,p.id`,
        [historyLimit,windowDays,settings.defaultLeadDays ?? 5,start,now]);
      return result.map(row=>({...decode('parts',row),minimum:Number(row.minimum),lowStock:true}));
    },
    async reportOrders(mechanicId: number | null = null) {
      return (await rows(`SELECT o.*,c.name AS clientName,v.plate AS vehiclePlate FROM orders o
        JOIN clients c ON c.id=o.clientId JOIN vehicles v ON v.id=o.vehicleId
        WHERE (?=0 OR o.mechanicId=?) ORDER BY o.id DESC`, [mechanicId ?? 0,mechanicId ?? 0]))
        .map(row => ({order:decode('orders',row),clientName:row.clientName,vehiclePlate:row.vehiclePlate}));
    },
    async reportPartConsumption(from: string, to: string, mechanicId: number | null = null) {
      return (await rows(`SELECT p.id AS partId,p.data AS partData,
        ROUND(SUM(CASE WHEN m.type='saida' THEN m.quantity ELSE -m.quantity END),3) AS quantity
        FROM movements m JOIN parts p ON p.id=m.partId LEFT JOIN orders o ON o.id=m.orderId
        WHERE m.type IN ('saida','estorno') AND m.date BETWEEN ? AND ? AND (?=0 OR o.mechanicId=?)
        GROUP BY p.id HAVING quantity<>0 ORDER BY p.id`, [from,to,mechanicId ?? 0,mechanicId ?? 0]))
        .map(row => ({partId:Number(row.partId),part:json(row.partData),quantity:Number(row.quantity)}));
    },
    async markErasedClient(id: number) { await execute('INSERT INTO privacy_tombstones(id,erasedAt) VALUES(?,?) ON DUPLICATE KEY UPDATE erasedAt=VALUES(erasedAt)', [id,timestamp()]); },
    async markErasedServiceRequest(id: number) { await execute('INSERT INTO service_request_tombstones(id,erasedAt) VALUES(?,?) ON DUPLICATE KEY UPDATE erasedAt=VALUES(erasedAt)', [id,timestamp()]); },
    async backup() {
      return transaction(async () => {
      const day = timestamp().slice(0,10);
      const previous = (await rows('SELECT id,createdAt FROM backups WHERE day=?',[day]))[0];
      if (previous) return { id:previous.id,day,createdAt:previous.createdAt,storage:'mysql_local' };
      const payload: Snapshot = {records:{},credentials:await rows('SELECT id,passwordHash FROM users') as Snapshot['credentials'],settings:await store.settings()};
      for (const table of entityNames) payload.records[table] = await store.list(table);
      for (const budget of payload.records.budgets ?? []) {
        budget.tokenHash=null; budget.link=null;
        if (budget.status==='publicado') budget.status='expirado';
      }
      for (const message of payload.records.emails ?? [])
        if (['convite','recuperacao'].includes(message.kind) || /\/(?:redefinir|orcamento)\//.test(message.text ?? ''))
          Object.assign(message,{text:'Links temporários não são incluídos nas cópias de segurança.',link:null});
      const createdAt = timestamp();
      await execute('INSERT IGNORE INTO backups(day,createdAt,payload) VALUES(?,?,?)',[day,createdAt,JSON.stringify(payload)]);
      return {day,createdAt,storage:'mysql_local'};
      });
    },
    async purgeClientBackups(id: number, actor: Record<string, any>) { return purgeSnapshots('client',id,actor); },
    async purgeServiceRequestBackups(id: number, actor: Record<string, any>) { return purgeSnapshots('request',id,actor); },
    async maintenance() {
      await transaction(async () => {
        await execute('DELETE FROM sessions WHERE lastSeen<?',[Date.now()-1800000]);
        await execute('DELETE FROM reset_tokens WHERE expiresAt<?',[Date.now()-86400000]);
        for (const budget of await store.list('budgets')) if (budget.status==='publicado' && Date.parse(budget.expiresAt)<=Date.now())
          await save('budgets',{...budget,status:'expirado',link:null});
      });
      return {backup:await store.backup()};
    },
    async close() { await pool.end(); },
  };
  async function purgeSnapshots(kind: 'client' | 'request', id: number, actor: Record<string, any>) {
    return transaction(async () => {
    const privacy = await import('../privacy.ts');
    let processed = 0;
    for (const row of await rows('SELECT id,payload FROM backups')) {
      const snapshot = json(row.payload) as Snapshot;
      const adapter = {
        list: async (table: string) => snapshot.records[table] ?? [],
        get: async (table: string, key: number) => snapshot.records[table]?.find(record => record.id===Number(key)) ?? null,
        save: async (table: string, input: Record<string, any>) => {
          const data = {...input} as WorkshopRecord;
          const records = snapshot.records[table] ??= [];
          if (table==='users' && data.passwordHash) {
            const credential = snapshot.credentials.find(item => item.id===data.id);
            if (credential) credential.passwordHash=data.passwordHash;
            delete data.passwordHash;
          }
          data.id ||= Math.max(0,...records.map(item=>item.id))+1;
          const position = records.findIndex(item=>item.id===data.id);
          if (position<0) records.push(data); else records[position]=data;
          return data;
        },
        audit: async () => undefined,
        db:{prepare:() => ({run:async()=>undefined})},
      };
      if (kind==='client' && await adapter.get('clients',id)) await privacy.anonymizeClient(adapter,id,actor);
      if (kind==='request' && await adapter.get('service_requests',id)) await privacy.anonymizeServiceRequest(adapter,id,actor);
      await execute('UPDATE backups SET payload=? WHERE id=?',[JSON.stringify(snapshot),row.id]); processed++;
    }
    return {processed,storage:'mysql_local'};
    });
  }
  try {
    const sql = readFileSync(new URL('./mysql-schema.sql',import.meta.url),'utf8');
    for (const statement of sql.split(';').map(value=>value.trim()).filter(Boolean)) await pool.query(statement);
    const supplierName=(await rows('SELECT CHARACTER_MAXIMUM_LENGTH AS maxLength FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[options.database,'suppliers','name']))[0];
    if(Number(supplierName?.maxLength)<160)await pool.query('ALTER TABLE suppliers MODIFY name VARCHAR(160) NOT NULL');
    const fk = await rows('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND CONSTRAINT_NAME=?',[options.database,'fk_request_appointment']);
    if (!fk.length) await pool.query('ALTER TABLE service_requests ADD CONSTRAINT fk_request_appointment FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE RESTRICT');
    if (!(await rows('SELECT id FROM settings WHERE id=1')).length) await store.saveSettings(defaultSettings);
    if (options.seed!==false && !(await rows('SELECT id FROM users LIMIT 1')).length) {
      let source: any;
      const records: Record<string, WorkshopRecord[]> = {};
      let credentials: Row[];
      let settings: Record<string, any>;
      if (options.importSqlite && existsSync(options.importSqlite)) {
        source = new DatabaseSync(options.importSqlite,{readOnly:true});
        for (const table of entityNames) records[table]=source.prepare('SELECT data FROM '+table+' ORDER BY id').all().map((row: any)=>JSON.parse(row.data));
        credentials=source.prepare('SELECT id,passwordHash FROM users').all();
        settings=JSON.parse(source.prepare('SELECT data FROM settings WHERE id=1').get().data);
      } else {
        const {createStore} = await import('../store.ts'); source=createStore({filename:':memory:'});
        for (const table of entityNames) records[table]=await source.list(table);
        credentials=source.db.prepare('SELECT id,passwordHash FROM users').all(); settings=await source.settings();
      }
      try {
        await transaction(async () => {
          await store.saveSettings(settings);
          for (const table of entityNames) for (const record of records[table] ?? []) {
            const data={...record};
            if(table==='users')data.passwordHash=credentials.find(row=>row.id===data.id)?.passwordHash;
            if(table==='service_requests')data.appointmentId=null;
            if(table==='orders')data.originOrderId=null;
            await save(table,data);
          }
          for(const record of records.service_requests ?? []) if(record.appointmentId)await save('service_requests',record);
          for(const record of records.orders ?? []) if(record.originOrderId)await save('orders',record);
        });
      } finally { await source.close(); }
    }
    return store;
  } catch (error) { await pool.end(); throw error; }
}
