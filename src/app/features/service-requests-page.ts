import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ConfirmDialog } from '../core/confirm-dialog';

type RequestStatus = 'pendente' | 'em_contato' | 'atendida' | 'cancelada';
type RequestService = {
  id: number;
  name: string;
  price: number;
  durationMinutes: number;
  purpose: 'avaliacao' | 'execucao';
};
type ServiceRequest = {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  plate?: string;
  preferredDate?: string;
  preferredPeriod?: 'manha' | 'tarde';
  symptoms?: string;
  services: RequestService[];
  total: number;
  durationMinutes: number;
  status: RequestStatus;
  createdAt: string;
  anonymizedAt?: string;
};

@Component({
  selector: 'app-service-requests-page',
  standalone: false,
  templateUrl: './service-requests-page.html',
  styleUrl: './service-requests-page.scss'
})
export class ServiceRequestsPage implements OnInit {
  rows: ServiceRequest[] = [];
  total = 0;
  page = 1;
  readonly pageSize = 30;
  selectedId: number | null = null;
  query = '';
  filter: 'abertas' | 'todas' = 'abertas';
  loading = true;
  busy = false;
  error = '';
  private linkedId: number | null = null;

  private readonly currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  constructor(public api: ApiService, private dialog: MatDialog, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('pedido'));
    this.linkedId = Number.isSafeInteger(id) && id > 0 ? id : null;
    this.selectedId = this.linkedId;
    void this.load();
  }

  get canManage(): boolean {
    return ['gerente', 'atendente'].includes(this.api.user()?.role);
  }

  get filteredRows(): ServiceRequest[] {
    const query = this.normalize(this.query.trim());
    return this.rows.filter(row => {
      if (this.filter === 'abertas' && !['pendente', 'em_contato'].includes(row.status)) return false;
      return !query || this.normalize([
        row.name, row.phone, row.vehicle, row.plate, row.symptoms,
        ...(row.services || []).map(service => service.name)
      ].join(' ')).includes(query);
    });
  }

  get selected(): ServiceRequest | null {
    return this.filteredRows.find(row => row.id === this.selectedId) ?? this.filteredRows[0] ?? null;
  }

  get openCount(): number {
    return this.rows.filter(row => ['pendente', 'em_contato'].includes(row.status)).length;
  }

  get lastPage(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const response = await this.api.get('/service-requests', { page: this.page, pageSize: this.pageSize });
      this.rows = Array.isArray(response.items) ? response.items : [];
      this.total = Number(response.total ?? this.rows.length);
      if (this.linkedId && !this.rows.some(row => row.id === this.linkedId)) {
        const linked = await this.api.get('/service-requests/' + this.linkedId);
        this.rows = [linked, ...this.rows];
      }
      if (this.linkedId) {
        const linked = this.rows.find(row => row.id === this.linkedId);
        if (linked && !['pendente', 'em_contato'].includes(linked.status)) this.filter = 'todas';
        this.linkedId = null;
      }
      if (!this.rows.some(row => row.id === this.selectedId)) this.selectedId = this.rows[0]?.id ?? null;
    } catch (error: any) {
      this.error = error.message || 'Não foi possível carregar as solicitações.';
    } finally {
      this.loading = false;
    }
  }

  select(row: ServiceRequest): void {
    this.selectedId = row.id;
    if (window.matchMedia('(max-width: 820px)').matches) {
      requestAnimationFrame(() => document.getElementById('request-detail')?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      }));
    }
  }

  async changeStatus(status: RequestStatus): Promise<void> {
    const row = this.selected;
    if (!row || this.busy || !this.canManage) return;

    if (status === 'atendida' || status === 'cancelada') {
      const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialog, {
        width: '460px',
        data: {
          title: status === 'atendida' ? 'Concluir solicitação?' : 'Cancelar solicitação?',
          message: status === 'atendida'
            ? 'Conclua somente depois de combinar o atendimento com o cliente. Esta ação não cria um agendamento.'
            : 'A solicitação será encerrada. O histórico continuará disponível para consulta.',
          action: status === 'atendida' ? 'Concluir' : 'Cancelar solicitação'
        }
      }).afterClosed());
      if (!confirmed) return;
    }

    this.busy = true;
    this.error = '';
    try {
      await this.api.put('/service-requests/' + row.id, { status });
      await this.load();
      await this.api.refreshServiceRequests(false);
      this.api.notify(status === 'em_contato' ? 'Solicitação marcada como em contato.' :
        status === 'atendida' ? 'Solicitação concluída.' : 'Solicitação cancelada.');
    } catch (error: any) {
      this.error = error.message || 'Não foi possível atualizar a solicitação.';
    } finally {
      this.busy = false;
    }
  }

  async anonymize(): Promise<void> {
    const row = this.selected;
    if (!row || row.anonymizedAt || this.busy || this.api.user()?.role !== 'gerente') return;
    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Excluir dados pessoais desta solicitação?',
        message: 'Nome, telefone, veículo, placa, relato e preferência de horário serão removidos da solicitação e das cópias internas. Esta ação não pode ser desfeita. O histórico técnico será preservado.',
        confirm: 'Excluir dados pessoais'
      }
    }).afterClosed());
    if (!confirmed) return;

    this.busy = true;
    this.error = '';
    try {
      await this.api.post('/service-requests/' + row.id + '/anonymize');
      this.filter = 'todas';
      await this.load();
      await this.api.refreshServiceRequests(false);
      this.api.notify('Dados pessoais da solicitação excluídos.');
    } catch (error: any) {
      this.error = error.message || 'Não foi possível excluir os dados pessoais.';
    } finally {
      this.busy = false;
    }
  }

  statusText(status: RequestStatus): string {
    return ({
      pendente: 'Aguardando contato',
      em_contato: 'Em contato',
      atendida: 'Concluída',
      cancelada: 'Cancelada'
    })[status] ?? status;
  }

  money(value: number): string {
    return this.currency.format(Number(value) || 0);
  }

  date(value: string): string {
    return value ? new Date(value).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }) : '—';
  }

  day(value: string): string {
    const parts = String(value).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : value;
  }
  phoneHref(phone: string): string {
    return 'tel:' + String(phone || '').replace(/\D/g, '');
  }

  trackRequest(_index: number, row: ServiceRequest): number { return row.id; }
  trackService(_index: number, service: RequestService): number { return service.id; }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }
}
