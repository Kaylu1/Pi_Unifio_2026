import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';

type CatalogueService = { id: number; name: string; description: string; price: number; durationMinutes: number; purpose?: 'avaliacao' | 'execucao' };
type DurationFilter = 'all' | 'short' | 'long';
type DataConnection = EventTarget & { saveData?: boolean };

@Component({
 selector:'app-public-catalogue',
 standalone:false,
 templateUrl:'./catalogue-page.html',
 styleUrls:['./catalogue-page.scss','./catalogue-services.scss','./catalogue-responsive.scss','./catalogue-request-form.scss','./catalogue-request.scss']
})
export class PublicCataloguePage implements OnInit, OnDestroy {
 services:CatalogueService[]=[]; selectedIds:number[]=[]; requestName=''; requestPhone=''; requestVehicle=''; requestPlate=''; requestSymptoms=''; preferredDate=''; preferredPeriod=''; requestError=''; requestBusy=false; submittedRequestId:number|null=null;
 query='';page=0;size=6;error='';loaded=false;
 videoEnabled=false;videoReady=false;videoPlaying=false;videoFailed=false;videoBlocked=false;
 private heroVideo?:HTMLVideoElement;private motionQuery?:MediaQueryList;private connection?:DataConnection;
 private userPaused=false;private userRequestedPlayback=false;private destroyed=false;
 duration:DurationFilter='all';
 order='default';
 expandedId:number|null=null;
 readonly durationFilters:{value:DurationFilter;label:string}[]=[
  {value:'all',label:'Todos os serviços'},
  {value:'short',label:'Até 1 hora'},
  {value:'long',label:'Mais de 1 hora'}
 ];
 @ViewChild('heroVideo')
 set backgroundVideo(element:ElementRef<HTMLVideoElement>|undefined){
  this.heroVideo=element?.nativeElement;
  if(this.heroVideo){this.heroVideo.muted=true;this.heroVideo.defaultMuted=true;}
 }
 constructor(private api:ApiService){}
 async ngOnInit(){
  this.motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  this.connection=(navigator as Navigator & {connection?:DataConnection}).connection;
  this.motionQuery.addEventListener('change',this.onMotionChange);
  this.connection?.addEventListener('change',this.onMotionChange);
  document.addEventListener('visibilitychange',this.onVisibilityChange);
  this.applyVideoPreference();
  await this.loadServices();
 }
 ngOnDestroy(){
  this.destroyed=true;
  this.heroVideo?.pause();
  this.motionQuery?.removeEventListener('change',this.onMotionChange);
  this.connection?.removeEventListener('change',this.onMotionChange);
  document.removeEventListener('visibilitychange',this.onVisibilityChange);
 }
 private readonly onMotionChange=()=>{
  this.userRequestedPlayback=false;
  this.applyVideoPreference();
 };
 private readonly onVisibilityChange=()=>{
  if(document.hidden)this.heroVideo?.pause();
  else if(this.videoEnabled&&!this.userPaused)this.tryPlayVideo();
 };
 private applyVideoPreference(){
  const enabled=this.userRequestedPlayback||(!this.motionQuery?.matches&&!this.connection?.saveData);
  if(!enabled){this.heroVideo?.pause();this.videoReady=false;this.videoPlaying=false;}
  this.videoEnabled=enabled;
 }
 private tryPlayVideo(){
  const video=this.heroVideo;
  if(!video||video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||this.userPaused||document.hidden||this.destroyed)return;
  void video.play().catch((error:DOMException)=>{
   if(this.destroyed||video!==this.heroVideo)return;
   if(error.name!=='AbortError')this.videoBlocked=true;
   this.videoPlaying=false;
  });
 }
 get videoAutoplay(){return !this.userPaused&&!this.videoBlocked;}
 get videoControlText(){return this.videoFailed?'Tentar vídeo novamente':this.videoPlaying?'Pausar vídeo':'Reproduzir vídeo';}
 onVideoCanPlay(){this.tryPlayVideo();}
 onVideoPlaying(){this.videoReady=true;this.videoPlaying=true;this.videoBlocked=false;}
 onVideoPause(){this.videoPlaying=false;}
 onVideoError(){if(this.destroyed)return;this.videoFailed=true;this.videoEnabled=false;this.videoReady=false;this.videoPlaying=false;}
 toggleVideo(){
  if(this.videoPlaying){this.userPaused=true;this.heroVideo?.pause();return;}
  this.userPaused=false;this.userRequestedPlayback=true;this.videoBlocked=false;this.videoFailed=false;this.videoEnabled=true;
  this.tryPlayVideo();
 }
 async loadServices(){
  this.error='';this.loaded=false;
  try{
   const res=await this.api.get('/public/services',{pageSize:100});
   this.services=Array.isArray(res)?res:(res.items||res.services||res.data||[]);
   this.selectedIds=this.selectedIds.filter(id=>this.services.some(service=>service.id===id));
   this.page=0;
   this.expandedId=this.services[0]?.id??null;
  }catch(e:any){this.error=e.message||'Tente carregar o catálogo novamente.';}
  finally{this.loaded=true;}
 }
 get rows(){
  const q=this.query.toLocaleLowerCase('pt-BR').trim();
  const rows=this.services.filter(service=>
   [service.name,service.description].join(' ').toLocaleLowerCase('pt-BR').includes(q)&&this.matchesDuration(service,this.duration)
  );
  if(this.order==='price')rows.sort((a,b)=>Number(a.price)-Number(b.price));
  else if(this.order==='duration')rows.sort((a,b)=>Number(a.durationMinutes)-Number(b.durationMinutes));
  else if(this.order==='name')rows.sort((a,b)=>(a.name||a.description).localeCompare(b.name||b.description,'pt-BR'));
  return rows;
 }
 get visible(){return this.rows.slice(this.page*this.size,(this.page+1)*this.size);}
 setDuration(value:DurationFilter){this.duration=value;this.page=0;}
 clearFilters(){this.query='';this.duration='all';this.page=0;}
 toggleService(service:CatalogueService){this.expandedId=this.expandedId===service.id?null:service.id;}
 isSelected(service:CatalogueService){return this.selectedIds.includes(service.id);}
 addService(service:CatalogueService){if(!this.isSelected(service))this.selectedIds=[...this.selectedIds,service.id];}
 toggleSelection(service:CatalogueService){
  this.requestError='';
  this.selectedIds=this.isSelected(service)?this.selectedIds.filter(id=>id!==service.id):[...this.selectedIds,service.id];
 }
 get selectedServices(){return this.services.filter(service=>this.selectedIds.includes(service.id));}
 get selectedTotal(){return this.selectedServices.reduce((total,service)=>total+Number(service.price),0);}
 get selectedDuration(){return this.selectedServices.reduce((minutes,service)=>minutes+Number(service.durationMinutes),0);}
 get minDate(){return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);}
 get diagnosticService(){return this.services.find(service=>service.purpose==='avaliacao')??null;}
 get hasDiagnostic(){return this.selectedServices.some(service=>service.purpose==='avaliacao');}
 get requestValidationMessage(){
  if(!this.selectedIds.length)return 'Adicione pelo menos um serviço antes de enviar.';
  if(this.requestName.trim().length<2)return 'Informe seu nome para que a equipe possa falar com você.';
  const digits=this.requestPhone.replace(/\D/g,'').length;
  if(digits<10||digits>15)return 'Informe um telefone com DDD válido.';
  if(this.requestVehicle.trim().length<2)return 'Informe o modelo do veículo.';
  if(this.hasDiagnostic&&this.requestSymptoms.trim().length<10)return 'Descreva o problema do veículo em pelo menos 10 caracteres para a avaliação técnica.';
  return '';
 }
 async submitRequest(){
  if(this.requestBusy||this.submittedRequestId!==null)return;
  const validation=this.requestValidationMessage;
  if(validation){this.requestError=validation;return;}
  this.requestBusy=true;this.requestError='';
  try{
   const result=await this.api.post('/public/service-requests',{
    name:this.requestName.trim(),phone:this.requestPhone.trim(),vehicle:this.requestVehicle.trim(),
    plate:this.requestPlate.trim(),symptoms:this.requestSymptoms.trim(),preferredDate:this.preferredDate,preferredPeriod:this.preferredPeriod,serviceIds:this.selectedIds
   });
   this.submittedRequestId=Number(result.id);
  }catch(error:any){this.requestError=error?.message||'Não foi possível enviar. Confira os dados e tente novamente.';}
  finally{this.requestBusy=false;}
 }
 resetRequest(){
  this.selectedIds=[];this.requestName='';this.requestPhone='';this.requestVehicle='';this.requestPlate='';this.requestSymptoms='';this.preferredDate='';this.preferredPeriod='';
  this.requestError='';this.submittedRequestId=null;
 }
 trackService(_index:number,service:CatalogueService){return service.id;}
 durationCount(value:DurationFilter){return this.services.filter(service=>this.matchesDuration(service,value)).length;}
 private matchesDuration(service:CatalogueService,value:DurationFilter){return value==='all'||(value==='short'?Number(service.durationMinutes)<=60:Number(service.durationMinutes)>60);}
 serviceIcon(service:CatalogueService){
  const name=[service.name,service.description].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/oleo/.test(name))return 'oil_barrel';
  if(/freio/.test(name))return 'disc_full';
  if(/alinh|pneu|geometria/.test(name))return 'tire_repair';
  if(/eletronic|scanner|diagnostico/.test(name))return 'memory';
  if(/correia/.test(name))return 'settings';
  if(/revisao|inspecao/.test(name))return 'fact_check';
  return 'build';
 }
}
@Component({selector:'app-public-budget',standalone:false,templateUrl:'./public-budget.html',styleUrl:'./public.scss'})
export class PublicBudgetPage implements OnInit {
 budget:any=null;error='';loading=true;busy=false;saved=false;choices:Record<string,string>={};
 constructor(private api:ApiService,private route:ActivatedRoute){}
 async ngOnInit(){try{const res=await this.api.get('/public/budgets/'+this.route.snapshot.paramMap.get('token'));this.budget=res.budget||res;}catch(e:any){this.error=e.message;}finally{this.loading=false;}}
 get total(){return (this.budget?.items||[]).reduce((s:number,x:any)=>s+Number(x.quantity)*Number(x.price),0);}
 get approvedTotal(){return (this.budget?.items||[]).filter((x:any)=>this.choices[x.id]==='aprovado').reduce((s:number,x:any)=>s+Number(x.quantity)*Number(x.price),0);}
 get valid(){return this.budget?.items?.length>0&&this.budget.items.every((x:any)=>['aprovado','recusado'].includes(this.choices[x.id]));}
 async submit(){if(!this.valid||this.busy)return;this.busy=true;this.error='';try{await this.api.post('/public/budgets/'+this.route.snapshot.paramMap.get('token'),{decisions:this.budget.items.map((x:any)=>({itemId:x.id,decision:this.choices[x.id]}))});this.saved=true;this.budget=null;}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
}

@Component({selector:'app-not-found',standalone:false,template:`<div class="public-narrow"><a class="text-brand" routerLink="/painel">OScar</a><div class="empty-state"><mat-icon>wrong_location</mat-icon><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><a mat-flat-button routerLink="/painel">Voltar ao início</a></div></div>`})
export class NotFoundPage {}
