import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../core/api.service';
import { statusLabel } from '../core/status';
import { CreateOrderDialog } from '../orders/order-dialogs';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard-metrics.scss', './dashboard-operations.scss', './dashboard.scss', './dashboard-responsive.scss']
})
export class DashboardPage {
  statusLabel = statusLabel;
  readonly today = new Date();
  readonly states = ['aberta', 'inspecao', 'aguardando_aprovacao', 'execucao', 'concluida'];
  readonly stageIcons: Record<string, string> = {
    aberta: 'move_to_inbox',
    inspecao: 'troubleshoot',
    aguardando_aprovacao: 'fact_check',
    execucao: 'build',
    concluida: 'task_alt'
  };

  constructor(public api: ApiService, private dialog: MatDialog, private router: Router) {}

  get orders(): any[] { return this.api.data().orders || []; }
  get active() { return this.orders.filter(x => !['encerrada', 'cancelada'].includes(x.status)); }
  get closed() { return this.orders.filter(x => x.status === 'encerrada'); }
  get parts(): any[] { return (this.api.data().parts || []).filter((x: any) => Number(x.stock) <= Number(x.minimum ?? x.manualMinimum ?? 0)); }
  get pending(): any[] { return (this.api.data().budgets || []).filter((x: any) => ['publicado', 'pendente', 'enviado'].includes(x.status)); }
  get answeredItems(): any[] {
    return (this.api.data().budgets || []).flatMap((x: any) => x.items || [])
      .filter((x: any) => ['aprovado', 'recusado'].includes(x.decision));
  }
  get approvals() {
    return this.answeredItems.length
      ? Math.round(100 * this.answeredItems.filter((x: any) => x.decision === 'aprovado').length / this.answeredItems.length)
      : 0;
  }
  get averageHours() {
    const ended = this.closed.filter(x => Number.isFinite(Date.parse(x.closedAt)) && Number.isFinite(Date.parse(x.createdAt)));
    return ended.length
      ? Math.round(ended.reduce((sum, x) => sum + Math.max(0, (Date.parse(x.closedAt) - Date.parse(x.createdAt)) / 3600000), 0) / ended.length)
      : 0;
  }
  get appointments(): any[] {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(this.today);
    return (this.api.data().appointments || [])
      .filter((x: any) => (x.date || '').startsWith(day) && !['cancelado', 'cancelada'].includes(x.status))
      .sort((a: any, b: any) => (a.time || '').localeCompare(b.time || ''));
  }
  count(status: string) { return this.orders.filter(x => x.status === status).length; }
  percent(status: string) { return this.active.length ? 100 * this.count(status) / this.active.length : 0; }
  get recent() { return [...this.active].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5); }
  get personal() { return this.api.user()?.role === 'cliente'; }
  get canCreate() { return ['gerente', 'atendente'].includes(this.api.user()?.role); }

  createOrder() {
    this.dialog.open(CreateOrderDialog, { width: '720px', disableClose: true, data: {} })
      .afterClosed().subscribe((order: any) => {
        if (order) void this.router.navigate(['/ordens', order.id]);
      });
  }
}
