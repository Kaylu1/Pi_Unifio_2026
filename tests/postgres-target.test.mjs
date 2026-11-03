import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { assertOscarSupabaseTarget, OSCAR_SUPABASE_PROJECT_REF } from '../scripts/oscar-supabase-target.mjs';

const uri = 'postgresql://postgres.kotiorssahochknggjzc:temporary-test-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

test('the explicit OScar Supabase target is accepted without contacting a database', () => {
 assert.equal(assertOscarSupabaseTarget(uri).projectRef, OSCAR_SUPABASE_PROJECT_REF);
});

test('another project, endpoint, mode or placeholder credential is rejected before startup', () => {
 for (const candidate of [
  uri.replace('kotiorssahochknggjzc', 'oldcontrolprojectref'),
  uri.replace('aws-0-us-east-1.pooler.supabase.com', 'other.example.com'),
  uri.replace(':5432/', ':6543/'),
  uri.replace('temporary-test-password', '[YOUR-PASSWORD]'),
  uri.replace('temporary-test-password', ''),
  uri + '#fragment',
  uri.replace('postgresql://', 'http://')
 ]) assert.throws(() => assertOscarSupabaseTarget(candidate));
});

test('direct API launch cannot connect to another PostgreSQL project', () => {
 const script = new URL('../server/server.mjs', import.meta.url);
 const result = spawnSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
  encoding: 'utf8',
  env: { ...process.env, OSCAR_STORAGE: 'postgres',
   DATABASE_URL: uri.replace('kotiorssahochknggjzc', 'otherprojectreference') }
 });
 assert.equal(result.status, 1);
 assert.match(result.stderr, /projeto Supabase exclusivo do OScar/);
 assert.ok(!result.stderr.includes('temporary-test-password'));
});
