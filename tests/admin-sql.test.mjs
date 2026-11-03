import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { generateAdminSql, validateAdministrator } from '../scripts/admin-sql.mjs';
import { verifyPassword } from '../server/auth-crypto.mjs';
const fixture={name:"Admin O'Connor",email:'ADMIN@EXEMPLO.TEST',password:'SenhaOffline@2026'};
test('gerador valida credenciais e nunca coloca senha em texto puro no SQL',()=>{
 const sql=generateAdminSql(fixture);assert.ok(!sql.includes(fixture.password));assert.match(sql,/INSERT INTO oscar_private\.users/);assert.match(sql,/ON CONFLICT\(email\) DO NOTHING/);assert.match(sql,/[a-f0-9]{32}:[a-f0-9]{128}/);assert.doesNotMatch(sql,/passwordHash["']/);assert.equal(validateAdministrator(fixture).email,'admin@exemplo.test');
 for(const override of [{name:''},{email:'email inválido'},{password:'12345678901'},{password:'somenteletras'},{password:'Abc1'},{password:'A1'.repeat(65)}])assert.throws(()=>generateAdminSql({...fixture,...override}));
});
test('SQL funciona no PostgreSQL local, mantém id JSON e não redefine conta existente',async()=>{
 const database=new PGlite();try{
  await database.exec(await readFile(new URL('../supabase/migrations/202610220001_oscar_private.sql',import.meta.url),'utf8'));
  await database.exec(generateAdminSql(fixture));
  const first=(await database.query('SELECT id,data,email,passwordhash,clientid FROM oscar_private.users')).rows;
  assert.equal(first.length,1);assert.equal(Number(first[0].id),first[0].data.id);assert.equal(first[0].data.name,fixture.name);assert.equal(first[0].data.role,'gerente');assert.equal(first[0].data.active,true);assert.equal(first[0].email,'admin@exemplo.test');assert.equal(first[0].clientid,null);assert.ok(verifyPassword(fixture.password,first[0].passwordhash));assert.ok(!('passwordHash'in first[0].data));
  await database.exec(generateAdminSql({...fixture,password:'OutraSenhaOffline2026'}));
  const second=(await database.query('SELECT passwordhash FROM oscar_private.users')).rows;assert.equal(second.length,1);assert.equal(second[0].passwordhash,first[0].passwordhash);
  const services=(await database.query('SELECT COUNT(*)::int AS total FROM oscar_private.services')).rows[0];assert.equal(services.total,0);
 }finally{await database.close();}
});
test('nome com conteúdo SQL permanece dado e não executa instruções',async()=>{
 const database=new PGlite();try{
  await database.exec(await readFile(new URL('../supabase/migrations/202610220001_oscar_private.sql',import.meta.url),'utf8'));
  const name="D'Ávila'); DROP TABLE oscar_private.clients; --";
  await database.exec(generateAdminSql({...fixture,name}));
  assert.equal((await database.query('SELECT data FROM oscar_private.users')).rows[0].data.name,name);
  assert.equal((await database.query('SELECT COUNT(*)::int AS total FROM oscar_private.clients')).rows[0].total,0);
 }finally{await database.close();}
});
test('CLI não aceita segredo por argumento nem grava arquivo na consulta de ajuda',()=>{
 const script=new URL('../scripts/admin-sql.mjs',import.meta.url);
 const help=spawnSync(process.execPath,[script.pathname.replace(/^\/([A-Za-z]:)/,'$1'),'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Não conecta/);
 const rejected=spawnSync(process.execPath,[script.pathname.replace(/^\/([A-Za-z]:)/,'$1'),'--password=NAO_E_UMA_SENHA_REAL_123'],{encoding:'utf8'});assert.equal(rejected.status,1);assert.match(rejected.stderr,/Não passe credenciais/);assert.ok(!rejected.stderr.includes('NAO_E_UMA_SENHA_REAL_123'));
});