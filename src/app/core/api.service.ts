import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

const emptyData = () => ({ clients: [], vehicles: [], users: [], services: [], appointments: [], orders: [], budgets: [], parts: [], suppliers: [], movements: [], tickets: [], settings: {}, dashboard: {}, audit: [], emails: [] });

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly user = signal<any>(null);
  readonly data = signal<any>(emptyData());
  readonly ready = signal(false);
  readonly loading = signal(false);
  private csrfToken = '';
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private http: HttpClient, private snack: MatSnackBar) {
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(event, () => this.activity(), { passive: true });
    }
  }

  private activity() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.user()) this.idleTimer = setTimeout(() => {
      void this.post('/logout').finally(() => {
        this.user.set(null);
        this.data.set(emptyData());
        this.notify('Sua sessão foi encerrada após 30 minutos sem atividade.');
        window.location.assign('/entrar');
      });
    }, 30 * 60 * 1000);
  }

  async initialize() {
    try {
      const session = await this.get('/session');
      this.user.set(session.user);
      this.csrfToken = session.csrfToken || '';
      if (session.user) { await this.load(); this.activity(); }
    } catch {
      this.user.set(null);
    } finally { this.ready.set(true); }
  }

  async login(email: string, password: string) {
    const session = await this.post('/login', { email, password });
    this.user.set(session.user);
    this.csrfToken = session.csrfToken || '';
    await this.load();
    this.activity();
    return session.user;
  }

  async logout() {
    await this.post('/logout');
    this.user.set(null); this.data.set(emptyData()); this.csrfToken = '';
  }

  async load() {
    this.loading.set(true);
    try { this.data.set({ ...emptyData(), ...await this.get('/bootstrap') }); }
    finally { this.loading.set(false); }
  }

  get(path: string, params?: Record<string, string | number>): Promise<any> {
    return this.request('GET', path, undefined, params);
  }
  post(path: string, body: any = {}): Promise<any> { return this.request('POST', path, body); }
  put(path: string, body: any): Promise<any> { return this.request('PUT', path, body); }
  remove(path: string): Promise<any> { return this.request('DELETE', path); }

  private async request(method: string, path: string, body?: any, params?: Record<string, string | number>): Promise<any> {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (this.csrfToken && method !== 'GET') headers = headers.set('X-CSRF-Token', this.csrfToken);
    try {
      return await firstValueFrom(this.http.request(method, '/api' + path, { body, headers, params, withCredentials: true }));
    } catch (error) {
      const response = error as HttpErrorResponse;
      if (response.status === 401 && this.user()) { this.user.set(null); this.data.set(emptyData()); }
      throw new Error(response.error?.message || (response.status === 0 ? 'Não foi possível acessar o servidor local. Verifique se a API está em execução e tente novamente.' : 'Não foi possível concluir. Confira os dados e tente novamente.'));
    }
  }

  notify(message: string) { this.snack.open(message, 'Fechar', { duration: 6000, horizontalPosition: 'end', verticalPosition: 'bottom' }); }
  client(id: number | string) { return this.data().clients.find((x: any) => String(x.id) === String(id)); }
  vehicle(id: number | string) { return this.data().vehicles.find((x: any) => String(x.id) === String(id)); }
  person(id: number | string) { return this.data().users.find((x: any) => String(x.id) === String(id)); }
}
