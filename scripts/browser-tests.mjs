import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv.slice(2),available=['flow','features','access','theme','layouts','model','request'];
if(requested.some(name=>!available.includes(name)))throw new Error('Escolha apenas flow, features, access, theme, layouts ou model.');
const suites=requested.length?requested:available;
const runId='browser-'+randomUUID().slice(0,8);
const dir=path.join(root,'data','test-runs',runId);await fs.mkdir(dir,{recursive:true});
const frontendPort=Number(process.env.OSCAR_TEST_FRONTEND_PORT||4212),apiPort=Number(process.env.OSCAR_TEST_API_PORT||4312);
const base='https://localhost:'+frontendPort;
const log=createWriteStream(path.join(dir,'servers.log'));
const dev=spawn(process.execPath,['scripts/dev.mjs','--sqlite'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,OSCAR_FRONTEND_PORT:String(frontendPort),OSCAR_API_PORT:String(apiPort),OSCAR_DB:path.join(dir,'fixture.sqlite')}});
dev.stdout.pipe(log,{end:false});dev.stderr.pipe(log,{end:false});
let exited=false;dev.on('exit',()=>{exited=true;});
function health(){return new Promise(resolve=>{const req=https.get(base+'/api/health',{rejectUnauthorized:false,timeout:1500},res=>{res.resume();resolve(res.statusCode===200);});req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());});}
async function stop(){if(process.platform==='win32'&&dev.pid)spawnSync('taskkill.exe',['/PID',String(dev.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else dev.kill('SIGTERM');log.end();}
const started=Date.now();
let ok=false;
try {
 for(let i=0;i<180;i++){if(exited)throw new Error('A instância isolada não iniciou. Consulte '+path.join(dir,'servers.log'));if(await health())break;if(i===179)throw new Error('Tempo excedido iniciando instância de teste isolada.');await new Promise(r=>setTimeout(r,500));}
 for(const script of suites){
  const result=await new Promise(resolve=>{const child=spawn(process.execPath,['tests/browser/'+script+'.smoke.mjs'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,OSCAR_BASE_URL:base}});child.on('exit',code=>resolve(code));child.on('error',()=>resolve(1));});
  if(result!==0)throw new Error('Falha no teste de navegador '+script+'.');
 }
 ok=true;console.log('PASS: '+suites.length+' suítes em base SQLite isolada. A base principal não foi alterada.');
} finally {
 await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify({passed:ok,base,suites,isolatedDatabase:true,mainDatabaseUntouched:true,durationMs:Date.now()-started},null,2));await stop();
}
