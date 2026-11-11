import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError, assert } from '../domain.ts';
import { clientAddress, readRequestBody, validateRequestPolicy } from '../http-policy.ts';
import type { ServiceResult } from '../contracts.ts';
import { ApplicationService } from '../services/application-service.ts';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export interface ControllerOptions {
  allowedHosts: string[];
  allowedOrigins: string[];
  trustProxy?: boolean;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export class ApiController {
  private service: ApplicationService;
  private options: ControllerOptions;

  constructor(service: ApplicationService, options: ControllerOptions) {
    this.service = service;
    this.options = options;
  }

  handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      validateRequestPolicy(req, this.options);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      assert(pathname.startsWith('/api/'), 'Endpoint não encontrado.', 404);
      const method = req.method ?? 'GET';
      const mutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
      const body = await readRequestBody(req, mutation);
      const result = await this.service.handle({ route: pathname.slice(4), method, body, url,
        headers: req.headers, address: clientAddress(req, this.options) });
      this.respond(res, result);
      if (mutation && process.env.SMTP_HOST && this.options.waitUntil && (result.status ?? 200) < 400) {
        this.options.waitUntil(this.service.drainEmails().catch(() => undefined));
      }
    } catch (error: any) {
      this.fail(res, error);
    }
  };

  private respond(res: ServerResponse, result: ServiceResult): void {
    const headers = { ...RESPONSE_HEADERS, ...result.headers };
    if (result.pdf) {
      const bytes = Buffer.from(result.pdf);
      res.writeHead(200, { ...headers, 'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + result.filename + '"', 'Content-Length': String(bytes.length) });
      res.end(bytes);
      return;
    }
    if (result.csv) {
      const escape = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"';
      const data = result.data;
      const rows = [['Tipo', 'O.S.', 'Cliente', 'Veículo', 'Descrição', 'Quantidade', 'Valor'],
        ...data.services.map((item: any) => ['Serviço', item.number ?? item.orderId, item.clientName, item.vehiclePlate, item.description, item.quantity, item.total]),
        ...data.parts.map((item: any) => ['Peça', '', '', '', item.description, item.quantity, item.total])];
      res.writeHead(200, { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="relatorio-oscar.csv"' });
      res.end('\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n'));
      return;
    }
    const status = result.status ?? 200;
    res.writeHead(status, headers);
    res.end(status === 204 ? undefined : JSON.stringify(result.data));
  }

  private fail(res: ServerResponse, error: any): void {
    const known = error instanceof DomainError;
    const constraint = (String(error?.code ?? '').startsWith('ERR_SQLITE') && /constraint|UNIQUE|FOREIGN KEY/i.test(String(error.message)))
      || ['23505', '23503', '23514', 'ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(error?.code);
    const status = known ? error.status : constraint ? 409 : 500;
    if (!known && !constraint) console.error('Falha interna OScar:', error?.code ?? 'UNEXPECTED');
    if (res.headersSent) { res.end(); return; }
    res.writeHead(status, { ...RESPONSE_HEADERS, ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="OScar", charset="UTF-8"' } : {}) });
    res.end(JSON.stringify({ message: known ? error.message : constraint
      ? 'Dados em conflito com cadastro existente. Atualize os registros e tente novamente.'
      : 'Não foi possível concluir. Verifique a configuração do banco ou contate o gerente.' }));
  }
}
