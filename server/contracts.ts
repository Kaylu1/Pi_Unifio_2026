import type { IncomingHttpHeaders } from 'node:http';

export type Role = 'gerente' | 'atendente' | 'mecanico' | 'consultor' | 'cliente';
export interface DomainRecord { id: number; [field: string]: any }
export interface UserRecord extends DomainRecord { name: string; email: string; role: Role; active: boolean; clientId?: number | null }
export type MaybePromise<T> = T | Promise<T>;
export interface SqlStatement {
  get(...values: unknown[]): MaybePromise<any>;
  all(...values: unknown[]): MaybePromise<any[]>;
  run(...values: unknown[]): MaybePromise<any>;
}
export interface WorkshopRepository {
  dialect: string;
  filename?: string | null;
  db: { prepare(sql: string): SqlStatement; exec(sql: string): MaybePromise<any> };
  list(entity: string): MaybePromise<DomainRecord[]>;
  get(entity: string, id: number | string): MaybePromise<DomainRecord | null>;
  save(entity: string, data: Record<string, any>): MaybePromise<DomainRecord>;
  remove?(entity: string, id: number): MaybePromise<any>;
  transaction<T>(operation: () => MaybePromise<T>): MaybePromise<T>;
  runExclusive?<T>(operation: () => MaybePromise<T>): MaybePromise<T>;
  settings(): MaybePromise<Record<string, any>>;
  saveSettings(data: Record<string, any>): MaybePromise<any>;
  audit(user: any, action: string, entity: string, id: number, details?: Record<string, any>): MaybePromise<any>;
  backup(): MaybePromise<any>;
  close(): MaybePromise<void>;
  maintenance?(): MaybePromise<any>;
  consumeRate?(key: string, limit: number, minutes: number): MaybePromise<any>;
  appointmentsByDate?(date: string, mechanicId?: number | null): MaybePromise<any[]>;
  lowStockParts?(): MaybePromise<any[]>;
  purgeClientBackups?(id: number, actor: any): MaybePromise<any>;
  purgeServiceRequestBackups?(id: number, actor: any): MaybePromise<any>;
}
export interface RequestCommand {
  route: string;
  method: string;
  body: Record<string, any>;
  url: URL;
  headers: IncomingHttpHeaders;
  address: string;
}
export interface ServiceContext {
  s: WorkshopRepository;
  route: string;
  method: string;
  body: Record<string, any>;
  user: UserRecord;
  url: URL;
  origin: string;
}
export interface ServiceResult {
  status?: number;
  data?: any;
  headers?: Record<string, string>;
  pdf?: Uint8Array;
  filename?: string;
  csv?: boolean;
  afterCommit?: () => MaybePromise<any>;
}
