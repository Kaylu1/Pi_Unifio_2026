import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';

type DataConnection = EventTarget & { saveData?: boolean };

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login-page.html',
  styleUrl: './auth-pages.scss'
})
export class LoginPage implements OnInit, OnDestroy {
  email = '';
  password = '';
  showPassword = false;
  busy = false;
  error = '';
  videoEnabled = false;
  videoReady = false;
  videoPlaying = false;
  videoStarting = false;
  videoFailed = false;
  videoBlocked = false;
  readonly videoSource = '/media/workshop-loop.mp4';
  private video?: HTMLVideoElement;
  private motionQuery?: MediaQueryList;
  private connection?: DataConnection;
  private userPaused = false;
  private userRequestedPlayback = false;
  private destroyed = false;
  private playAttempt = 0;
  private lastVideoTime = 0;

  @ViewChild('backgroundVideo')
  set backgroundVideo(element: ElementRef<HTMLVideoElement> | undefined) {
    this.video = element?.nativeElement;
    if (this.video) {
      this.video.muted = true;
      this.video.defaultMuted = true;
      // Angular may assign this query before binding src. canplay starts playback.
    }
  }

  get videoAutoplay() { return !this.userPaused && !this.videoBlocked; }
  get videoCanPause() { return this.videoPlaying || this.videoStarting; }
  get videoControlText() {
    if (this.videoFailed) return 'Tentar vídeo novamente';
    if (this.videoStarting) return 'Carregando vídeo…';
    return this.videoPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo';
  }

  constructor(public api: ApiService, private router: Router) {}

  ngOnInit() {
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.connection = (navigator as Navigator & { connection?: DataConnection }).connection;
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.connection?.addEventListener('change', this.onMotionChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.applyMotionPreference();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.playAttempt++;
    this.video?.pause();
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.connection?.removeEventListener('change', this.onMotionChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onMotionChange = () => {
    this.userRequestedPlayback = false;
    this.applyMotionPreference();
  };
  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      this.playAttempt++;
      this.video?.pause();
      this.videoStarting = false;
    } else if (this.videoEnabled && !this.userPaused && !this.videoBlocked) {
      this.tryPlay();
    }
  };

  private applyMotionPreference() {
    const enabled = this.userRequestedPlayback || (!this.motionQuery?.matches && !this.connection?.saveData);
    if (enabled === this.videoEnabled) return;
    if (!enabled) {
      this.playAttempt++;
      this.video?.pause();
      this.videoReady = false;
      this.videoPlaying = false;
    }
    this.videoEnabled = enabled;
    this.videoStarting = enabled && !this.userPaused && !this.videoFailed;
  }

  private tryPlay() {
    const video = this.video;
    if (!video || !video.getAttribute('src') || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
      this.userPaused || this.videoBlocked || document.hidden || this.destroyed) return;
    const attempt = ++this.playAttempt;
    this.videoStarting = !this.videoPlaying;
    video.play()?.catch((error: DOMException) => {
      if (this.destroyed || attempt !== this.playAttempt || video !== this.video) return;
      this.videoStarting = false;
      this.videoPlaying = false;
      // A source/visibility change may abort loading; the next canplay can retry.
      if (error.name !== 'AbortError') this.videoBlocked = true;
    });
  }

  onVideoReady() {
    this.videoReady = true;
    this.tryPlay();
  }

  onVideoStarted() {
    if (!this.video || this.userPaused || document.hidden || this.destroyed) {
      this.video?.pause();
      return;
    }
    this.videoReady = true;
    this.lastVideoTime = this.video.currentTime;
  }

  onVideoProgress() {
    const video = this.video;
    if (!video) return;
    if (!video.paused && !document.hidden && Math.abs(video.currentTime - this.lastVideoTime) > .015) {
      this.videoPlaying = true;
      this.videoStarting = false;
      this.videoBlocked = false;
    }
    this.lastVideoTime = video.currentTime;
  }

  onVideoPause() {
    this.videoPlaying = false;
    this.videoStarting = false;
  }

  onVideoWaiting() {
    this.videoPlaying = false;
    this.videoStarting = !this.userPaused && !document.hidden;
  }

  onVideoError() {
    if (this.destroyed) return;
    this.playAttempt++;
    this.videoFailed = true;
    this.videoEnabled = false;
    this.videoPlaying = false;
    this.videoStarting = false;
    this.videoReady = false;
  }

  toggleVideo() {
    if (this.videoCanPause) {
      this.userPaused = true;
      this.playAttempt++;
      this.video?.pause();
      this.videoStarting = false;
      return;
    }
    this.userRequestedPlayback = true;
    this.userPaused = false;
    this.videoBlocked = false;
    this.videoFailed = false;
    this.videoStarting = true;
    if (!this.videoEnabled) this.videoEnabled = true;
    else this.tryPlay();
  }

  async submit() {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.api.login(this.email, this.password);
      await this.router.navigateByUrl('/painel');
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-recover',
  standalone: false,
  styleUrl: './recovery-pages.scss',
  template: `
<section class="access-recovery">
  <a class="auth-brand" routerLink="/entrar" aria-label="OScar — entrar">
    <span class="auth-brand-mark" aria-hidden="true"><mat-icon>garage</mat-icon></span>
    <span>OScar<small>Gestão de oficinas</small></span>
  </a>
  <div class="recovery-card">
    <span class="access-symbol" aria-hidden="true"><mat-icon>key</mat-icon></span>
    <h1>Vamos recuperar sua conta</h1>
    <p class="access-description">Informe o e-mail cadastrado para receber as instruções.</p>
    <form (ngSubmit)="submit()" #f="ngForm" [attr.aria-busy]="busy">
      <mat-form-field appearance="outline">
        <mat-label>E-mail</mat-label>
        <input matInput type="email" name="email" [(ngModel)]="email" required email autocomplete="email" inputmode="email">
        <mat-error>Informe um e-mail válido.</mat-error>
      </mat-form-field>
      <p role="status" class="success-note" *ngIf="sent">Se houver uma conta com esse e-mail, as instruções de recuperação serão enviadas.</p>
      <p class="form-error" role="alert" *ngIf="error">{{error}}</p>
      <button mat-flat-button class="access-submit" [disabled]="busy||f.invalid">{{busy?'Enviando…':'Enviar instruções'}}<mat-icon aria-hidden="true">arrow_forward</mat-icon></button>
    </form>
    <a mat-button class="recovery-back" routerLink="/entrar"><mat-icon aria-hidden="true">west</mat-icon>Voltar para entrar</a>
  </div>
  <p class="recovery-foot">OScar · Cada etapa, bem cuidada.</p>
</section>`
})
export class RecoverPage {
  email = '';
  busy = false;
  sent = false;
  error = '';
  constructor(private api: ApiService) {}
  async submit() {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.api.post('/auth/forgot', { email: this.email });
      this.sent = true;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.busy = false;
    }
  }
}

@Component({
  selector: 'app-reset',
  standalone: false,
  styleUrl: './recovery-pages.scss',
  template: `
<section class="access-recovery">
  <a class="auth-brand" routerLink="/entrar" aria-label="OScar — entrar">
    <span class="auth-brand-mark" aria-hidden="true"><mat-icon>garage</mat-icon></span>
    <span>OScar<small>Gestão de oficinas</small></span>
  </a>
  <div class="recovery-card">
    <span class="access-symbol" aria-hidden="true"><mat-icon>lock_reset</mat-icon></span>
    <h1>Escolha sua nova senha</h1>
    <p class="access-description">Crie uma senha para acessar sua conta.</p>
    <form (ngSubmit)="submit()" #f="ngForm" [attr.aria-busy]="busy">
      <mat-form-field appearance="outline">
        <mat-label>Nova senha</mat-label>
        <input matInput type="password" name="password" [(ngModel)]="password" required minlength="10" pattern="(?=.*[A-Za-z])(?=.*[0-9]).*" autocomplete="new-password">
        <mat-hint>Use pelo menos 10 caracteres, com letra e número.</mat-hint>
        <mat-error>Use pelo menos 10 caracteres, com letra e número.</mat-error>
      </mat-form-field>
      <p class="form-error" role="alert" *ngIf="error">{{error}}</p>
      <p *ngIf="saved" class="success-note" role="status">Senha alterada. Entre com a nova senha.</p>
      <button mat-flat-button class="access-submit" [disabled]="busy||f.invalid||saved">{{busy?'Salvando…':'Salvar nova senha'}}<mat-icon aria-hidden="true">arrow_forward</mat-icon></button>
    </form>
    <a mat-button class="recovery-back" routerLink="/entrar"><mat-icon aria-hidden="true">west</mat-icon>Voltar para entrar</a>
  </div>
  <p class="recovery-foot">OScar · Cada etapa, bem cuidada.</p>
</section>`
})
export class ResetPage {
  password = '';
  busy = false;
  saved = false;
  error = '';
  constructor(private api: ApiService, private route: ActivatedRoute) {}
  async submit() {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.api.post('/auth/reset', { token: this.route.snapshot.paramMap.get('token'), password: this.password });
      this.saved = true;
    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.busy = false;
    }
  }
}
