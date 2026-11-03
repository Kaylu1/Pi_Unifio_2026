import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStore, postgresPoolOptions, ENTITY_RELATIONS } from '../server/postgres-store.mjs';
import { createPgFixture } from './helpers/postgres-fixture.mjs';
import { anonymizeClient, anonymizeServiceRequest, purgeClientBackups, purgeServiceRequestBackups } from '../server/privacy.mjs';

let fixture, store, db, defaults;
before(async()=>{fixture=await createPgFixture();({store,db}=fixture);defaults=await store.settings();});
after(async()=>{await fixture?.close();});
beforeEach(async()=>{
 await db.exec('RESET ROLE');
 const tables=[...Object.keys(ENTITY_RELATIONS),'settings','sessions','reset_tokens','rate_limits','backups','privacy_tombstones','service_request_tombstones'];
 await db.exec('TRUNCATE '+tables.map(t=>'oscar_private.'+t).join(',')+' RESTART IDENTITY CASCADE');
 await store.saveSettings(defaults);
});
async function seed() {
 const client=await store.save('clients',{name:'Titular Privado',cpf:'12345678909',phone:'14999998888',email:'titular@example.test',active:true});
 const other=await store.save('clients',{name:'Outro Cliente',cpf:'98765432100',phone:'14988887777',email:'outro@example.test',active:true});
 const user=await store.save('users',{name:'Mecânico Teste',email:'mecanico@example.test',role:'mecanico',active:true,clientId:null});
 const customer=await store.save('users',{name:client.name,email:client.email,role:'cliente',active:true,clientId:client.id});
 const vehicle=await store.save('vehicles',{clientId:client.id,plate:'ABC1D23',chassis:'9BWZZZ377VT004251',brand:'VW',model:'Polo',year:2021,mileage:1000,active:true});
 const supplier=await store.save('suppliers',{name:'Fornecedor Teste',cnpj:'11222333000181',contact:'compras@example.test',leadDays:5,active:true});
 const part=await store.save('parts',{code:'PF-001',description:'Peça Teste',stock:5,price:25,cost:10,unit:'UN',supplierId:supplier.id,active:true});
 const service=await store.save('services',{name:'Inspeção',description:'Serviço',price:50,durationMinutes:30,inspectionItems:['Verificar'],active:true});
 const order=await store.save('orders',{clientId:client.id,vehicleId:vehicle.id,mechanicId:user.id,appointmentId:null,originOrderId:null,status:'aberta',
  number:1001,items:[{id:'item-a',kind:'servico',description:'Inspeção',quantity:1,price:50,total:50,decision:'aprovado',approvalNotes:client.email,justification:client.phone}],
  inspections:[{id:'check-a',notes:client.cpf}],findings:[],timeline:[{status:'aberta',userId:customer.id,userName:client.name}]});
 return{client,other,user,customer,vehicle,supplier,part,service,order};
}

describe('Migração privada PostgreSQL executada no PGlite local',()=>{
 test('reaplicar preserva dados/parâmetros e não cria usuários ou senha demonstrativa',async()=>{
  await store.saveSettings({...defaults,warrantyDays:120});
  await db.exec(fixture.migration);
  await db.exec(fixture.serviceRequestsMigration);
  assert.equal((await store.settings()).warrantyDays,120);
  assert.deepEqual(await store.list('users'),[]);
  const count=await db.query("SELECT count(*)::integer AS total FROM pg_tables WHERE schemaname='oscar_private'");
  assert.equal(count.rows[0].total,21);
 });
 test('todas as tabelas têm RLS e anon/authenticated não recebem acesso',async()=>{
  const policy=await db.query("SELECT count(*)::integer AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='oscar_private' AND c.relkind='r' AND c.relrowsecurity");
  assert.equal(policy.rows[0].total,21);
  for(const role of ['anon','authenticated']){
   const grant=await db.query("SELECT has_schema_privilege($1,'oscar_private','USAGE') AS schema_access,has_table_privilege($1,'oscar_private.clients','SELECT') AS read_access",[role]);
   assert.equal(grant.rows[0].schema_access,false);
   assert.equal(grant.rows[0].read_access,false);
   const requestGrant=await db.query("SELECT has_table_privilege($1,'oscar_private.service_requests','SELECT') AS read_access",[role]);
   assert.equal(requestGrant.rows[0].read_access,false);
   const tombstoneGrant=await db.query("SELECT has_table_privilege($1,'oscar_private.service_request_tombstones','SELECT') AS read_access",[role]);
   assert.equal(tombstoneGrant.rows[0].read_access,false);
   await db.exec('SET ROLE '+role);
   await assert.rejects(db.query('SELECT * FROM oscar_private.clients'),error=>error.code==='42501');
   await assert.rejects(db.query('SELECT * FROM oscar_private.service_requests'),error=>error.code==='42501');
   await db.exec('RESET ROLE');
  }
 });
 test('RLS permanece deny-by-default mesmo diante de grant acidental de SELECT',async()=>{
  await seed();
  await db.exec('GRANT USAGE ON SCHEMA oscar_private TO authenticated; GRANT SELECT ON oscar_private.clients TO authenticated; SET ROLE authenticated');
  assert.deepEqual((await db.query('SELECT * FROM oscar_private.clients')).rows,[]);
  await db.exec('RESET ROLE; REVOKE ALL ON SCHEMA oscar_private FROM authenticated; REVOKE ALL ON oscar_private.clients FROM authenticated');
 });
 test('SQL impõe unicidade normalizada de CPF/placa/código e chaves estrangeiras',async()=>{
  const data=await seed();
  await assert.rejects(store.save('clients',{name:'Duplicado',cpf:'123.456.789-09',email:'novo@example.test',active:true}),error=>error.code==='23505');
  await assert.rejects(store.save('vehicles',{...data.vehicle,id:undefined,clientId:data.other.id,plate:'abc-1d23'}),error=>error.code==='23505');
  await assert.rejects(store.save('parts',{...data.part,id:undefined,code:'pf-001'}),error=>error.code==='23505');
  await assert.rejects(store.save('vehicles',{...data.vehicle,id:undefined,clientId:999,plate:'DEF4G56'}),error=>error.code==='23503');
  await assert.rejects(store.save('parts',{...data.part,stock:-1}),error=>error.code==='23514');
  assert.equal((await store.get('parts',data.part.id)).stock,5);
 });
});

describe('Store assíncrono, transações e operações fixas da autenticação',()=>{
 test('CRUD mantém JSONB, relações e hash separado; não muta objeto recebido',async()=>{
  const data=await seed(),client=Object.freeze({...data.client,name:'Nome atualizado'});
  assert.equal((await store.save('clients',client)).name,'Nome atualizado');
  const record=await store.get('clients',client.id);record.name='Mudança apenas na cópia';
  assert.equal((await store.get('clients',client.id)).name,'Nome atualizado');
  assert.equal((await store.list('clients')).length,2);
  assert.equal(Object.hasOwn(await store.get('users',data.user.id),'passwordHash'),false);
  const auth=await store.db.prepare('SELECT id,passwordHash,clientId FROM users WHERE id=?').get(data.user.id);
  assert.match(auth.passwordHash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(typeof auth.id,'number');
  assert.equal(auth.clientId,null);
  assert.equal(client.name,'Nome atualizado');
 });
 test('erro faz rollback de saldo, movimento e auditoria na mesma transação',async()=>{
  const data=await seed();
  await assert.rejects(store.transaction(async()=>{
   await store.save('parts',{...data.part,stock:3});
   await store.save('movements',{partId:data.part.id,orderId:data.order.id,supplierId:data.supplier.id,type:'saida',quantity:2,date:new Date().toISOString()});
   await store.audit(data.user,'alterar','parts',data.part.id);
   throw new Error('Falha simulada após escritas.');
  }),/Falha simulada/);
  assert.equal((await store.get('parts',data.part.id)).stock,5);
  assert.deepEqual(await store.list('movements'),[]);
  assert.deepEqual(await store.list('audit'),[]);
 });
 test('savepoint desfaz transação aninhada sem perder a operação externa',async()=>{
  const data=await seed();
  await store.runExclusive(()=>store.transaction(async()=>{
   await store.save('parts',{...data.part,stock:4});
   await assert.rejects(store.transaction(async()=>{
    await store.save('parts',{...data.part,stock:1});
    throw new Error('Reverter etapa');
   }),/Reverter etapa/);
   assert.equal((await store.get('parts',data.part.id)).stock,4);
   await store.audit(data.user,'alterar','parts',data.part.id);
  }));
  assert.equal((await store.get('parts',data.part.id)).stock,4);
  assert.equal((await store.list('audit')).length,1);
 });
 test('dois stores compartilham saldo sem perda de atualização ou venda negativa',async()=>{
  const data=await seed(),second=await createPostgresStore({pool:fixture.pool});
  const consume=async(s)=>s.transaction(async()=>{
   const current=await s.get('parts',data.part.id);
   if(current.stock<1)return false;
   await new Promise(resolve=>setTimeout(resolve,1));
   await s.save('parts',{...current,stock:current.stock-1});
   await s.save('movements',{partId:data.part.id,orderId:data.order.id,supplierId:data.supplier.id,type:'saida',quantity:1,date:new Date().toISOString()});
   return true;
  });
  const decisions=await Promise.all(Array.from({length:12},(_,i)=>consume(i%2?store:second)));
  assert.equal(decisions.filter(Boolean).length,5);
  assert.equal((await store.get('parts',data.part.id)).stock,0);
  assert.equal((await store.list('movements')).length,5);
 });
 test('prepare adapta placeholders e nomes de campos de sessões/recuperação',async()=>{
  const data=await seed();
  const token='a'.repeat(64),csrf='csrf-teste',reference=1700000000000;
  await store.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run(token,data.user.id,csrf,reference);
  const session=await store.db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  assert.deepEqual(session,{token,userId:data.user.id,csrf,lastSeen:reference});
  await store.db.prepare('UPDATE sessions SET lastSeen=? WHERE token=?').run(reference+1,token);
  assert.equal((await store.db.prepare('SELECT * FROM sessions WHERE token=?').get(token)).lastSeen,reference+1);
  await store.db.prepare('INSERT INTO reset_tokens(token,userId,expiresAt) VALUES(?,?,?)').run(token,data.user.id,reference+1000);
  assert.equal((await store.db.prepare('SELECT * FROM reset_tokens WHERE token=?').get(token)).expiresAt,reference+1000);
  await store.db.prepare('UPDATE reset_tokens SET used=1 WHERE userId=?').run(data.user.id);
  assert.equal((await store.db.prepare('SELECT * FROM reset_tokens WHERE token=?').get(token)).used,1);
  assert.equal((await store.db.prepare('DELETE FROM sessions WHERE userId=?').run(data.user.id)).changes,1);
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).count,0);
  assert.deepEqual(await store.db.prepare("SELECT '?' AS literal, ? AS value").get('teste'),{literal:'?',value:'teste'});
  assert.throws(()=>store.db.prepare('SELECT * FROM public.users'),/não permitida/);
  assert.throws(()=>store.db.prepare('SELECT * FROM users; DELETE FROM clients'),/não permitido/);
 });
 test('limite de tentativas é persistente, atômico, compartilhado e expira sem prolongar janela',async()=>{
  const second=await createPostgresStore({pool:fixture.pool}),reference=1700000000000;
  const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?store:second).consumeRate('login:privado@example.test',5,15,{time:reference+i})));
  assert.equal(results.filter(r=>r.allowed).length,5);
  assert.equal(Math.max(...results.map(r=>r.count)),20);
  assert.ok(results.every(r=>r.expiresAt===reference+15*60000));
  const rows=(await db.query('SELECT * FROM oscar_private.rate_limits')).rows;
  assert.equal(rows.length,1);
  assert.equal(JSON.stringify(rows).includes('privado@example.test'),false);
  const expired=await store.consumeRate('login:privado@example.test',5,15,{time:reference+15*60000});
  assert.equal(expired.allowed,true);assert.equal(expired.count,1);
 });
});

test('solicitações públicas são privadas, persistidas e restauradas no PostgreSQL local',async()=>{
 const request=await store.save('service_requests',{
  name:'Cliente de teste',phone:'14999998888',vehicle:'Polo 2021',plate:'ABC1D23',
  symptoms:'Luz de injeção acesa',serviceIds:[5],services:[{id:5,name:'Diagnóstico eletrônico',price:150,durationMinutes:60,purpose:'avaliacao'}],
  total:150,durationMinutes:60,status:'pendente',preferredDate:'',preferredPeriod:''
 });
 assert.equal((await store.get('service_requests',request.id)).status,'pendente');
 assert.equal((await store.list('service_requests'))[0].phone,'14999998888');
 const backup=await store.backup({day:'2026-10-25'});
 const snapshot=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[backup.id])).rows[0].data;
 assert.equal(snapshot.records.service_requests.length,1);
 assert.equal(snapshot.records.service_requests[0].total,150);
 await store.save('service_requests',{...request,status:'em_contato'});
 await store.restoreBackup(backup.id);
 assert.equal((await store.get('service_requests',request.id)).status,'pendente');
});
test('anonimização da solicitação expurga snapshots e tombstone impede restauração de dados pessoais',async()=>{
 const request=await store.save('service_requests',{
  name:'Pessoa Sensível',phone:'14977776666',vehicle:'Polo Especial',plate:'ZZZ9Z99',
  symptoms:'Relato pessoal sigiloso',notes:'Campo livre sigiloso',
  serviceIds:[1],services:[{id:1,name:'Diagnóstico',price:100,durationMinutes:30}],
  total:100,durationMinutes:30,status:'pendente'
 });
 const old=await store.backup({day:'2026-10-26'});
 const original=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[old.id])).rows[0].data;
 await store.transaction(()=>anonymizeServiceRequest(store,request.id,{id:null,name:'Gerente'}));
 await purgeServiceRequestBackups(store,request.id,{id:null,name:'Gerente'});
 const purged=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[old.id])).rows[0].data;
 for(const secret of ['Pessoa Sensível','14977776666','Polo Especial','ZZZ9Z99','Relato pessoal sigiloso','Campo livre sigiloso'])
  assert.equal(JSON.stringify(purged).includes(secret),false,secret);
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM oscar_private.service_request_tombstones')).rows[0].total,1);
 await db.query('UPDATE oscar_private.backups SET data=$1 WHERE id=$2',[JSON.stringify(original),old.id]);
 await store.restoreBackup(old.id);
 const restored=await store.get('service_requests',request.id);
 assert.equal(restored.name,'Solicitação anonimizada');
 assert.equal(restored.phone,'');
 assert.equal(restored.status,'cancelada');
 assert.equal(restored.notes,undefined);
 const fresh=await store.backup({day:'2026-10-27'});
 const snapshot=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[fresh.id])).rows[0].data;
 assert.equal(JSON.stringify(snapshot).includes('Pessoa Sensível'),false);
});
test('anonimizar cliente também remove solicitações ligadas por telefone ou placa',async()=>{
 const data=await seed();
 const linked=await store.save('service_requests',{
  name:'Pessoa vinculada',phone:data.client.phone,vehicle:'Polo pessoal',plate:data.vehicle.plate,
  symptoms:'Sintoma sigiloso',serviceIds:[],services:[],total:0,durationMinutes:0,status:'pendente'
 });
 const unrelated=await store.save('service_requests',{
  name:'Outra pessoa',phone:'11911112222',vehicle:'Outro carro',plate:'AAA1A11',
  symptoms:'Outro sintoma',serviceIds:[],services:[],total:0,durationMinutes:0,status:'pendente'
 });
 const backup=await store.backup({day:'2026-10-28'});
 const original=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[backup.id])).rows[0].data;
 await store.transaction(()=>anonymizeClient(store,data.client.id,data.user));
 await purgeClientBackups(store,data.client.id,data.user);
 assert.equal((await store.get('service_requests',linked.id)).phone,'');
 assert.equal((await store.get('service_requests',unrelated.id)).name,'Outra pessoa');
 const purged=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[backup.id])).rows[0].data;
 assert.equal(JSON.stringify(purged).includes('Sintoma sigiloso'),false);
 assert.equal(JSON.stringify(purged).includes('Outro sintoma'),true);
 await db.query('UPDATE oscar_private.backups SET data=$1 WHERE id=$2',[JSON.stringify(original),backup.id]);
 await store.restoreBackup(backup.id);
 assert.equal((await store.get('service_requests',linked.id)).symptoms,'');
 assert.equal((await store.get('service_requests',unrelated.id)).symptoms,'Outro sintoma');
});
describe('Snapshots privados e prevenção de restauração de dados apagados',()=>{
 test('backup diário é idempotente e não armazena sessões, tokens nem links temporários',async()=>{
  const data=await seed();
  await store.save('budgets',{orderId:data.order.id,number:2001,status:'publicado',tokenHash:'segredo-token-hash',link:'/orcamento/segredo-link',items:[]});
  await store.save('emails',{to:data.client.email,kind:'recuperacao',text:'Defina em https://oficina.test/redefinir/token-secreto',link:'https://oficina.test/redefinir/token-secreto'});
  await store.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run('sessao-privada',data.customer.id,'csrf-privado',Date.now());
  const first=await store.backup({day:'2026-10-22'}),second=await store.backup({day:'2026-10-22'});
  assert.equal(first.id,second.id);
  const snapshot=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[first.id])).rows[0].data;
  for(const secret of ['sessao-privada','csrf-privado','segredo-token-hash','segredo-link','token-secreto'])
   assert.equal(JSON.stringify(snapshot).includes(secret),false,secret);
  assert.equal(snapshot.records.sessions,undefined);
  assert.equal(snapshot.records.reset_tokens,undefined);
  assert.equal(snapshot.records.rate_limits,undefined);
  assert.equal(snapshot.records.orders.length,1);
  assert.ok(snapshot.credentials.length>0);
 });
 test('tombstone impede reintrodução de PII até ao restaurar uma versão antiga importada',async()=>{
  const data=await seed(),backup=await store.backup({day:'2026-10-22'});
  const original=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[backup.id])).rows[0].data;
  const result=await store.purgeClientBackups(data.client.id,{id:data.user.id});
  assert.equal(result.processed,1);
  const redacted=(await db.query('SELECT data FROM oscar_private.backups WHERE id=$1',[backup.id])).rows[0].data;
  for(const secret of [data.client.name,data.client.email,data.client.cpf,data.client.phone,data.vehicle.chassis,data.vehicle.plate])
   assert.equal(JSON.stringify(redacted).includes(secret),false,secret);
  assert.equal(redacted.records.clients.find(c=>c.id===data.other.id).name,data.other.name);
  // Simula importação restrita de uma cópia antiga, anterior à solicitação do titular.
  await db.query('UPDATE oscar_private.backups SET data=$1 WHERE id=$2',[JSON.stringify(original),backup.id]);
  await store.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run('sessao-antiga',data.customer.id,'csrf-antigo',Date.now());
  const restored=await store.restoreBackup(backup.id);
  assert.equal(restored.restored,true);
  const client=await store.get('clients',data.client.id);
  assert.equal(client.active,false);assert.equal(client.cpf,'');assert.equal(client.phone,'');
  assert.equal((await store.get('users',data.customer.id)).active,false);
  assert.equal((await store.get('clients',data.other.id)).name,data.other.name);
  assert.equal((await store.get('vehicles',data.vehicle.id)).chassis,'');
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).count,0);
  assert.equal((await store.list('orders')).length,1);
  for(const table of Object.keys(ENTITY_RELATIONS))for(const secret of [data.client.name,data.client.email,data.client.cpf,data.client.phone,data.vehicle.chassis])
   assert.equal(JSON.stringify(await store.list(table)).includes(secret),false,table+':'+secret);
  const next=await store.save('clients',{name:'Depois do restore',cpf:'11144477735',email:'novo@example.test',active:true});
  assert.ok(next.id>data.other.id);
 });
});

test('Pool serverless usa TLS verificado, no máximo três conexões e não deixa URI sobrescrever SSL',()=>{
 const input='postgresql://postgres.projeto:senha@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require&sslcert=externo&options=nao-usar';
 const options=postgresPoolOptions({connectionString:input});
 assert.equal(options.max,1);
 assert.equal(options.ssl.rejectUnauthorized,true);
 assert.equal(options.connectionString.includes('?'),false);
 assert.equal(options.connectionString.includes('senha'),true);
 assert.equal(options.name,undefined);
 assert.throws(()=>postgresPoolOptions({connectionString:input,max:4}),/1 a 3/);
 assert.throws(()=>postgresPoolOptions({connectionString:input.replace('sslmode=require','sslmode=disable')}),/TLS/);
 assert.throws(()=>postgresPoolOptions({connectionString:'https://example.test'}),/PostgreSQL/);
});

test('marcador de exclusão participa da transação e protege restore antes do expurgo dos snapshots',async()=>{
 const data=await seed(),backup=await store.backup({day:'2026-10-23'});
 await assert.rejects(store.transaction(async()=>{
  await store.markErasedClient(data.client.id,data.user);
  throw new Error('Cancelar exclusão');
 }),/Cancelar exclusão/);
 assert.equal((await db.query('SELECT count(*)::integer AS total FROM oscar_private.privacy_tombstones')).rows[0].total,0);
 await store.transaction(()=>store.markErasedClient(data.client.id,data.user));
 // Ainda não houve purgeClientBackups: a restauração deve consultar o ledger atual.
 await store.restoreBackup(backup.id);
 assert.equal((await store.get('clients',data.client.id)).active,false);
 assert.equal((await store.get('clients',data.client.id)).cpf,'');
 assert.equal((await store.get('vehicles',data.vehicle.id)).chassis,'');
});

test('snapshot incompleto é recusado antes de modificar os dados ativos',async()=>{
 const data=await seed();
 const broken=await db.query("INSERT INTO oscar_private.backups(day,data) VALUES('2026-10-24',$1) RETURNING id",
  [JSON.stringify({version:1,records:{clients:[]}})]);
 await assert.rejects(store.restoreBackup(Number(broken.rows[0].id)),/Snapshot inválido/);
 assert.equal((await store.get('clients',data.client.id)).name,data.client.name);
 assert.equal((await store.list('orders')).length,1);
});
