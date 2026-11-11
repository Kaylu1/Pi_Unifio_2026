import { hashPassword, hashToken } from '../auth-crypto.ts';
import { assert, DomainError } from '../domain.ts';
import { DAY, allow, emailValue, ensure, passwordValue, resetLink, safeUser } from '../common.ts';
import { budgetByToken, decideBudget, publicBudgetView } from '../workflow.ts';
import { createPublicServiceRequest, serviceRequestRoutes } from '../service-requests.ts';
import { orderRoutes } from '../order-routes.ts';
import { operationsRoutes } from '../operations-routes.ts';
import { requestStore } from '../request-store.ts';
import { checkCron, validOrigin } from '../http-policy.ts';
import { drainEmailQueue } from '../email-worker.ts';
import { extendedCrud } from './crud-service.ts';
import { AuthService } from './auth-service.ts';
import { SecurityRepository } from '../repositories/security-repository.ts';
import type { RequestCommand, ServiceContext, ServiceResult, WorkshopRepository } from '../contracts.ts';

export interface ApplicationOptions {
  origin: string;
  secureCookies?: boolean;
  cronSecret?: string;
  emailTransport?: any;
}

export class ApplicationService {
  private repository: WorkshopRepository;
  private auth: AuthService;
  private origin: string;
  private options: ApplicationOptions;
  private rates = new Map<string, { count: number; until: number }>();
  private security: SecurityRepository;

  constructor(repository: WorkshopRepository, options: ApplicationOptions) {
    this.repository = repository;
    this.auth = new AuthService(repository, options.secureCookies ?? true);
    this.options = options;
    this.origin = validOrigin(options.origin, { allowLocalHttp: options.secureCookies === false });
    this.security = new SecurityRepository(repository);
  }

  private async exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.repository.runExclusive ? await this.repository.runExclusive(operation) : await operation();
  }

  private async rate(key: string, limit: number, minutes: number): Promise<void> {
    if (this.repository.consumeRate) {
      const result = await this.repository.consumeRate(key, limit, minutes);
      assert(result === true || result?.allowed === true, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
      return;
    }
    const previous = this.rates.get(key);
    const entry = previous && previous.until > Date.now() ? previous : { count: 0, until: Date.now() + minutes * 60000 };
    entry.count++;
    this.rates.set(key, entry);
    if (this.rates.size > 10000) for (const [storedKey, value] of this.rates) if (value.until < Date.now()) this.rates.delete(storedKey);
    assert(entry.count <= limit, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
  }

  async maintenance(): Promise<any> {
    return this.exclusive(async () => {
      if (this.repository.maintenance) return await this.repository.maintenance();
      await this.repository.transaction(async () => {
        await this.security.expireCredentials();
        for (const budget of (await this.repository.list('budgets')).filter(item => item.status === 'publicado' && Date.parse(item.expiresAt) <= Date.now())) {
          await this.repository.save('budgets', { ...budget, status: 'expirado', link: null });
        }
      });
      return { backup: await this.repository.backup() };
    });
  }

  async drainEmails(): Promise<any> {
    return drainEmailQueue(this.repository, { maxMessages: 3, budgetMs: 8000, transport: this.options.emailTransport });
  }

  async handle(command: RequestCommand): Promise<ServiceResult> {
    return await this.exclusive(() => this.execute(command));
  }

  private async execute(command: RequestCommand): Promise<ServiceResult> {
    const { route, method, body, headers, address, url } = command;
    const s = this.repository;
    const mutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    if (route === '/_maintenance' && method === 'GET') {
      checkCron({ headers }, this.options.cronSecret);
      return { data: { status: 'ok', maintenance: await this.maintenance(), emails: await this.drainEmails() } };
    }
    if (route === '/health' && method === 'GET') return { data: { status: 'ok', mode: 'local', database: s.dialect } };
    if (route === '/public/services' && method === 'GET') {
      return { data: (await s.list('services')).filter(row => row.active).map(({ id, name, description, price, durationMinutes, purpose }) => ({ id, name, description, price, durationMinutes, purpose })) };
    }
    if (route === '/public/service-requests' && method === 'POST') {
      await this.rate('service-request:' + address, 8, 15);
      const record = await s.transaction(() => createPublicServiceRequest(s, body));
      return { status: 201, data: { id: record.id, status: record.status, total: record.total, durationMinutes: record.durationMinutes } };
    }
    if (route === '/auth/forgot' && method === 'POST') {
      await this.rate('forgot:' + address, 5, 15);
      const email = emailValue(body.email);
      const user = (await s.list('users')).find(item => item.email === email && item.active);
      if (user) await s.transaction(() => resetLink(s, user, this.origin));
      return { data: { message: 'Se houver conta ativa para este e-mail, as instruções serão encaminhadas. No modo local, o gerente consulta a caixa de e-mails.' } };
    }
    if (route === '/auth/reset' && method === 'POST') {
      await this.rate('reset:' + address, 15, 15);
      assert(typeof body.token === 'string' && body.token.length >= 32 && body.token.length <= 128, 'Link inválido. Solicite uma nova recuperação.');
      const password = passwordValue(body.password);
      await s.transaction(async () => {
        const reset = await this.security.resetToken(hashToken(body.token));
        assert(reset && !reset.used && reset.expiresAt > Date.now(), 'Link expirado ou já utilizado. Solicite nova recuperação.', 410);
        const user = await ensure(s, 'users', reset.userId);
        assert(user.active, 'Conta inativa. Entre em contato com a oficina.', 403);
        await s.save('users', { ...user, passwordHash: hashPassword(password) });
        await this.security.consumeResetTokens(user.id);
        await this.security.deleteUserSessions(user.id);
        await s.audit(user, 'alterar', 'senha', user.id);
      });
      return { data: { message: 'Senha atualizada. Entre com sua nova senha.' } };
    }
    const publicBudget = /^\/public\/budgets\/([^/]+)(?:\/decisions)?$/.exec(route);
    if (publicBudget && ['GET', 'POST'].includes(method)) {
      await this.rate('budget:' + address, 120, 5);
      const token = decodeURIComponent(publicBudget[1]);
      if (method === 'GET') return { data: await publicBudgetView(s, await budgetByToken(s, token)) };
      await s.transaction(async () => decideBudget(s, await budgetByToken(s, token), body, null, 'link'));
      return { data: { message: 'Resposta registrada. Este link foi encerrado para proteger seus dados.' } };
    }
    if (route === '/login' && method === 'POST') {
      const email = emailValue(body.email);
      await this.rate('login:' + address, 20, 15);
      await this.rate('login-account:' + email, 8, 15);
      const session = await this.auth.login(body);
      return { data: { user: session.user, csrfToken: session.csrfToken }, headers: { 'Set-Cookie': session.cookie } };
    }
    if (headers.authorization) await this.rate('basic:' + address, 240, 15);
    const auth = await this.auth.authenticate(headers);
    const responseHeaders: Record<string, string> = auth.mode === 'session' ? { 'Set-Cookie': this.auth.cookie(auth.token!) } : {};
    if (route === '/session' && method === 'GET') {
      return { data: { user: safeUser(auth.user), ...(auth.mode === 'session' ? { csrfToken: auth.csrf } : {}) }, headers: responseHeaders };
    }
    assert(auth.user, 'Sua sessão expirou. Entre novamente para continuar.', 401);
    if (mutation) await this.auth.authorizeMutation(auth, headers);
    if (route === '/logout' && method === 'POST') {
      await this.auth.logout(auth);
      return { data: { user: null }, headers: { 'Set-Cookie': this.auth.cookie('', 0) } };
    }
    if (route === '/backup' && method === 'POST') {
      allow(auth.user, ['gerente']);
      const backup = await s.backup();
      await s.audit(auth.user, 'criar', 'backup', 0);
      return { data: { ...backup, message: backup?.message ?? 'Cópia de segurança local registrada.' }, headers: responseHeaders };
    }
    const context: ServiceContext = { s: requestStore(s), route, method, body, user: auth.user, url, origin: this.origin };
    const dispatch = async () => await extendedCrud(context) ?? await serviceRequestRoutes(context) ?? await orderRoutes(context) ?? await operationsRoutes(context);
    const result: ServiceResult | null = mutation ? await s.transaction(async () => {
      context.user = await this.auth.authorizeMutation(auth, headers);
      return dispatch();
    }) : await dispatch();
    assert(result, 'Endpoint não encontrado.', 404);
    if (result.afterCommit) {
      try {
        const backupPurge = await result.afterCommit();
        result.data = { ...result.data, backupPurge };
        await this.security.compactAfterPrivacy();
      } catch {
        throw new DomainError(503, 'Dados pessoais removidos da base ativa. O expurgo das cópias encontrou um bloqueio; repita a anonimização para concluir ou contate o gerente.');
      }
    }
    return { ...result, headers: { ...responseHeaders, ...result.headers } };
  }
}
