import tls from 'node:tls';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { timestamp } from './auth-crypto.mjs';
/** SMTP opcional via TLS implícito. Na ausência de host, a caixa local captura as mensagens. */
export async function sendSmtp(message, config = process.env) {
    const host = config.SMTP_HOST, port = Number(config.SMTP_PORT ?? 465), from = config.SMTP_FROM ?? 'oscar@localhost';
    if (!host)
        throw new Error('Configure SMTP_HOST para ativar o envio externo.');
    if (!/^[^\s<>@]+@[^\s<>@]+$/.test(from) || !/^[^\s<>@]+@[^\s<>@]+$/.test(message.to))
        throw new Error('Remetente ou destinatário SMTP inválido.');
    const socket = tls.connect({ host, port, servername: host, minVersion: 'TLSv1.2', rejectUnauthorized: true });
    const deadlineTimer=setTimeout(()=>socket.destroy(new Error('Tempo total de envio excedido.')),Math.max(100,Number(config.SMTP_TIMEOUT_MS??15000)));deadlineTimer.unref();
    socket.setTimeout(15000, () => socket.destroy(new Error('Tempo limite SMTP.')));
    const messages = [], waiters = [];
    let pending = '', lines = [];
    let ended;
    const fail = error => {
        ended = error;
        while (waiters.length)
            waiters.shift().reject(error);
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('Conexão SMTP encerrada.')));
    socket.on('data', chunk => {
        pending += chunk.toString();
        let index;
        while ((index = pending.indexOf('\r\n')) >= 0) {
            const line = pending.slice(0, index);
            pending = pending.slice(index + 2);
            lines.push(line);
            if (/^\d{3} /.test(line)) {
                const reply = { code: Number(line.slice(0, 3)), text: lines.join('\n') };
                lines = [];
                if (waiters.length)
                    waiters.shift().resolve(reply);
                else
                    messages.push(reply);
            }
        }
    });
    const response = () => {
        if (messages.length)
            return Promise.resolve(messages.shift());
        if (ended)
            return Promise.reject(ended);
        return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    };
    const check = async (expected) => {
        const reply = await response();
        if (!expected.includes(reply.code))
            throw new Error(`Servidor SMTP recusou a etapa (${reply.code}).`);
        return reply;
    };
    const command = async (value, codes) => { socket.write(value + '\r\n'); return await check(codes); };
    try {
        await once(socket, 'secureConnect');
        await check([220]);
        await command('EHLO oscar.local', [250]);
        if (config.SMTP_USER) {
            await command('AUTH LOGIN', [334]);
            await command(Buffer.from(config.SMTP_USER).toString('base64'), [334]);
            await command(Buffer.from(config.SMTP_PASSWORD ?? '').toString('base64'), [235]);
        }
        await command(`MAIL FROM:<${from}>`, [250]);
        await command(`RCPT TO:<${message.to}>`, [250, 251]);
        await command('DATA', [354]);
        const subject = Buffer.from(String(message.subject).replace(/[\r\n]/g, ' ')).toString('base64');
        const body = Buffer.from(String(message.text)).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
        socket.write(`From: <${from}>\r\nTo: <${message.to}>\r\nSubject: =?UTF-8?B?${subject}?=\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${randomUUID()}@oscar.local>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n.\r\n`);
        await check([250]);
        await command('QUIT', [221]);
    }
    finally {
        clearTimeout(deadlineTimer);socket.destroy();
    }
}
/** Reivindicação transacional evita que instâncias serverless enviem a mesma mensagem ao mesmo tempo. */
export async function drainEmailQueue(store,{transport=sendSmtp,maxMessages=5,budgetMs=8000}={}){
 if(!process.env.SMTP_HOST)return{processed:0,sent:0,failed:0};const deadline=Date.now()+budgetMs;let processed=0,sent=0,failed=0;
 const exclusive=operation=>store.runExclusive?store.runExclusive(operation):operation();
 while(processed<maxMessages&&Date.now()<deadline){
  const claim=await exclusive(()=>store.transaction(async()=>{const now=Date.now(),messages=await store.list('emails'),message=messages.find(m=>(['pendente','erro'].includes(m.status)||(m.status==='enviando'&&Date.parse(m.leaseUntil??0)<=now))&&Date.parse(m.nextAttemptAt)<=now);if(!message)return null;return await store.save('emails',{...message,status:'enviando',leaseId:randomUUID(),leaseUntil:new Date(now+120000).toISOString(),attempts:(message.attempts??0)+1});}));
  if(!claim)break;processed++;
  let delivered=false;try{const remaining=Math.max(100,deadline-Date.now());if(transport===sendSmtp)await transport(claim,{...process.env,SMTP_TIMEOUT_MS:String(remaining)});else await transport(claim);delivered=true;sent++;}catch{failed++;}
  await exclusive(()=>store.transaction(async()=>{const current=await store.get('emails',claim.id);if(current?.leaseId!==claim.leaseId||current.status!=='enviando')return;await store.save('emails',{...current,status:delivered?'enviado':'erro',sentAt:delivered?timestamp():null,leaseId:null,leaseUntil:null,nextAttemptAt:delivered?current.nextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(claim.attempts-1,6))).toISOString(),error:delivered?null:'Envio indisponível. A fila tentará novamente; o restante do sistema continua disponível.'});}));
 }
 return{processed,sent,failed};
}
export function startEmailWorker(store,{transport=sendSmtp,intervalMs=10000}={}){
 let busy=false,stopped=false;
 async function tick(){if(busy||stopped)return;busy=true;try{return await drainEmailQueue(store,{transport});}finally{busy=false;}}
 const timer=setInterval(()=>void tick().catch(()=>{}),intervalMs);timer.unref();void tick().catch(()=>{});return{tick,stop(){stopped=true;clearInterval(timer);}};
}
