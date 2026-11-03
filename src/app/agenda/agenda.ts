import { Component, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppointmentDialog, EntityPage } from '../features/feature-pages';
import { AgendaRow, CalendarEvent, DAY_END, DAY_START, HALF_HOUR_HEIGHT, appointmentDuration, clockTime, isCancelled, layoutAppointments, timeMinutes } from './agenda-layout';

type CalendarSlot = { minutes: number; time: string };
type MechanicColumn = { mechanic: AgendaRow; events: CalendarEvent[]; count: number; occupiedMinutes: number };

@Component({
  selector: 'app-agenda-page',
  standalone: false,
  templateUrl: './agenda.html',
  styleUrls: ['./agenda.scss', './agenda-calendar.scss']
})
export class AgendaPage extends EntityPage {
  @ViewChild('appointmentDetails') appointmentDetails?: ElementRef<HTMLElement>;
  override dateFilter = this.localDate(new Date());
  selectedId: number | string | null = null;
  readonly slots: CalendarSlot[] = Array.from({ length: 20 }, (_, index) => ({ minutes: DAY_START + index * 30, time: clockTime(DAY_START + index * 30) }));
  readonly timelineHeight = (DAY_END - DAY_START) / 30 * HALF_HOUR_HEIGHT;
  private columnsCacheKey = '';
  private columnsCacheData: unknown;
  private columnsCache: MechanicColumn[] = [];

  constructor(route: ActivatedRoute) {
    super({ key: 'appointments', endpoint: '/appointments', title: 'Agenda da oficina', singular: 'agendamento', description: 'Horários e atendimentos, organizados por mecânico.', fields: [], columns: [], roles: ['gerente', 'atendente'] });
    const date = route.snapshot.queryParamMap.get('date');
    if (date) this.setDay(date);
    const appointmentId = Number(route.snapshot.queryParamMap.get('appointmentId'));
    if (appointmentId) this.selectedId = appointmentId;
  }

  get today(): string { return this.localDate(new Date()); }
  get dateLabel(): string { return new Date(`${this.dateFilter}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  get isToday(): boolean { return this.dateFilter === this.today; }
  get services(): AgendaRow[] { return this.api.data()['services'] || []; }
  get dayRows(): AgendaRow[] { return this.rows.filter(row => row['date'] === this.dateFilter); }
  get selected(): AgendaRow | undefined { return this.rows.find(row => String(row['id']) === String(this.selectedId)); }
  get visibleRows(): AgendaRow[] {
    return this.dayRows.filter(row => (this.filter === 'all' || row['status'] === this.filter)
      && (!this.mechanicFilter || String(row['mechanicId']) === String(this.mechanicFilter)) && this.matchesSearch(row));
  }
  get availableMechanics(): AgendaRow[] {
    return this.mechanics.filter(mechanic => this.api.user()?.role !== 'mecanico' || String(mechanic['id']) === String(this.api.user()?.id));
  }
  get calendarMechanics(): AgendaRow[] {
    return this.availableMechanics.filter(mechanic => !this.mechanicFilter || String(mechanic['id']) === String(this.mechanicFilter));
  }
  get columns(): MechanicColumn[] {
    const key = [this.dateFilter, this.filter, this.mechanicFilter, this.q, this.api.user()?.role, this.api.user()?.id].join('|');
    const data = this.api.data();
    if (this.columnsCacheData === data && this.columnsCacheKey === key) return this.columnsCache;
    this.columnsCacheData = data; this.columnsCacheKey = key;
    this.columnsCache = this.calendarMechanics.map(mechanic => {
      const rows = this.visibleRows.filter(row => String(row['mechanicId']) === String(mechanic['id']));
      const occupied = this.dayRows.filter(row => String(row['mechanicId']) === String(mechanic['id']) && !isCancelled(row));
      const intervals = occupied.map(row => ({ start: Math.max(DAY_START, timeMinutes(row['time'])), end: Math.min(DAY_END, timeMinutes(row['time']) + this.duration(row)) }))
        .filter(interval => Number.isFinite(interval.start) && interval.end > interval.start).sort((a, b) => a.start - b.start);
      let occupiedMinutes = 0; let end = DAY_START;
      for (const interval of intervals) { occupiedMinutes += Math.max(0, interval.end - Math.max(interval.start, end)); end = Math.max(end, interval.end); }
      return { mechanic, events: layoutAppointments(rows, this.services), count: occupied.length, occupiedMinutes };
    });
    return this.columnsCache;
  }
  get gridTemplate(): string { return `76px repeat(${Math.max(1, this.columns.length)}, minmax(250px, 1fr))`; }
  get cancelledRows(): AgendaRow[] { return this.visibleRows.filter(row => isCancelled(row)).sort((a, b) => String(a['time']).localeCompare(String(b['time']))); }
  get outsideRows(): AgendaRow[] {
    return this.visibleRows.filter(row => !isCancelled(row) && (!this.calendarMechanics.some(mechanic => String(mechanic['id']) === String(row['mechanicId']))
      || !Number.isFinite(timeMinutes(row['time'])) || timeMinutes(row['time']) < DAY_START || timeMinutes(row['time']) + this.duration(row) > DAY_END));
  }
  get shortRows(): AgendaRow[] { return this.columns.flatMap(column => column.events.filter(event => event.height < 44).map(event => event.row)); }
  get visibleCount(): number { return this.visibleRows.filter(row => !isCancelled(row)).length; }
  get hasFilters(): boolean { return !!this.q || this.filter !== 'all' || !!this.mechanicFilter; }
  get isPastDay(): boolean { return this.dateFilter < this.today; }

  localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  setDay(value: string): void {
    const parsed = new Date(`${value}T12:00:00`);
    this.dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && this.localDate(parsed) === value ? value : this.today;
    this.selectedId = null;
  }
  moveDay(direction: number): void { const date = new Date(`${this.dateFilter}T12:00:00`); date.setDate(date.getDate() + direction); this.setDay(this.localDate(date)); }
  goToday(): void { this.setDay(this.today); }
  clearFilters(): void { this.q = ''; this.filter = 'all'; this.mechanicFilter = ''; this.selectedId = null; }
  override trackRow(_index: number, row: AgendaRow): unknown { return row['id']; }
  trackColumn(_index: number, column: MechanicColumn): unknown { return column.mechanic['id']; }
  trackEvent(_index: number, event: CalendarEvent): unknown { return event.row['id']; }
  duration(row: AgendaRow): number { return appointmentDuration(row, this.services); }
  durationLabel(minutes: number): string {
    const hours = Math.floor(minutes / 60); const rest = Math.round(minutes % 60);
    return hours ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest}min`;
  }
  endTime(row: AgendaRow): string { return clockTime(timeMinutes(row['time']) + this.duration(row)); }
  clientName(row: AgendaRow): string { return this.relation('clients', row['clientId']) === '—' ? 'Cliente do atendimento' : this.relation('clients', row['clientId']); }
  vehicleLabel(row: AgendaRow): string { return this.relation('vehicles', row['vehicleId']) === '—' ? 'Veículo do atendimento' : this.relation('vehicles', row['vehicleId']); }
  registrationPending(row: AgendaRow): boolean { return this.api.client(Number(row['clientId']))?.registrationStatus === 'provisorio' || this.api.vehicle(Number(row['vehicleId']))?.registrationStatus === 'provisorio'; }
  serviceNames(row: AgendaRow): string { return (row['serviceIds'] || []).map((id: number) => this.relation('services', id)).join(' · '); }
  eventLabel(row: AgendaRow): string { return `${row['time']} às ${this.endTime(row)}, ${this.clientName(row)}, ${this.vehicleLabel(row)}, ${this.statusLabel(row['status'])}. Ver atendimento.`; }
  private matchesSearch(row: AgendaRow): boolean {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const content = `${this.clientName(row)} ${this.vehicleLabel(row)} ${this.relation('users', row['mechanicId'])} ${this.serviceNames(row)} ${row['time']} ${this.statusLabel(row['status'])}`;
    return !this.q.trim() || normalize(content).includes(normalize(this.q.trim()));
  }
  slotState(mechanic: AgendaRow, slot: CalendarSlot): 'closed' | 'past' | 'occupied' | 'free' {
    const settings = this.api.data()['settings'] || {};
    const opening = Number(settings['openingHour'] ?? 8) * 60; const closing = Number(settings['closingHour'] ?? 18) * 60;
    if (slot.minutes < opening || slot.minutes + 30 > closing) return 'closed';
    if (this.dayRows.some(row => String(row['mechanicId']) === String(mechanic['id']) && !isCancelled(row)
      && slot.minutes < timeMinutes(row['time']) + this.duration(row) && timeMinutes(row['time']) < slot.minutes + 30)) return 'occupied';
    const now = new Date();
    if (this.isPastDay || (this.isToday && slot.minutes < now.getHours() * 60 + now.getMinutes())) return 'past';
    return 'free';
  }
  canChooseSlot(mechanic: AgendaRow, slot: CalendarSlot): boolean {
    const settings = this.api.data()['settings'] || {};
    const interval = Number(settings['appointmentIntervalMinutes'] ?? 30); const opening = Number(settings['openingHour'] ?? 8) * 60;
    return this.canWrite && !this.api.loading() && this.slotState(mechanic, slot) === 'free' && interval > 0 && (slot.minutes - opening) % interval === 0;
  }
  slotLabel(mechanic: AgendaRow, slot: CalendarSlot): string {
    const state = this.slotState(mechanic, slot);
    const label = ({ free: this.canWrite ? 'Iniciar agendamento' : 'Livre', occupied: 'Ocupado', closed: 'Fora do expediente', past: 'Horário passado' })[state];
    return `${slot.time}, ${mechanic['name']}. ${label}.`;
  }
  chooseSlot(mechanic: AgendaRow, slot: CalendarSlot): void { if (this.canChooseSlot(mechanic, slot)) this.openAppointment(undefined, { date: this.dateFilter, mechanicId: mechanic['id'], time: slot.time }); }
  override appointment(row?: AgendaRow): void {
    const prefill = this.dateFilter >= this.today ? { date: this.dateFilter, ...(this.mechanicFilter ? { mechanicId: Number(this.mechanicFilter) } : {}) } : undefined;
    this.openAppointment(row, prefill);
  }
  private openAppointment(row?: AgendaRow, prefill?: { date: string; mechanicId?: number | string; time?: string }): void {
    if (!this.canWrite) return;
    const ids = new Set(this.rows.map(item => String(item['id'])));
    this.dialog.open(AppointmentDialog, { width: '680px', maxWidth: 'calc(100vw - 24px)', data: { row, prefill } }).afterClosed().subscribe(saved => {
      if (!saved) return;
      const current = row ? this.rows.find(item => String(item['id']) === String(row['id'])) : this.rows.find(item => !ids.has(String(item['id'])));
      if (current) { this.dateFilter = current['date']; this.selectedId = current['id']; if (this.mechanicFilter && String(current['mechanicId']) !== String(this.mechanicFilter)) this.mechanicFilter = ''; }
    });
  }
  selectAppointment(row: AgendaRow): void {
    this.selectedId = row['id'];
    setTimeout(() => { this.appointmentDetails?.nativeElement.focus({ preventScroll: true }); this.appointmentDetails?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'auto' }); });
  }
}
