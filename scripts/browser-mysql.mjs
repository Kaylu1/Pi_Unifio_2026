import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from 'selfsigned';
import { createAcademicFixture } from './academic-fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const suites=process.argv.slice(2);
if(suites.some(name=>!['flow','features','access','theme','layouts','model','request'].includes(name)))throw new Error('Suíte de navegador desconhecida.');
if(!suites.length)suites.push('flow','request','access');
const port=Number(process.env.OSCAR_TEST_FRONTEND_PORT||4213);
const base='https://localhost:'+port;
const directory=path.join(root,'data','test-runs','mysql-browser-'+Date.now());
await mkdir(directory,{recursive:true});
const certificate=path.join(root,'data','tls','localhost.crt');
const privateKey=path.join(root,'data','tls','localhost.key');
if(!existsSync(certificate)||!existsSync(privateKey)){
 await mkdir(path.dirname(certificate),{recursive:true});
 const pem=await generate([{name:'commonName',value:'localhost'}],{keySize:2048,algorithm:'sha256',
  extensions:[{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]});
 await writeFile(certificate,pem.cert);await writeFile(privateKey,pem.private,{mode:0o600});
}
const fixture=await createAcademicFixture({origin:base});
const proxy=path.join(directory,'proxy.json');
await writeFile(proxy,JSON.stringify({'/api':{target:new URL(fixture.baseUrl).origin,secure:false,changeOrigin:false}},null,2));
const log=createWriteStream(path.join(directory,'servers.log'));
const frontend=spawn(process.execPath,[path.join(root,'node_modules','@angular','cli','bin','ng.js'),'serve',
 '--host','127.0.0.1','--port',String(port),'--ssl','--ssl-cert',certificate,'--ssl-key',privateKey,'--proxy-config',proxy],
 {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NG_CLI_ANALYTICS:'false'}});
frontend.stdout.pipe(log,{end:false});frontend.stderr.pipe(log,{end:false});
let exited=false;frontend.on('exit',()=>{exited=true;});
const health=()=>new Promise(resolve=>{const request=https.get(base+'/api/health',{rejectUnauthorized:false,timeout:1500},response=>{response.resume();resolve(response.statusCode===200);});request.on('error',()=>resolve(false));request.on('timeout',()=>request.destroy());});
let passed=false;
try{
 for(let attempt=0;attempt<180;attempt++){
  if(exited)throw new Error('O Angular de teste encerrou. Consulte '+path.join(directory,'servers.log'));
  if(await health())break;
  if(attempt===179)throw new Error('O Angular não iniciou no prazo.');
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 const browser=process.env.OSCAR_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
 for(const suite of suites){
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,['tests/browser/'+suite+'.smoke.mjs'],
   {cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,OSCAR_BASE_URL:base,OSCAR_BROWSER:browser}});
   child.on('exit',resolve);child.on('error',()=>resolve(1));});
  if(code!==0)throw new Error('Falha na suíte '+suite+'.');
 }
 passed=true;
 console.log('PASS: Angular e API TypeScript verificados em MySQL real, banco oscar_test.');
}finally{
 if(frontend.pid){if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(frontend.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else frontend.kill('SIGTERM');}
 log.end();await fixture.close();
 await writeFile(path.join(directory,'summary.json'),JSON.stringify({passed,base,suites,database:'mysql',mainDatabaseUntouched:true},null,2));
}
