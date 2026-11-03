/** Operações sequenciais preservam a ordem e o curto-circuito dos arrays com dados assíncronos. */
export async function asyncMap(rows,callback){const result=[];for(let i=0;i<rows.length;i++)result.push(await callback(rows[i],i,rows));return result;}
export async function asyncFilter(rows,callback){const result=[];for(let i=0;i<rows.length;i++)if(await callback(rows[i],i,rows))result.push(rows[i]);return result;}
export async function asyncSome(rows,callback){for(let i=0;i<rows.length;i++)if(await callback(rows[i],i,rows))return true;return false;}
export async function asyncEvery(rows,callback){for(let i=0;i<rows.length;i++)if(!await callback(rows[i],i,rows))return false;return true;}
export async function asyncFind(rows,callback){for(let i=0;i<rows.length;i++)if(await callback(rows[i],i,rows))return rows[i];return undefined;}
export async function asyncFindIndex(rows,callback){for(let i=0;i<rows.length;i++)if(await callback(rows[i],i,rows))return i;return -1;}
export async function asyncFlatMap(rows,callback){const result=[];for(let i=0;i<rows.length;i++){const value=await callback(rows[i],i,rows);Array.isArray(value)?result.push(...value):result.push(value);}return result;}
export async function asyncReduce(rows,callback,initial){let value=initial;for(let i=0;i<rows.length;i++)value=await callback(value,rows[i],i,rows);return value;}
