import { Component, DestroyRef, HostListener, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MotionService } from './core/motion.service';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from './core/api.service';
import { ROLE_LABELS } from './core/status';
import { ThemeService } from './core/theme.service';

@Component({selector:'app-root',standalone:false,templateUrl:'./app.html',styleUrl:'./app.scss'})
export class App implements OnInit {
  mobileOpen=false;
  desktopCollapsed=false;
  path='';
  initError='';
  readonly roles=ROLE_LABELS;
  readonly nav=[
    {label:'Visão geral',icon:'space_dashboard',path:'/painel',roles:['gerente','atendente','mecanico','consultor','cliente'],group:'A oficina'},
    {label:'Ordens de serviço',icon:'assignment',path:'/ordens',roles:['gerente','atendente','mecanico','consultor','cliente'],group:'A oficina'},
    {label:'Solicitações',icon:'inbox',path:'/solicitacoes',roles:['gerente','atendente','mecanico','consultor'],group:'A oficina'},
    {label:'Agenda',icon:'calendar_month',path:'/agenda',roles:['gerente','atendente','mecanico'],group:'A oficina'},
    {label:'Clientes',icon:'group',path:'/clientes',roles:['gerente','atendente','consultor'],group:'Cadastros'},
    {label:'Veículos',icon:'directions_car',path:'/veiculos',roles:['gerente','atendente','mecanico','consultor','cliente'],group:'Cadastros'},
    {label:'Serviços',icon:'build',path:'/servicos',roles:['gerente','atendente','consultor'],group:'Cadastros'},
    {label:'Peças e estoque',icon:'inventory_2',path:'/estoque',roles:['gerente','atendente','mecanico','consultor'],group:'Gestão'},
    {label:'Fornecedores',icon:'local_shipping',path:'/fornecedores',roles:['gerente'],group:'Gestão'},
    {label:'Pós-venda',icon:'verified_user',path:'/pos-venda',roles:['gerente','atendente','consultor','cliente'],group:'Gestão'},
    {label:'Relatórios',icon:'bar_chart',path:'/relatorios',roles:['gerente'],group:'Gestão'},
    {label:'Equipe',icon:'badge',path:'/usuarios',roles:['gerente'],group:'Administração'},
    {label:'Parâmetros',icon:'tune',path:'/configuracoes',roles:['gerente'],group:'Administração'},
    {label:'Caixa de e-mails',icon:'mail',path:'/emails',roles:['gerente'],group:'Administração'}
  ];
  constructor(public api:ApiService,public router:Router,public theme:ThemeService,private motion:MotionService){
    this.path=router.url;
    inject(DestroyRef).onDestroy(()=>cancelAnimationFrame(this.motionFrame));
    router.events.pipe(filter(e=>e instanceof NavigationEnd),takeUntilDestroyed()).subscribe((e:any)=>{this.path=e.urlAfterRedirects;this.mobileOpen=false;this.onPageActivate();});
  }
  private motionFrame=0;
  @HostListener('document:keydown.escape') closeNavigation(){this.mobileOpen=false;}
  @HostListener('window:resize') onResize(){if(!this.isMobile)this.mobileOpen=false;}
  onPageActivate(){
    cancelAnimationFrame(this.motionFrame);
    this.motionFrame=requestAnimationFrame(()=>{
      if(this.publicPage){this.motion.stop();return;}
      const main=document.getElementById('main-content');
      if(main)this.motion.watch(main);
    });
  }
  skipToContent(event:Event){event.preventDefault();const main=document.getElementById('main-content');main?.focus();main?.scrollIntoView({block:'start'});}
  async ngOnInit(){if(!this.api.ready())await this.api.initialize();}
  get isMobile(){return window.innerWidth<=800;}
  get navigationOpen(){return this.isMobile?this.mobileOpen:!this.desktopCollapsed;}
  toggleNavigation(){if(this.isMobile)this.mobileOpen=!this.mobileOpen;else this.desktopCollapsed=!this.desktopCollapsed;}
  get publicPage(){return /^\/(entrar|recuperar|redefinir|orcamento|catalogo)(\/|\?|#|$)/.test(this.path);}
  get items(){return this.nav.filter(x=>x.roles.includes(this.api.user()?.role));}
  get openRequestCount(){return Number(this.api.data().serviceRequests?.openCount)||0;}
  get title(){return this.nav.find(x=>this.path.startsWith(x.path))?.label||'Oficina';}
  get initials(){return (this.api.user()?.name||'O').split(' ').filter(Boolean).slice(0,2).map((x:string)=>x[0]).join('');}
  async logout(){try{await this.api.logout();await this.router.navigateByUrl('/entrar');}catch(e:any){this.api.notify(e.message);}}
}
