import { Component, OnDestroy, inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ApiService } from '../core/api.service';

type RequestService = { id: number; name: string; purpose: string; durationMinutes: number; price: number };
type CatalogueRequest = {
  id: number; name: string; phone: string; vehicle: string; plate?: string;
  symptoms?: string; preferredDate?: string; preferredPeriod?: string;
  services: RequestService[]; serviceIds?: number[]; total: number; clientId?: number | null;
};

@Component({
  selector: 'app-request-confirm-dialog',
  standalone: false,
  templateUrl: './request-confirm-dialog.html',
  styleUrl: './request-confirm-dialog.scss'
})
export class RequestConfirmDialog implements OnDestroy {
  readonly data = inject<{ request: CatalogueRequest }>(MAT_DIALOG_DATA);
  readonly request: CatalogueRequest = this.data.request;
  readonly form = new FormGroup({
    clientId: new FormControl<number | null>(null),
    vehicleId: new FormControl<number | null>(null),
    date: new FormControl('', Validators.required),
    slot: new FormControl('', Validators.required),
    contactConfirmed: new FormControl(false, Validators.requiredTrue),
    acceptCatalogChanges: new FormControl(false),
    acceptIdentityMismatch: new FormControl(false)
  });
  slots: Array<{ mechanicId: number; mechanicName: string; time: string }> = [];
  loadingSlots = false;
  busy = false;
  error = '';
  private availabilitySequence = 0;
  private destroyed = false;

  constructor(public api: ApiService, public ref: MatDialogRef<RequestConfirmDialog>) {
    const requestedDate = this.request.preferredDate;
    if (requestedDate && requestedDate >= this.today) this.form.controls.date.setValue(requestedDate);
    this.form.controls.clientId.valueChanges.subscribe(() => {
      this.form.controls.vehicleId.setValue(null);
      this.form.controls.acceptIdentityMismatch.setValue(false);
    });
    this.form.controls.vehicleId.valueChanges.subscribe(() => this.form.controls.acceptIdentityMismatch.setValue(false));
    this.form.controls.date.valueChanges.subscribe(() => void this.availability());
    if (this.form.controls.date.value) void this.availability();
  }

  ngOnDestroy(): void { this.destroyed = true; this.availabilitySequence++; }

  get today(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  get newClient(): boolean { return !this.form.controls.clientId.value; }
  get newVehicle(): boolean { return !this.form.controls.vehicleId.value; }
  get clients(): any[] {
    const phone = this.digits(this.request.phone);
    return (this.api.data().clients || []).filter((client: any) => client.active !== false)
      .sort((left: any, right: any) => Number(this.digits(right.phone) === phone) - Number(this.digits(left.phone) === phone) || left.name.localeCompare(right.name, 'pt-BR'));
  }
  get vehicles(): any[] {
    const plate = this.digitsAndLetters(this.request.plate);
    return (this.api.data().vehicles || [])
      .filter((vehicle: any) => vehicle.active !== false && vehicle.clientId === this.form.controls.clientId.value)
      .sort((left: any, right: any) => Number(this.digitsAndLetters(right.plate) === plate) - Number(this.digitsAndLetters(left.plate) === plate));
  }
  get serviceIds(): number[] { return this.request.serviceIds || this.request.services.map(service => service.id); }
  get inactiveServices(): RequestService[] {
    return this.request.services.filter(service => !(this.api.data().services || []).some((current: any) => current.id === service.id && current.active !== false));
  }
  get changedServices(): Array<{ requested: RequestService; current: any }> {
    return this.request.services.flatMap(service => {
      const current = (this.api.data().services || []).find((item: any) => item.id === service.id);
      if (!current || current.active === false) return [];
      return current.name !== service.name || current.purpose !== service.purpose
        || Number(current.price).toFixed(2) !== Number(service.price).toFixed(2)
        || Number(current.durationMinutes) !== Number(service.durationMinutes)
        ? [{ requested: service, current }] : [];
    });
  }
  get requestedPeriod(): string {
    return this.request.preferredPeriod === 'manha' ? 'manhã' : this.request.preferredPeriod === 'tarde' ? 'tarde' : 'sem período indicado';
  }
  get selectedClient(): any { return this.clients.find(client => client.id === this.form.controls.clientId.value); }
  get selectedVehicle(): any { return this.vehicles.find(vehicle => vehicle.id === this.form.controls.vehicleId.value); }
  get hasMatchingClient(): boolean { return this.clients.some(client => this.digits(client.phone) === this.digits(this.request.phone)); }
  get hasMatchingVehicle(): boolean {
    return !!this.request.plate && (this.api.data().vehicles || []).some((vehicle: any) => vehicle.active !== false && this.digitsAndLetters(vehicle.plate) === this.digitsAndLetters(this.request.plate));
  }
  get plateOwnerConflict(): boolean {
    const selectedClientId = this.form.controls.clientId.value;
    if (!selectedClientId || !this.request.clientId || selectedClientId === this.request.clientId || !this.request.plate || this.form.controls.vehicleId.value) return false;
    return (this.api.data().vehicles || []).some((vehicle: any) => vehicle.active !== false
      && vehicle.clientId === this.request.clientId
      && this.digitsAndLetters(vehicle.plate) === this.digitsAndLetters(this.request.plate));
  }
  get identityMismatch(): boolean {
    return !!(this.selectedClient && (this.digits(this.selectedClient.phone) !== this.digits(this.request.phone)
      || this.normalizedName(this.selectedClient.name) !== this.normalizedName(this.request.name)))
      || !!(this.selectedVehicle && this.request.plate && this.digitsAndLetters(this.selectedVehicle.plate) !== this.digitsAndLetters(this.request.plate))
      || this.plateOwnerConflict;
  }

  private digits(value: unknown): string { return String(value || '').replace(/\D/g, ''); }
  private digitsAndLetters(value: unknown): string { return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  private normalizedName(value: unknown): string { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  async availability(): Promise<void> {
    const sequence = ++this.availabilitySequence;
    this.form.controls.slot.setValue('', { emitEvent: false });
    this.slots = [];
    const date = this.form.controls.date.value;
    if (!date || date < this.today || !this.serviceIds.length) { this.loadingSlots = false; return; }
    this.loadingSlots = true;
    this.error = '';
    try {
      const result = await this.api.get('/availability', { date, serviceIds: this.serviceIds.join(',') });
      if (sequence === this.availabilitySequence && !this.destroyed) this.slots = result.slots || [];
    } catch (error: any) {
      if (sequence === this.availabilitySequence && !this.destroyed) this.error = error.message || 'Não foi possível consultar horários. Tente outra data.';
    } finally {
      if (sequence === this.availabilitySequence && !this.destroyed) this.loadingSlots = false;
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const values = this.form.getRawValue();
    if (this.form.invalid || this.busy || this.loadingSlots) return;
    if (this.inactiveServices.length) { this.error = 'Há um serviço indisponível no catálogo. Peça ao gerente para reativá-lo antes de confirmar.'; return; }
    if (this.changedServices.length && !values.acceptCatalogChanges) {
      this.error = 'Confirme com o cliente os valores e tempos atualizados antes de agendar.';
      return;
    }
    if (this.identityMismatch && !values.acceptIdentityMismatch) {
      this.error = 'Confira o cliente e o veículo escolhidos antes de associá-los a este pedido.';
      return;
    }
    if (!values.date || values.date < this.today) { this.error = 'Escolha uma data de hoje em diante.'; return; }
    const [mechanicId, time] = String(values.slot).split('|');
    if (!this.slots.some(slot => slot.mechanicId === Number(mechanicId) && slot.time === time)) {
      this.error = 'Esse horário não está mais disponível. Escolha outro.';
      return;
    }
    const payload: any = {
      ...(values.clientId ? { clientId: values.clientId } : {}),
      ...(values.vehicleId ? { vehicleId: values.vehicleId } : {}),
      date: values.date, time, mechanicId: Number(mechanicId), contactConfirmed: values.contactConfirmed === true,
      ...(this.changedServices.length && values.acceptCatalogChanges ? { acceptCatalogChanges: true } : {}),
      ...(this.identityMismatch && values.acceptIdentityMismatch ? { acceptIdentityMismatch: true } : {})
    };
    this.busy = true;
    this.error = '';
    try {
      const result = await this.api.post('/service-requests/' + this.request.id + '/confirm', payload);
      this.ref.close(result);
    } catch (error: any) {
      this.error = error.message || 'Não foi possível confirmar o horário. Revise os dados e tente novamente.';
      try { await this.api.load(); } catch { /* O erro original permanece visível. */ }
      await this.availability();
    } finally {
      this.busy = false;
    }
  }
}
