import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { generate } from 'selfsigned';
import { assertOscarSupabaseTarget } from './oscar-supabase-target.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const supabaseMode=process.argv.includes('--oscar-supabase');
if(process.argv.slice(2).some(arg=>arg!=='--oscar-supabase'))throw new Error('Opção de inicialização desconhecida.');
if(supabaseMode)assertOscarSupabaseTarget(process.env.DATABASE_URL);
const frontendPort=Number(process.env.OSCAR_FRONTEND_PORT||(supabaseMode?4202:4201));
const apiPort=Number(process.env.OSCAR_API_PORT||(supabaseMode?4302:4301));
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error('A porta '+port+' já está em uso. Encerre apenas a instância anterior do OScar ou escolha outra porta.')));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
await free(frontendPort);await free(apiPort);
const tlsDir=path.join(root,'data','tls');await mkdir(tlsDir,{recursive:true});
const certPath=path.join(tlsDir,'localhost.crt'),keyPath=path.join(tlsDir,'localhost.key');
try{await access(certPath);await access(keyPath);}catch{
 const pems=await generate([{name:'commonName',value:'localhost'}],{keySize:2048,algorithm:'sha256',notAfterDate:new Date(Date.now()+365*86400000),extensions:[{name:'basicConstraints',cA:false},{name:'keyUsage',digitalSignature:true,keyEncipherment:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]});
 await writeFile(certPath,pems.cert);await writeFile(keyPath,pems.private,{mode:0o600});
}
const proxyPath=path.join(root,'data','proxy-'+frontendPort+'.json');await writeFile(proxyPath,JSON.stringify({'/api':{target:'https://127.0.0.1:'+apiPort,secure:false,changeOrigin:false,headers:{'X-Forwarded-Proto':'https'}}},null,2));
const children=[];
let ending=false;
function shutdown(code=0){if(ending)return;ending=true;for(const c of children)if(!c.killed)c.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref();}
const env={...process.env,OSCAR_STORAGE:'sqlite',NG_CLI_ANALYTICS:'false',OSCAR_API_PORT:String(apiPort),OSCAR_TLS_CERT:certPath,OSCAR_TLS_KEY:keyPath,OSCAR_ORIGIN:'https://localhost:'+frontendPort};
if(supabaseMode)env.OSCAR_STORAGE='postgres';
else { delete env.DATABASE_URL; delete env.DATABASE_SSL_CA; }
const webEnv={...env};delete webEnv.DATABASE_URL;delete webEnv.DATABASE_SSL_CA;
const api=spawn(process.execPath,['server/server.mjs'],{cwd:root,stdio:'inherit',env});children.push(api);
await new Promise((resolve,reject)=>{let tries=0;const interval=setInterval(()=>{const socket=net.connect(apiPort,'127.0.0.1');socket.on('connect',()=>{socket.end();clearInterval(interval);resolve();});socket.on('error',()=>{socket.destroy();if(++tries>80){clearInterval(interval);reject(new Error('A API não iniciou. Confira os erros acima.'));}});},150);api.once('exit',code=>{clearInterval(interval);reject(new Error('A API encerrou com código '+code));});});
const web=spawn(process.execPath,[path.join(root,'node_modules','@angular','cli','bin','ng.js'),'serve','--host','127.0.0.1','--port',String(frontendPort),'--ssl','--ssl-cert',certPath,'--ssl-key',keyPath,'--proxy-config',proxyPath],{cwd:root,stdio:'inherit',env:webEnv});children.push(web);
console.log('\nOScar '+(supabaseMode?'com Supabase dedicado':'exclusivamente local')+': https://localhost:'+frontendPort+'\nNo primeiro acesso, o navegador pode pedir confirmação do certificado local.\n');
for(const child of children)child.once('exit',code=>{if(!ending)shutdown(code||0);});
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
process.on('uncaughtException',error=>{console.error(error.message);shutdown(1);});
