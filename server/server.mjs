import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { hashPassword,verifyPassword,hashToken } from './auth-crypto.mjs';
import { assert,DomainError } from './domain.mjs';
import { DAY,allow,ensure,emailValue,passwordValue,safeUser,resetLink } from './common.mjs';
import { budgetByToken,publicBudgetView,decideBudget } from './workflow.mjs';
import { orderRoutes } from './order-routes.mjs';
import { operationsRoutes } from './operations-routes.mjs';
import { validOrigin,validateRequestPolicy,clientAddress,readRequestBody,checkCron } from './http-policy.mjs';
import { drainEmailQueue,startEmailWorker } from './email-worker.mjs';
import { requestStore } from './request-store.mjs';
import { createPublicServiceRequest, serviceRequestRoutes } from './service-requests.mjs';
const require=createRequire(import.meta.url);
function localStore(options){assert(!process.env.VERCEL,'O ambiente de nuvem exige um banco PostgreSQL configurado. Nenhum banco local será criado.',503);return require('./store.mjs').createStore(options);}
export function createApi({store:injectedStore,filename,seed=true,allowedOrigins=['https://localhost:4201','https://127.0.0.1:4201','https://localhost:4200','https://127.0.0.1:4200'],allowedHosts=['localhost','127.0.0.1','[::1]'],appOrigin,secureCookies=true,tls,runMaintenance=true,trustProxy=false,cronSecret=process.env.CRON_SECRET,waitUntil,emailTransport}={}){
 const s=injectedStore??localStore({filename,seed}),rates=new Map(),baseOrigin=validOrigin(appOrigin??allowedOrigins[0]);allowedHosts=allowedHosts.map(host=>host.toLowerCase());
 const exclusive=operation=>s.runExclusive?s.runExclusive(operation):operation();
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
 const cookie=(token,maxAge=1800)=>`oscar_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secureCookies?'; Secure':''}`;
 const send=(res,status,data,extra={})=>{res.writeHead(status,{...headers,...extra});res.end(JSON.stringify(data));};
 async function rate(key,limit,minutes){if(s.consumeRate){const result=await s.consumeRate(key,limit,minutes);assert(result===true||result?.allowed===true,'Muitas tentativas. Aguarde alguns minutos e tente novamente.',429);return;}const previous=rates.get(key),entry=previous&&previous.until>Date.now()?previous:{count:0,until:Date.now()+minutes*60000};entry.count++;rates.set(key,entry);if(rates.size>10000)for(const[k,v]of rates)if(v.until<Date.now())rates.delete(k);assert(entry.count<=limit,'Muitas tentativas. Aguarde alguns minutos e tente novamente.',429);}
 async function maintainData(){
  if(s.maintenance)return await s.maintenance();
  await s.transaction(async()=>{await s.db.prepare('DELETE FROM sessions WHERE lastSeen<?').run(Date.now()-30*60000);await s.db.prepare('DELETE FROM reset_tokens WHERE expiresAt<?').run(Date.now()-DAY);for(const b of(await s.list('budgets')).filter(b=>b.status==='publicado'&&Date.parse(b.expiresAt)<=Date.now()))await s.save('budgets',{...b,status:'expirado',link:null});});return{backup:await s.backup()};
 }
 async function processRequest(req,res,{url,route,method,body,mutation,address}){
  if(route==='/health'&&method==='GET')return send(res,200,{status:'ok',mode:s.dialect==='postgres'?'postgres':'local',database:s.dialect??'sqlite'});
  if(route==='/public/services'&&method==='GET')return send(res,200,(await s.list('services')).filter(x=>x.active).map(({id,name,description,price,durationMinutes,purpose})=>({id,name,description,price,durationMinutes,purpose})));
  if(route==='/public/service-requests'&&method==='POST'){await rate('service-request:'+address,8,15);const saved=await s.transaction(()=>createPublicServiceRequest(s,body));return send(res,201,{id:saved.id,status:saved.status,total:saved.total,durationMinutes:saved.durationMinutes});}
  if(route==='/auth/forgot'&&method==='POST'){await rate(`forgot:${address}`,5,15);const email=emailValue(body.email),user=(await s.list('users')).find(u=>u.email===email&&u.active);if(user)await s.transaction(async()=>await resetLink(s,user,baseOrigin));return send(res,200,{message:'Se houver conta ativa para este e-mail, as instruções serão encaminhadas. No modo local, o gerente consulta a caixa de e-mails.'});}
  if(route==='/auth/reset'&&method==='POST'){
   await rate(`reset:${address}`,15,15);assert(typeof body.token==='string'&&body.token.length>=32&&body.token.length<=128,'Link inválido. Solicite uma nova recuperação.');const password=passwordValue(body.password);
   await s.transaction(async()=>{const reset=await s.db.prepare('SELECT * FROM reset_tokens WHERE token=?').get(hashToken(body.token));assert(reset&&!reset.used&&reset.expiresAt>Date.now(),'Link expirado ou já utilizado. Solicite nova recuperação.',410);const user=await ensure(s,'users',reset.userId);assert(user.active,'Conta inativa. Entre em contato com a oficina.',403);await s.save('users',{...user,passwordHash:hashPassword(password)});await s.db.prepare('UPDATE reset_tokens SET used=1 WHERE userId=?').run(user.id);await s.db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);await s.audit(user,'alterar','senha',user.id);});return send(res,200,{message:'Senha atualizada. Entre com sua nova senha.'});
  }
  const pm=/^\/public\/budgets\/([^/]+)(?:\/decisions)?$/.exec(route);
  if(pm&&['GET','POST'].includes(method)){await rate(`budget:${address}`,120,5);const token=decodeURIComponent(pm[1]);if(method==='GET')return send(res,200,await publicBudgetView(s,await budgetByToken(s,token)));await s.transaction(async()=>await decideBudget(s,await budgetByToken(s,token),body,null,'link'));return send(res,200,{message:'Resposta registrada. Este link foi encerrado para proteger seus dados.'});}
  if(route==='/login'&&method==='POST'){
   const email=emailValue(body.email);await rate(`login:${address}`,20,15);await rate(`login-account:${email}`,8,15);const user=(await s.list('users')).find(u=>u.email===email),auth=user?await s.db.prepare('SELECT passwordHash FROM users WHERE id=?').get(user.id):null;assert(typeof body.password==='string'&&body.password.length<=128,'E-mail ou senha incorretos.',401);const valid=verifyPassword(body.password,auth?.passwordHash);assert(valid&&user?.active,'E-mail ou senha incorretos.',401);const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');let loggedInUser;await s.transaction(async()=>{const currentUser=await s.get('users',user.id),currentAuth=await s.db.prepare('SELECT passwordHash FROM users WHERE id=?').get(user.id);assert(currentUser?.active&&currentUser.email===email&&currentAuth&&(currentAuth.passwordHash===auth.passwordHash||verifyPassword(body.password,currentAuth.passwordHash)),'E-mail ou senha incorretos.',401);loggedInUser=currentUser;await s.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run(hashToken(token),currentUser.id,csrf,Date.now());await s.audit(currentUser,'entrar','sessao',currentUser.id);});return send(res,200,{user:safeUser(loggedInUser),csrfToken:csrf},{'Set-Cookie':cookie(token)});
  }
  const token=/(?:^|;\s*)oscar_session=([^;]+)/.exec(req.headers.cookie??'')?.[1];let session=token?await s.db.prepare('SELECT * FROM sessions WHERE token=?').get(hashToken(token)):null;
  if(session&&session.lastSeen<=Date.now()-30*60000){await s.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);session=null;}
  let actor=session?await s.get('users',session.userId):null;if(!actor?.active){actor=null;session=null;}if(session)await s.db.prepare('UPDATE sessions SET lastSeen=? WHERE token=?').run(Date.now(),session.token);
  if(route==='/session'&&method==='GET')return send(res,200,{user:safeUser(actor),...(session?{csrfToken:session.csrf}:{})},session?{'Set-Cookie':cookie(token)}:{});
  assert(actor,'Sua sessão expirou. Entre novamente para continuar.',401);res.setHeader('Set-Cookie',cookie(token));if(mutation)assert(req.headers['x-csrf-token']===session.csrf,'Atualize a página e tente novamente: token de segurança inválido.',403);
  if(route==='/logout'&&method==='POST'){await s.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);return send(res,200,{user:null},{'Set-Cookie':cookie('',0)});}
  if(route==='/backup'&&method==='POST'){allow(actor,['gerente']);const backup=await s.backup();await s.audit(actor,'criar','backup',0);return send(res,200,{...backup,message:backup?.message??(s.dialect==='postgres'?'Snapshot lógico de segurança registrado no PostgreSQL.':'Cópia de segurança local criada na pasta data/backups.')});}
  const context={s:requestStore(s),route,method,body,user:actor,url,origin:baseOrigin};const dispatch=async()=>await serviceRequestRoutes(context)??await orderRoutes(context)??await operationsRoutes(context);const result=mutation?await s.transaction(async()=>{const current=await s.db.prepare('SELECT * FROM sessions WHERE token=?').get(session.token),currentUser=await s.get('users',actor.id);assert(current&&current.lastSeen>Date.now()-30*60000&&currentUser?.active,'Sua sessão expirou. Entre novamente para continuar.',401);assert(req.headers['x-csrf-token']===current.csrf,'Atualize a página para renovar a segurança.',403);context.user=currentUser;return await dispatch();}):await dispatch();assert(result,'Endpoint não encontrado.',404);
  if(result.afterCommit){try{const backupPurge=await result.afterCommit();result.data={...result.data,backupPurge};if(s.dialect!=='postgres')await s.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');}catch{throw new DomainError(503,'Dados pessoais removidos da base ativa. O expurgo das cópias encontrou um bloqueio; repita a anonimização para concluir ou contate o gerente.');}}
  if(result.pdf){const bytes=Buffer.from(result.pdf);res.writeHead(200,{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${result.filename}"`,'Content-Length':String(bytes.length)});return res.end(bytes);}
  if(result.csv){const escape=v=>`"${String(v??'').replace(/^[=+@-]/,"'").replaceAll('"','""')}"`,rows=[['Tipo','O.S.','Cliente','Veículo','Descrição','Quantidade','Valor'],...result.data.services.map(i=>['Serviço',i.number??i.orderId,i.clientName,i.vehiclePlate,i.description,i.quantity,i.total]),...result.data.parts.map(i=>['Peça','','','',i.description,i.quantity,i.total])];res.writeHead(200,{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="relatorio-oscar.csv"'});return res.end('\ufeff'+rows.map(r=>r.map(escape).join(';')).join('\r\n'));}
  return send(res,result.status??200,result.data);
 }
 async function handler(req,res){
  let finishBackground=()=>{};
  try{
   validateRequestPolicy(req,{allowedHosts,allowedOrigins});const url=new URL(req.url,'http://localhost'),pathname=url.pathname.replace(/\/+$/,'')||'/';assert(pathname.startsWith('/api/'),'Endpoint não encontrado.',404);const route=pathname.slice(4),method=req.method,mutation=['POST','PUT','DELETE','PATCH'].includes(method),body=await readRequestBody(req,mutation),address=clientAddress(req,{trustProxy});
   if(route==='/_maintenance'&&method==='GET'){checkCron(req,cronSecret);const maintenance=await exclusive(maintainData),emails=await drainEmailQueue(s,{maxMessages:3,budgetMs:8000,transport:emailTransport});return send(res,200,{status:'ok',maintenance,emails});}
   if(mutation&&!['/login','/logout'].includes(route)&&process.env.SMTP_HOST&&typeof waitUntil==='function'){
    let finish;const background=new Promise(resolveBackground=>finish=resolveBackground).then(success=>success?drainEmailQueue(s,{maxMessages:3,budgetMs:8000,transport:emailTransport}):undefined).catch(()=>{});finishBackground=finish;waitUntil(background);
   }
   const result=await exclusive(()=>processRequest(req,res,{url,route,method,body,mutation,address}));finishBackground(res.statusCode<400);return result;
  }catch(error){finishBackground(false);const known=error instanceof DomainError,constraint=(String(error?.code??'').startsWith('ERR_SQLITE')&&/constraint|UNIQUE|FOREIGN KEY/i.test(String(error.message)))||['23505','23503','23514'].includes(error?.code);if(!known&&!constraint)console.error('Falha interna OScar:',error?.code??'UNEXPECTED');if(!res.headersSent)send(res,known?error.status:constraint?409:500,{message:known?error.message:constraint?'Dados em conflito com cadastro existente. Atualize os registros e tente novamente.':'Não foi possível concluir. Verifique a configuração do banco ou contate o gerente.'});else res.end();}
 }
 const server=tls?https.createServer(tls,handler):http.createServer(handler);server.requestTimeout=15000;server.headersTimeout=10000;let maintenanceTimer;
 if(runMaintenance){const maintain=()=>exclusive(maintainData).catch(error=>console.error('Rotina de manutenção indisponível:',error?.code??'MAINTENANCE'));void maintain();maintenanceTimer=setInterval(()=>void maintain(),60000);maintenanceTimer.unref();}
 server.on('close',()=>{if(maintenanceTimer)clearInterval(maintenanceTimer);});
 return{server,store:s,handler,maintenance:()=>exclusive(maintainData),close:async()=>{if(maintenanceTimer)clearInterval(maintenanceTimer);await new Promise(done=>{server.close(()=>done());server.closeAllConnections();});await exclusive(()=>s.close());}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cert=process.env.OSCAR_TLS_CERT,key=process.env.OSCAR_TLS_KEY;let store;
 if(process.env.OSCAR_STORAGE==='postgres'){assert(process.env.DATABASE_URL,'Configure DATABASE_URL antes de escolher PostgreSQL.',503);const{assertOscarSupabaseTarget}=await import('../scripts/oscar-supabase-target.mjs');assertOscarSupabaseTarget(process.env.DATABASE_URL);const{createPostgresStore}=await import('./postgres-store.mjs');store=await createPostgresStore({connectionString:process.env.DATABASE_URL});}
 const appOrigin=process.env.OSCAR_ORIGIN?validOrigin(process.env.OSCAR_ORIGIN,{localOnly:true}):undefined,api=createApi({store,filename:process.env.OSCAR_DB??resolve(root,'data/oscar.sqlite'),...(appOrigin?{allowedOrigins:[appOrigin],appOrigin}:{}),tls:cert&&key?{cert:readFileSync(cert),key:readFileSync(key)}:undefined}),port=Number(process.env.OSCAR_API_PORT??4301);
 api.server.listen(port,'127.0.0.1',()=>console.log(`OScar API ${api.store.dialect??'sqlite'}: ${cert&&key?'https':'http'}://127.0.0.1:${port}/api/health`));const emailWorker=startEmailWorker(api.store),stop=()=>{emailWorker.stop();api.close().then(()=>process.exit(0));};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
