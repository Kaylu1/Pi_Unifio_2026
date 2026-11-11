import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from 'selfsigned';
import { startLocalMysql } from './mysql-local.mjs';
import { startServer } from '../server/server.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const certificate=resolve(root,'data/tls/localhost.crt');
const privateKey=resolve(root,'data/tls/localhost.key');
await startLocalMysql();
if(!existsSync(certificate)||!existsSync(privateKey)){
 await mkdir(dirname(certificate),{recursive:true});
 const pem=await generate([{name:'commonName',value:'localhost'}],{keySize:2048,algorithm:'sha256',
  extensions:[{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]});
 await writeFile(certificate,pem.cert);await writeFile(privateKey,pem.private,{mode:0o600});
}
process.env.OSCAR_STORAGE='mysql';
process.env.OSCAR_TLS_CERT=certificate;
process.env.OSCAR_TLS_KEY=privateKey;
process.env.OSCAR_ORIGIN='https://localhost:4201';
delete process.env.DATABASE_URL;
delete process.env.DATABASE_SSL_CA;
for(const key of Object.keys(process.env))if(key.startsWith('SMTP_'))delete process.env[key];
await startServer();
