import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, NgZone } from '@angular/core';

/** Anima apenas elementos novos. A página continua visível sem JavaScript/IntersectionObserver. */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly view = this.document.defaultView;
  private readonly preference = this.view?.matchMedia('(prefers-reduced-motion: reduce)');
  private mutation?: MutationObserver;
  private intersection?: IntersectionObserver;
  private seen = new WeakSet<Element>();
  private running = new Set<Animation>();
  private frame = 0;

  constructor() {
    const changed = () => { if (this.preference?.matches) this.stop(); };
    this.preference?.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => { this.stop(); this.preference?.removeEventListener('change', changed); });
  }

  watch(root: HTMLElement): void {
    this.stop();
    this.seen = new WeakSet<Element>();
    if (!this.view || this.preference?.matches) return;
    this.zone.runOutsideAngular(() => {
      this.intersection = new IntersectionObserver(entries => {
        let index = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.intersection?.unobserve(entry.target);
          this.reveal(entry.target as HTMLElement, index++);
        }
      }, { threshold: .07 });
      const scan = () => {
        if (this.frame) this.view!.cancelAnimationFrame(this.frame);
        this.frame = this.view!.requestAnimationFrame(() => {
          this.frame = 0;
          if (this.preference?.matches || !root.isConnected) return;
          const targets = root.querySelectorAll<HTMLElement>('[data-motion], .page-head, .surface');
          for (const target of targets) {
            if (this.seen.has(target)) continue;
            if (!target.hasAttribute('data-motion') && target.parentElement?.closest('[data-motion], .surface')) continue;
            this.seen.add(target);
            this.intersection?.observe(target);
          }
        });
      };
      this.mutation = new MutationObserver(scan);
      this.mutation.observe(root, { childList: true, subtree: true });
      scan();
    });
  }

  private reveal(target: HTMLElement, index: number): void {
    if (this.preference?.matches || !target.isConnected || !target.animate) return;
    const bar = target.dataset['motion'] === 'bar';
    const animation = target.animate(bar ? [
      { transform: 'scaleX(0)', transformOrigin: 'left' },
      { transform: 'scaleX(1)', transformOrigin: 'left' }
    ] : [
      { opacity: 0, transform: 'translateY(18px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: bar ? 700 : 480, delay: Math.min(index * 65, 260), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    this.running.add(animation);
    animation.finished.catch(() => {}).finally(() => this.running.delete(animation));
  }

  stop(): void {
    this.mutation?.disconnect(); this.intersection?.disconnect();
    if (this.frame) this.view?.cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const animation of this.running) animation.cancel();
    this.running.clear();
  }
}