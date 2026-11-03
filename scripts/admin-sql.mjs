import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
const apostrophe=String.fromCharCode(39);
const sqlText = value => apostrophe + String(value).replaceAll(apostrophe,apostrophe+apostrophe) + apostrophe;
export function validateAdministrator({ name, email, password }) {
 const cleanName=typeof name==='string'?name.trim():'';
 const cleanEmail=typeof email==='string'?email.trim().toLowerCase():'';
 if(!cleanName||cleanName.length>120||/[\u0000-\u001f]/u.test(cleanName))throw new Error('Informe nome de 1 a 120 caracteres, sem caracteres de controle.');
 if(cleanEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(cleanEmail))throw new Error('Informe um e-mail válido.');
 if(typeof password!=='string'||password.length<10||password.length>128||!/[A-Za-z]/u.test(password)||!/\d/u.test(password))throw new Error('Use senha de 10 a 128 caracteres, com letras e números.');
 return{name:cleanName,email:cleanEmail,password};
}
/** Pure offline generation: no database, HTTP, Supabase CLI or SQLite import. */
export function generateAdminSql(values,{now=new Date().toISOString()}={}) {
 const admin=validateAdministrator(values),salt=randomBytes(16).toString('hex');
 const passwordHash=salt+':'+scryptSync(admin.password,salt,64).toString('hex');
 const data={name:admin.name,email:admin.email,role:'gerente',active:true,clientId:null,createdAt:now,updatedAt:now};
 return `-- OScar: criação manual do primeiro gerente. Gerado somente neste computador.\n-- Execute após a migração de supabase/migrations/. Não publique este arquivo.\n-- E-mail existente é preservado: não altera senhas nem permissões existentes.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\nWITH allocated AS (\n SELECT nextval(pg_get_serial_sequence('oscar_private.users','id')) AS id\n)\nINSERT INTO oscar_private.users(id,data,email,passwordhash,clientid)\nSELECT id,${sqlText(JSON.stringify(data))}::jsonb||jsonb_build_object('id',id),\n ${sqlText(admin.email)},${sqlText(passwordHash)},NULL\nFROM allocated\nON CONFLICT(email) DO NOTHING\nRETURNING id;\nCOMMIT;\n`;
}export async function hiddenQuestion(prompt,{input=stdin,output=stdout}={}) {
 if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')throw new Error('Use terminal interativo. Senhas não são aceitas por argumentos ou entrada redirecionada.');
 output.write(prompt);emitKeypressEvents(input);input.setRawMode(true);input.resume();
 return new Promise((resolveQuestion,rejectQuestion)=>{
  let value='';
  const cleanup=()=>{input.off('keypress',keypress);input.off('end',end);input.setRawMode(false);input.pause();output.write('\n');};
  const end=()=>{cleanup();rejectQuestion(new Error('Entrada encerrada. Nenhum SQL foi gravado.'));};
  const keypress=(text,key={})=>{
   if(key.ctrl&&key.name==='c'){cleanup();rejectQuestion(new Error('Geração cancelada. Nenhum SQL foi gravado.'));return;}
   if(key.name==='return'||key.name==='enter'){cleanup();resolveQuestion(value);return;}
   if(key.name==='backspace'){if(value){value=[...value].slice(0,-1).join('');output.write('\b \b');}return;}
   if(key.ctrl||key.meta||!text||/[\u0000-\u001f\u007f]/u.test(text)||value.length+text.length>128)return;
   value+=text;output.write('*'.repeat([...text].length));
  };
  input.on('keypress',keypress);input.once('end',end);
 });
}
export async function runAdminCli(args=process.argv.slice(2)) {
 if(args.length===1&&['--help','-h'].includes(args[0])){stdout.write('Uso: node scripts/admin-sql.mjs\nSolicita nome, e-mail e senha oculta e grava supabase/admin.local.sql.\nNão conecta à internet ou ao banco. Não aceita credenciais por argumentos.\n');return;}
 if(args.length)throw new Error('Não passe credenciais por argumentos. Use node scripts/admin-sql.mjs em terminal interativo.');
 if(!stdin.isTTY||!stdout.isTTY)throw new Error('Use terminal interativo para manter a senha oculta. Nenhum SQL foi gravado.');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),target=resolve(root,'supabase/admin.local.sql');
 if(existsSync(target))throw new Error('supabase/admin.local.sql já existe. Guarde ou remova o arquivo anterior antes de gerar outro.');
 const prompts=createInterface({input:stdin,output:stdout});let name,email;
 try{name=await prompts.question('Nome do primeiro gerente: ');email=await prompts.question('E-mail do primeiro gerente: ');}finally{prompts.close();}
 const password=await hiddenQuestion('Senha (10 a 128 caracteres, letras e números): '),confirmation=await hiddenQuestion('Confirme a senha: ');
 if(password!==confirmation)throw new Error('As senhas não coincidem. Nenhum SQL foi gravado.');
 const sql=generateAdminSql({name,email,password});await mkdir(dirname(target),{recursive:true});const file=await open(target,'wx',0o600);
 try{await file.writeFile(sql,'utf8');}finally{await file.close();}
 stdout.write('SQL gerado em supabase/admin.local.sql. Nenhuma conexão com banco ou serviço foi realizada.\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runAdminCli().catch(error=>{console.error(error.message);process.exitCode=1;});
