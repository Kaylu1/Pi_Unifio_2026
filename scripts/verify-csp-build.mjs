import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'dist/oscar/browser/index.html'), 'utf8');
const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
const csp = config.headers
  .flatMap(entry => entry.headers ?? [])
  .find(header => header.key.toLowerCase() === 'content-security-policy')?.value;
const scriptDirective = csp?.split(';').map(value => value.trim()).find(value => value.startsWith('script-src '));

if (!scriptDirective?.includes("'self'") || scriptDirective.includes("'unsafe-inline'")) {
  throw new Error('O build do OScar exige CSP com script-src self sem unsafe-inline.');
}

function attribute(tag, name) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

const stylesheetTags = [...html.matchAll(/<link\b[^>]*>/gi)]
  .map(match => match[0])
  .filter(tag => attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('stylesheet'));
const mainStylesheets = stylesheetTags.filter(tag =>
  /(?:^|\/)styles(?:-[a-z0-9]+)?\.css$/i.test((attribute(tag, 'href') ?? '').split('?')[0]));

if (mainStylesheets.length === 0) {
  throw new Error('O HTML gerado não referencia o stylesheet principal do OScar.');
}
for (const tag of mainStylesheets) {
  if (attribute(tag, 'media')?.toLowerCase() === 'print' || attribute(tag, 'onload') !== null) {
    throw new Error('O stylesheet principal depende de media=print/onload inline, bloqueado pela CSP da Vercel.');
  }
}

console.log('Build CSS compatível com a CSP da Vercel.');
