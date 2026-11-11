export * from './server.ts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.ts';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startServer();
