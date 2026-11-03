import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cloudConfiguration, normalizedApiUrl, createVercelHandler } from '../api/index.mjs';
const env={APP_ORIGIN:'https://oscar.example.test',DATABASE_URL:'postgresql://fake_user:fake_password@db.example.test:6543/postgres',CRON_SECRET:'offline-test-cron-secret-1234567890'};
const req=(url,extra={})=>({url,method:'GET',headers:{host:'oscar.example.test'},...extra});
function res(){return{statusCode:0,headers:{},headersSent:false,writableEnded:false,writeHead(status,headers){this.statusCode=status;this.headers={...this.headers,...headers};this.headersSent=true;},end(body=''){this.body=body;this.writableEnded=true;},json(){return JSON.parse(this.body);}};}

test('normalização suporta URL original, URL reescrita e helperquery preservando filtros',()=>{
 assert.equal(normalizedApiUrl(req('/api/clients?q=Ana&page=2'),env.APP_ORIGIN),'/api/clients?q=Ana&page=2');
 assert.equal(normalizedApiUrl(req('/api/index?__oscar_path=orders%2F12&status=aberta'),env.APP_ORIGIN),'/api/orders/12?status=aberta');
 assert.equal(normalizedApiUrl(req('/api/index',{query:{__oscar_path:'parts',q:'Filtro de óleo',page:'2'}}),env.APP_ORIGIN),'/api/parts?q=Filtro+de+%C3%B3leo&page=2');
 assert.equal(normalizedApiUrl(req('/api/clients?__oscar_path=login&q=Ana'),env.APP_ORIGIN),'/api/clients?q=Ana');
 assert.equal(normalizedApiUrl(req('/api'),env.APP_ORIGIN),'/api/');
});
test('rotas ambíguas, traversal e separadores codificados são recusados',()=>{
 for(const path of ['/api/index?__oscar_path=orders&__oscar_path=users','/api/index?__oscar_path=..%2Fusers','/api/orders/../users','/api/orders%2F1','//evil.invalid/api/login','/painel','/api/index?__oscar_path=orders%5C1'])assert.throws(()=>normalizedApiUrl(req(path),env.APP_ORIGIN));
 assert.throws(()=>normalizedApiUrl(req('/api/index',{query:{__oscar_path:['users','login']}}),env.APP_ORIGIN));
});
test('configuração exige origem HTTPS explícita, conexão PostgreSQL e cron secret',()=>{
 assert.equal(cloudConfiguration(env).host,'oscar.example.test');
 for(const override of [{DATABASE_URL:''},{DATABASE_URL:'file:local.sqlite'},{APP_ORIGIN:'http://oscar.example.test'},{APP_ORIGIN:'https://oscar.example.test/subpath'},{APP_ORIGIN:'https://SEU-PROJETO.vercel.app'},{CRON_SECRET:'curto'},{DATABASE_URL:env.DATABASE_URL+'?sslmode=disable'}])assert.throws(()=>cloudConfiguration({...env,...override}));
});
test('sem configuração retorna 503 JSON e não importa API nem cria banco',async()=>{
 let imports=0;const logs=[];
 const handler=createVercelHandler({env:{},loadApi:async()=>{imports++;throw Error('não importar');},loadStore:async()=>{imports++;throw Error('não importar');},log:value=>logs.push(value)});
 const response=res();await handler(req('/api/health'),response);
 assert.equal(response.statusCode,503);assert.match(response.headers['Content-Type'],/json/);assert.equal(imports,0);assert.equal(logs[0],'OSCAR_CLOUD_UNAVAILABLE');assert.doesNotMatch(response.body,/password|sqlite|DATABASE_URL/i);
});
test('pool é reutilizado e handler recebe body parseado, query e cron de forma explícita',async()=>{
 let pools=0,applications=0;let configuration;const body={name:'Cliente fictício'};
 const handler=createVercelHandler({env,loadStore:async()=>({createPostgresStore:async options=>{pools++;assert.equal(options.max,1);return{close:async()=>{}};}}),loadApi:async()=>({createApi:options=>{applications++;configuration=options;return{handler:async(request,response)=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({url:request.url,body:request.body??null,authorization:request.headers.authorization??null}));}};}})});
 const first=res(),second=res();await Promise.all([handler(req('/api/index?__oscar_path=clients',{method:'POST',body}),first),handler(req('/api/index?__oscar_path=_maintenance',{headers:{host:'oscar.example.test',authorization:'Bearer '+env.CRON_SECRET}}),second)]);
 assert.equal(pools,1);assert.equal(applications,1);assert.equal(configuration.runMaintenance,false);assert.equal(configuration.seed,false);assert.equal(configuration.secureCookies,true);assert.equal(configuration.cronSecret,env.CRON_SECRET);assert.equal(configuration.appOrigin,env.APP_ORIGIN);assert.equal(first.json().url,'/api/clients');assert.deepEqual(first.json().body,body);assert.equal(second.json().url,'/api/_maintenance');assert.equal(second.json().authorization,'Bearer '+env.CRON_SECRET);
});
test('host e origem externos são bloqueados antes de abrir o pool',async()=>{
 let loads=0;const handler=createVercelHandler({env,loadStore:async()=>{loads++;throw Error('não acessar');}});
 for(const headers of [{host:'evil.invalid'},{host:'oscar.example.test',origin:'https://evil.invalid'}]){const response=res();await handler(req('/api/health',{headers}),response);assert.equal(response.statusCode,403);}
 assert.equal(loads,0);
});
test('falha do banco não revela segredo e inicialização pode ser tentada novamente',async()=>{
 let attempts=0;const logs=[];const handler=createVercelHandler({env,loadApi:async()=>({createApi:()=>{throw Error('não chamado');}}),loadStore:async()=>({createPostgresStore:async()=>{attempts++;throw Error(env.DATABASE_URL);}}),log:value=>logs.push(value)});
 for(let index=0;index<2;index++){const response=res();await handler(req('/api/login'),response);assert.equal(response.statusCode,503);assert.ok(!response.body.includes('fake_password'));}
 assert.equal(attempts,2);assert.deepEqual(logs,['OSCAR_CLOUD_UNAVAILABLE','OSCAR_CLOUD_UNAVAILABLE']);
});
test('configuração Vercel usa uma função, SPA sem capturar API e cron diário protegido',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.framework,'angular');assert.equal(config.outputDirectory,'dist/oscar/browser');assert.equal(config.buildCommand,'npm run build');assert.deepEqual(Object.keys(config.functions),['api/index.mjs']);assert.equal(config.crons.length,1);assert.equal(config.crons[0].path,'/api/_maintenance');assert.match(config.crons[0].schedule,/^\d+ \d+ \* \* \*$/);assert.equal(config.rewrites[1].source,'/api/:path*');assert.match(config.rewrites[1].destination,/__oscar_path=:path\*/);
 const fallback=new RegExp('^'+config.rewrites.at(-1).source+'$');assert.ok(fallback.test('/ordens/12'));assert.ok(fallback.test('/redefinir/abc-token'));assert.ok(!fallback.test('/api/missing'));assert.ok(!fallback.test('/api'));assert.ok(!fallback.test('/main-ABC12345.js'));assert.ok(!fallback.test('/media/font.woff2'));
 const csp=config.headers.flatMap(rule=>rule.headers).find(header=>header.key==='Content-Security-Policy').value;assert.match(csp,/script-src 'self'/);assert.match(csp,/style-src 'self' 'unsafe-inline'/);assert.match(csp,/connect-src 'self'/);assert.doesNotMatch(csp,/unsafe-eval|https:\/\//);
 const ignore=await readFile(new URL('../.vercelignore',import.meta.url),'utf8');for(const pattern of ['data/**','.env.*','supabase/**','server/*.test.mjs','tests/**','docs/**','*.pdf'])assert.ok(ignore.split(/\r?\n/).includes(pattern),pattern+' deve ficar fora do upload.');
});