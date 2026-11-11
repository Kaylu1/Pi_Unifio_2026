import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { assert, DomainError } from './domain.ts';
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
export function validOrigin(value: any, { localOnly = false, allowLocalHttp = false }: any = {}) { let url; try {
    url = new URL(value);
}
catch {
    throw new DomainError(503, 'Configure uma origem HTTPS válida para a aplicação.');
} assert((url.protocol === 'https:' || (allowLocalHttp && url.protocol === 'http:' && LOOPBACK.includes(url.hostname))) && (!localOnly || LOOPBACK.includes(url.hostname)) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 'Configure uma origem HTTPS válida sem caminho ou credenciais.', 503); return url.origin; }
export function validateRequestPolicy(req: any, { allowedHosts, allowedOrigins }: any) { const raw = req.headers?.host; assert(typeof raw === 'string', 'Cabeçalho Host inválido.', 400); let host; try {
    host = new URL('http://' + raw);
}
catch {
    throw new DomainError(400, 'Cabeçalho Host inválido.');
} assert(allowedHosts.includes(host.host.toLowerCase()) || allowedHosts.includes(host.hostname.toLowerCase()), 'Host não autorizado. Use o endereço configurado da aplicação.', 403); const origin = req.headers.origin; if (origin !== undefined) {
    assert(typeof origin === 'string', 'Origem inválida.', 403);
    const direct = `${req.socket?.encrypted ? 'https' : 'http'}://${raw}`;
    assert(allowedOrigins.includes(origin) || (LOOPBACK.includes(host.hostname) && origin === direct), 'Origem não autorizada. Abra a aplicação pelo endereço configurado.', 403);
} }
export function clientAddress(req: any, { trustProxy = false }: any = {}) { if (trustProxy) {
    for (const header of ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for']) {
        const value = req.headers[header];
        if (typeof value === 'string') {
            const ip = value.split(',')[0].trim();
            if (isIP(ip))
                return ip;
        }
    }
} return isIP(req.socket?.remoteAddress ?? '') ? req.socket.remoteAddress : 'unknown'; }
export async function readRequestBody(req: any, mutation: any) {
    if (!mutation)
        return {};
    assert(String(req.headers['content-type'] ?? '').split(';')[0] === 'application/json', 'Envie o formulário como JSON.', 415);
    let body = req.body;
    if (body === undefined) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            assert(size <= 1024 * 1024, 'O formulário excedeu o tamanho permitido.', 413);
            chunks.push(chunk);
        }
        body = chunks.length ? Buffer.concat(chunks) : {};
    }
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        assert(Buffer.byteLength(body) <= 1024 * 1024, 'O formulário excedeu o tamanho permitido.', 413);
        try {
            body = JSON.parse(String(body));
        }
        catch {
            throw new DomainError(400, 'JSON inválido. Revise os dados enviados.');
        }
    }
    else {
        let size;
        try {
            size = Buffer.byteLength(JSON.stringify(body));
        }
        catch {
            throw new DomainError(400, 'JSON inválido.');
        }
        assert(size <= 1024 * 1024, 'O formulário excedeu o tamanho permitido.', 413);
    }
    assert(body && typeof body === 'object' && !Array.isArray(body), 'Envie um objeto JSON com os dados do formulário.');
    return body;
}
export function checkCron(req: any, secret: any) { assert(typeof secret === 'string' && secret.length >= 16, 'Configure CRON_SECRET com pelo menos 16 caracteres para ativar a manutenção.', 503); const actual = Buffer.from(String(req.headers.authorization ?? '')), expected = Buffer.from('Bearer ' + secret); assert(actual.length === expected.length && timingSafeEqual(actual, expected), 'Manutenção não autorizada.', 401); }
