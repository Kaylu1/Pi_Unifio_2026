import type { IncomingHttpHeaders } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashToken, verifyPassword } from '../auth-crypto.ts';
import { assert } from '../domain.ts';
import { emailValue, safeUser } from '../common.ts';
import type { UserRecord, WorkshopRepository } from '../contracts.ts';
import { SecurityRepository } from '../repositories/security-repository.ts';

export interface Authentication {
  user: UserRecord | null;
  mode: 'basic' | 'session' | 'anonymous';
  token?: string;
  csrf?: string;
}

export class AuthService {
  private repository: WorkshopRepository;
  private secureCookies: boolean;
  private security: SecurityRepository;

  constructor(repository: WorkshopRepository, secureCookies = true) {
    this.repository = repository;
    this.secureCookies = secureCookies;
    this.security = new SecurityRepository(repository);
  }

  cookie(token: string, maxAge = 1800): string {
    return 'oscar_session=' + token + '; HttpOnly; SameSite=Strict; Path=/api; Max-Age=' + maxAge
      + (this.secureCookies ? '; Secure' : '');
  }

  async login(body: Record<string, any>): Promise<{ user: any; csrfToken: string; cookie: string }> {
    const email = emailValue(body.email);
    const user = await this.credentials(email, body.password);
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    await this.repository.transaction(async () => {
      const current = await this.credentials(email, body.password);
      await this.security.createSession(hashToken(token), current.id, csrf);
      await this.repository.audit(current, 'entrar', 'sessao', current.id);
    });
    return { user: safeUser(user), csrfToken: csrf, cookie: this.cookie(token) };
  }

  private async credentials(email: string, password: unknown): Promise<UserRecord> {
    const user = (await this.repository.list('users')).find(item => item.email === email);
    const passwordHash = user ? await this.security.passwordHash(user.id) : undefined;
    const valid = typeof password === 'string' && password.length <= 128 && verifyPassword(password, passwordHash);
    assert(valid && user?.active, 'E-mail ou senha incorretos.', 401);
    return user as UserRecord;
  }

  async authenticate(headers: IncomingHttpHeaders): Promise<Authentication> {
    const authorization = headers.authorization;
    if (authorization !== undefined) {
      assert(/^Basic /i.test(authorization), 'Use autenticação HTTP Basic com usuário e senha de teste.', 401);
      const encoded = authorization.slice(6).trim();
      assert(encoded.length > 0 && encoded.length <= 2048 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'Credenciais HTTP Basic inválidas.', 401);
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      assert(separator > 0, 'Credenciais HTTP Basic inválidas.', 401);
      const user = await this.credentials(decoded.slice(0, separator).trim().toLowerCase(), decoded.slice(separator + 1));
      return { user, mode: 'basic' };
    }
    const token = /(?:^|;\s*)oscar_session=([^;]+)/.exec(headers.cookie ?? '')?.[1];
    let session = token ? await this.security.session(hashToken(token)) : null;
    if (session && session.lastSeen <= Date.now() - 30 * 60000) {
      await this.security.deleteSession(session.token);
      session = null;
    }
    const user = session ? await this.repository.get('users', session.userId) : null;
    if (!user?.active || !session) return { user: null, mode: 'anonymous' };
    await this.security.touchSession(session.token);
    return { user: user as UserRecord, mode: 'session', token, csrf: session.csrf };
  }

  async authorizeMutation(auth: Authentication, headers: IncomingHttpHeaders): Promise<UserRecord> {
    assert(auth.user, 'Sua sessão expirou. Entre novamente para continuar.', 401);
    const currentUser = await this.repository.get('users', auth.user.id);
    assert(currentUser?.active, 'Sua sessão expirou. Entre novamente para continuar.', 401);
    if (auth.mode === 'session') {
      const session = await this.security.session(hashToken(auth.token));
      assert(session && session.lastSeen > Date.now() - 30 * 60000, 'Sua sessão expirou. Entre novamente para continuar.', 401);
      assert(headers['x-csrf-token'] === session.csrf, 'Atualize a página e tente novamente: token de segurança inválido.', 403);
    }
    return currentUser as UserRecord;
  }

  async logout(auth: Authentication): Promise<void> {
    if (auth.mode === 'session') await this.security.deleteSession(hashToken(auth.token));
  }
}
