import type { DomainRecord, Role } from './contracts.ts';

export interface Client extends DomainRecord {
  name: string; cpf?: string; phone: string; email?: string; active: boolean;
}
export interface Vehicle extends DomainRecord {
  clientId: number; plate?: string; chassis?: string; brand: string; model: string;
  year?: number; mileage?: number; active: boolean;
}
export interface User extends DomainRecord {
  clientId?: number | null; name: string; email: string; role: Role; active: boolean;
}
export interface WorkshopService extends DomainRecord {
  name: string; description: string; price: number; durationMinutes: number;
  purpose: 'execucao' | 'avaliacao'; inspectionItems: string[]; active: boolean;
}
export interface Supplier extends DomainRecord {
  name: string; cnpj: string; contact: string; leadDays: number; active: boolean;
}
export interface Part extends DomainRecord {
  supplierId?: number | null; code: string; description: string; unit: string;
  cost: number; price: number; stock: number; manualMinimum?: number; active: boolean;
}
export interface Appointment extends DomainRecord {
  clientId: number; vehicleId: number; mechanicId: number; serviceRequestId?: number | null;
  serviceIds: number[]; date: string; time: string; durationMinutes: number; status: string; reason: string;
}
export interface Order extends DomainRecord {
  clientId: number; vehicleId: number; mechanicId: number; appointmentId?: number | null;
  originOrderId?: number | null; number: number; type: string; status: string;
  items: OrderItem[]; findings: OrderItem[]; closedAt?: string | null;
}
export interface OrderItem {
  id: string; serviceId?: number | null; partId?: number | null; kind: string;
  description: string; quantity: number; price: number; total: number;
  decision: string; executedAt?: string | null; [field: string]: unknown;
}
export interface Budget extends DomainRecord {
  orderId: number; number: number; status: string; items: OrderItem[];
  publishedAt?: string | null; expiresAt?: string | null; answeredAt?: string | null;
}
export interface StockMovement extends DomainRecord {
  partId: number; orderId?: number | null; supplierId?: number | null; userId?: number | null;
  type: 'entrada' | 'saida' | 'estorno'; quantity: number; date: string; notes: string;
}
export interface AfterSalesTicket extends DomainRecord {
  orderId: number; clientId: number; status: string; description: string; notes: string;
}
export interface ServiceRequest extends DomainRecord {
  clientId?: number | null; vehicleId?: number | null; appointmentId?: number | null;
  name: string; phone: string; vehicle: string; plate?: string; symptoms: string;
  serviceIds: number[]; status: string; total: number; durationMinutes: number;
}
export interface EntityModels {
  clients: Client; vehicles: Vehicle; users: User; services: WorkshopService;
  suppliers: Supplier; parts: Part; appointments: Appointment; orders: Order;
  budgets: Budget; movements: StockMovement; tickets: AfterSalesTicket;
  service_requests: ServiceRequest; emails: DomainRecord; audit: DomainRecord;
}
export type EntityName = keyof EntityModels;
