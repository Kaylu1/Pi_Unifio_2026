/** Public target identity only. Local credentials are loaded by the launcher. */
export const OSCAR_SUPABASE_PROJECT_REF = 'kotiorssahochknggjzc';
export const OSCAR_SUPABASE_POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';

export function assertOscarSupabaseTarget(connectionString) {
 if (typeof connectionString !== 'string' || !connectionString.trim())
  throw new Error('Informe DATABASE_URL somente para a sessão do OScar Supabase.');
 let url;
 try { url = new URL(connectionString); } catch {
  throw new Error('A URI PostgreSQL do OScar é inválida.');
 }
 if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
  url.username !== 'postgres.' + OSCAR_SUPABASE_PROJECT_REF ||
  url.hostname !== OSCAR_SUPABASE_POOLER_HOST ||
  url.port !== '5432' || url.pathname !== '/postgres' || url.hash)
  throw new Error('A URI não corresponde ao projeto Supabase exclusivo do OScar.');
 let password;
 try { password = decodeURIComponent(url.password); }
 catch { throw new Error('A URI PostgreSQL do OScar é inválida.'); }
 if (!password || ['[YOUR-PASSWORD]', 'YOUR-PASSWORD', 'SUBSTITUA_A_SENHA'].includes(password.toUpperCase()))
  throw new Error('A senha do banco OScar ainda não foi informada.');
 return { projectRef: OSCAR_SUPABASE_PROJECT_REF, host: OSCAR_SUPABASE_POOLER_HOST };
}
