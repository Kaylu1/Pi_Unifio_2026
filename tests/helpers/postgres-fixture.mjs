import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createPostgresStore } from '../../server/postgres-store.mjs';

/** Um backend WASM local; o lease imita o contrato Pool/Client do node-postgres. */
export function pglitePool(db) {
 let queue=Promise.resolve();
 return {
  async connect() {
   const previous=queue;let unlock;
   queue=new Promise(resolve=>{unlock=resolve;});
   await previous;
   let released=false;
   return {
    query:(sql,values=[])=>db.query(sql,values),
    release(){if(!released){released=true;unlock();}},
   };
  },
  async query(sql,values=[]) {
   const client=await this.connect();
   try{return await client.query(sql,values);}finally{client.release();}
  },
  async end(){},
 };
}
export async function createPgFixture({dataDir}={}) {
 const db=new PGlite(dataDir);
 await db.waitReady;
 await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');
 const migration=await readFile(new URL('../../supabase/migrations/202610220001_oscar_private.sql',import.meta.url),'utf8');
 await db.exec(migration);
 const extension=await readFile(new URL('../../docs/SQL_PARA_APLICAR_DEPOIS.txt',import.meta.url),'utf8');
 const start=extension.indexOf('\nBEGIN;'),end=extension.indexOf('\nCOMMIT;',start);
 if(start<0||end<0)throw new Error('SQL adicional de solicitações não encontrado.');
 const serviceRequestsMigration=extension.slice(start+1,end+1+'COMMIT;'.length);
 await db.exec(serviceRequestsMigration);
 const pool=pglitePool(db),store=await createPostgresStore({pool});
 return {store,db,pool,migration,serviceRequestsMigration,async close(){await store.close();await db.close();}};
}
