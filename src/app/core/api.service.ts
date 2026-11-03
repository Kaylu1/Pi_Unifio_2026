import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

const emptyData = () => ({ clients: [], vehicles: [], users: [], services: [], appointments: [], orders: [], budgets: [], parts: [], suppliers: [], movements: [], tickets: [], settings: {}, dashboard: {}, serviceRequests: { openCount: 0, pendingCount: 0, latestPendingId: 0, recentOpen: [] }, audit: [], emails: [] });

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly user = signal<any>(null);
  readonly data = signal<any>(emptyData());
  readonly ready = signal(false);
  readonly loading = signal(false);
  private csrfToken = '';
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private requestRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private requestRefreshInFlight = false;
  private newestKnownRequestId = 0;

  constructor(private http: HttpClient, private snack: MatSnackBar) {
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(event, () => this.activity(), { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refreshServiceRequests();
    });
  }

  private activity() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.user()) this.idleTimer = setTimeout(() => {
      void this.post('/logout').finally(() => {
        this.stopRequestUpdates();
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
    this.stopRequestUpdates();
    this.user.set(null); this.data.set(emptyData()); this.csrfToken = '';
  }

  async load() {
    this.loading.set(true);
    try {
      this.data.set({ ...emptyData(), ...await this.get('/bootstrap') });
      this.newestKnownRequestId = Math.max(this.newestKnownRequestId,
        Number(this.data().serviceRequests.latestPendingId) || 0);
      this.startRequestUpdates();
    }
    finally { this.loading.set(false); }
  }

  async refreshServiceRequests(notifyNew = true): Promise<void> {
    if (!this.isStaff() || this.requestRefreshInFlight || this.loading() || document.visibilityState !== 'visible') return;
    this.requestRefreshInFlight = true;
    const userId = this.user().id;
    try {
      const summary = await this.get('/service-requests/summary');
      if (this.user()?.id !== userId || !Array.isArray(summary?.recentOpen)) return;
      if (this.loading()) return;
      const latestId = Number(summary.latestPendingId) || 0;
      const hasNew = latestId > this.newestKnownRequestId;
      const previous = this.data().serviceRequests;
      const signature = (value: any) => JSON.stringify([
        value?.openCount, value?.pendingCount, value?.latestPendingId,
        (value?.recentOpen || []).map((request: any) => [request.id, request.status, request.updatedAt, request.appointmentId])
      ]);
      const changed = signature(previous) !== signature(summary);
      const mechanic = this.user()?.role === 'mecanico';
      const priorAssignments = mechanic ? new Set((this.data().appointments || [])
        .filter((appointment: any) => appointment.mechanicId === userId && appointment.serviceRequestId && appointment.status === 'agendado')
        .map((appointment: any) => appointment.id)) : new Set<number>();
      this.newestKnownRequestId = Math.max(this.newestKnownRequestId, latestId);
      if (changed) {
        await this.load();
        if (mechanic && this.user()?.id === userId) {
          const newAssignments = (this.data().appointments || []).filter((appointment: any) =>
            appointment.mechanicId === userId && appointment.serviceRequestId && appointment.status === 'agendado' && !priorAssignments.has(appointment.id));
          if (newAssignments.length) this.notify(newAssignments.length === 1
            ? `Novo atendimento do pedido #${newAssignments[0].serviceRequestId} atribuído a você. Confira a agenda.`
            : `${newAssignments.length} atendimentos de pedidos atribuídos a você. Confira a agenda.`);
        }
      } else {
        this.data.update(current => ({ ...current, serviceRequests: summary }));
      }
      if (notifyNew && hasNew) this.notify(`Nova solicitação #${latestId} recebida no catálogo. Confira a fila.`);
    } catch {
      // A atualização automática é retomada no próximo intervalo ou ao voltar para a aba.
    } finally {
      this.requestRefreshInFlight = false;
    }
  }

  private isStaff(): boolean {
    return ['gerente', 'atendente', 'mecanico', 'consultor'].includes(this.user()?.role);
  }

  private startRequestUpdates(): void {
    this.stopRequestUpdates(false);
    if (this.isStaff()) {
      this.requestRefreshTimer = setInterval(() => void this.refreshServiceRequests(), 45_000);
    }
  }

  private stopRequestUpdates(resetKnown = true): void {
    if (this.requestRefreshTimer) clearInterval(this.requestRefreshTimer);
    this.requestRefreshTimer = undefined;
    if (resetKnown) this.newestKnownRequestId = 0;
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
      if (response.status === 401 && this.user()) { this.stopRequestUpdates(); this.user.set(null); this.data.set(emptyData()); }
      throw new Error(response.error?.message || (response.status === 0 ? 'Não foi possível acessar o servidor local. Verifique se a API está em execução e tente novamente.' : 'Não foi possível concluir. Confira os dados e tente novamente.'));
    }
  }

  notify(message: string) { this.snack.open(message, 'Fechar', { duration: 6000, horizontalPosition: 'end', verticalPosition: 'bottom' }); }
  client(id: number | string) { return this.data().clients.find((x: any) => String(x.id) === String(id)); }
  vehicle(id: number | string) { return this.data().vehicles.find((x: any) => String(x.id) === String(id)); }
  person(id: number | string) { return this.data().users.find((x: any) => String(x.id) === String(id)); }
}
