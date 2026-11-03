/** Cache restrito a uma requisição; toda gravação invalida as leituras da tabela. Nunca cruza usuários. */
export function requestStore(store){
 const lists=new Map(),records=new Map();let settings;const view=Object.create(store),copy=value=>value===undefined?undefined:structuredClone(value);
 const invalidate=table=>{lists.delete(table);for(const key of records.keys())if(key.startsWith(table+':'))records.delete(key);};
 view.list=async table=>{if(!lists.has(table))lists.set(table,Promise.resolve(store.list(table)));return copy(await lists.get(table));};
 view.get=async(table,id)=>{if(lists.has(table)){const rows=await lists.get(table);return copy(rows.find(row=>row.id===Number(id))??null);}const key=table+':'+id;if(!records.has(key))records.set(key,Promise.resolve(store.get(table,id)));return copy(await records.get(key));};
 view.settings=async()=>{settings??=Promise.resolve(store.settings());return copy(await settings);};
 view.save=async(table,record)=>{try{return await store.save(table,record);}finally{invalidate(table);}};
 view.saveSettings=async data=>{try{return await store.saveSettings(data);}finally{settings=undefined;}};
 view.audit=async(...args)=>{try{return await store.audit(...args);}finally{invalidate('audit');}};
 return view;
}
