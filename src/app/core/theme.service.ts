import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
const STORAGE_KEY = 'oscar.theme';
const isTheme = (value: string | null): value is ThemeMode => value === 'light' || value === 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly view = this.document.defaultView;
  private readonly system = this.view?.matchMedia('(prefers-color-scheme: dark)');
  private explicit = false;
  readonly mode = signal<ThemeMode>('light');
  readonly actionLabel = computed(() => this.mode() === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
  readonly icon = computed(() => this.mode() === 'dark' ? 'light_mode' : 'dark_mode');

  constructor() {
    let stored: string | null = null;
    try { stored = this.view?.localStorage.getItem(STORAGE_KEY) ?? null; } catch { /* Preferência permanece utilizável sem armazenamento. */ }
    this.explicit = isTheme(stored);
    this.apply(isTheme(stored) ? stored : this.system?.matches ? 'dark' : 'light');
    const systemChanged = () => { if (!this.explicit) this.apply(this.system?.matches ? 'dark' : 'light'); };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      this.explicit = isTheme(event.newValue);
      this.apply(isTheme(event.newValue) ? event.newValue : this.system?.matches ? 'dark' : 'light');
    };
    this.system?.addEventListener('change', systemChanged);
    this.view?.addEventListener('storage', storageChanged);
    inject(DestroyRef).onDestroy(() => {
      this.system?.removeEventListener('change', systemChanged);
      this.view?.removeEventListener('storage', storageChanged);
    });
  }

  toggle(): void {
    const next = this.mode() === 'dark' ? 'light' : 'dark';
    this.explicit = true;
    this.apply(next);
    try { this.view?.localStorage.setItem(STORAGE_KEY, next); } catch { /* Navegadores privados podem bloquear o armazenamento. */ }
  }

  private apply(mode: ThemeMode): void {
    this.mode.set(mode);
    this.document.documentElement.dataset['theme'] = mode;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#111115' : '#f5f5f7');
  }
}