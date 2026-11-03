import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { statusLabel } from '../core/status';
import { ConfirmDialog } from '../core/confirm-dialog';
import { CreateOrderDialog, OrderItemDialog, BudgetEditorDialog, ReasonDialog, BudgetDecisionDialog } from './order-dialogs';

@Component({selector:'app-orders',standalone:false,templateUrl:'./orders.html'})
export class OrdersPage implements OnInit, OnDestroy {
 query='';status='';page=0;size=10;statusLabel=statusLabel;
 private autoOpenedAppointmentId:number|null=null;
 private querySubscription?:Subscription;
 readonly states=['aberta','inspecao','aguardando_aprovacao','execucao','concluida','encerrada','cancelada'];
 constructor(public api:ApiService,private dialog:MatDialog,private router:Router,private route:ActivatedRoute){}
 ngOnInit():void{
  this.querySubscription=this.route.queryParamMap.subscribe(params=>{
   this.status=params.get('status')||'';
   const appointmentId=Number(params.get('appointmentId'));
   if(!appointmentId||!this.canCreate||this.autoOpenedAppointmentId===appointmentId)return;
   this.autoOpenedAppointmentId=appointmentId;
   setTimeout(()=>{if(this.router.url.startsWith('/ordens'))this.open(appointmentId);},0);
  });
 }
 ngOnDestroy():void{this.querySubscription?.unsubscribe();}
 get rows():any[]{const q=this.query.toLowerCase().trim();return this.api.data().orders.filter((x:any)=>(!this.status||x.status===this.status)&&(!q||[x.number,x.id,this.api.client(x.clientId)?.name,this.api.vehicle(x.vehicleId)?.plate,this.api.vehicle(x.vehicleId)?.model].join(' ').toLowerCase().includes(q))).sort((a:any,b:any)=>b.number-a.number);}
 get visible(){return this.rows.slice(this.page*this.size,(this.page+1)*this.size);}
 get canCreate(){return ['gerente','atendente'].includes(this.api.user()?.role);}
 open(appointmentId?:number){this.dialog.open(CreateOrderDialog,{width:'720px',disableClose:true,closeOnNavigation:false,data:{appointmentId}}).afterClosed().subscribe((order:any)=>{if(order)this.router.navigate(['/ordens',order.id]);});}
}

@Component({selector:'app-order-detail',standalone:false,templateUrl:'./order-detail.html',styleUrls:['./order-detail.scss','./order-assessment.scss']})
export class OrderDetailPage implements OnInit, OnDestroy {
 order:any=null;sourceRequest:any=null;error='';busy=false;pdfBusyId:number|null=null;selectedTab=0;statusLabel=statusLabel;private subscription?:Subscription;
 readonly states=['aberta','inspecao','aguardando_aprovacao','execucao','concluida','encerrada'];
 constructor(public api:ApiService,private route:ActivatedRoute,private dialog:MatDialog){}
 ngOnInit(){this.subscription=this.route.paramMap.subscribe(()=>{void this.reload();});}
 ngOnDestroy(){this.subscription?.unsubscribe();}
 async reload(){this.error='';try{const data=await this.api.get('/orders/'+this.route.snapshot.paramMap.get('id'));this.order=data.order||data;this.sourceRequest=data.sourceRequest||null;}catch(e:any){this.error=e.message;}}
 get items():any[]{return this.order?.items||[];}
 get inspections():any[]{return this.order?.inspections||[];}
 get evaluationOrder(){return this.order?.startMode==='avaliacao'||this.order?.evaluationServiceIds?.length>0||this.items.some(x=>x.source==='inicial'&&x.servicePurpose==='avaliacao');}
 get mixedEvaluationOrder(){return this.order?.startMode==='servicos'&&this.order?.evaluationServiceIds?.length>0;}
 get activeBudget(){return this.budgets.find(x=>['rascunho','publicado'].includes(x.status));}
 get canPrepareBudget(){return ['inspecao','execucao','aguardando_aprovacao'].includes(this.order?.status)&&!this.activeBudget;}
 get evaluationGuidance(){const guidance:Record<string,string>={aberta:'Inicie a inspeção para avaliar o veículo e registrar os resultados.',inspecao:'Registre as necessidades identificadas e prepare um orçamento com os serviços e as peças necessários.',aguardando_aprovacao:'Aguarde a decisão do cliente. Os itens pendentes dependem dessa aprovação para serem executados.',execucao:'Execute os itens aprovados. Novas necessidades podem receber um orçamento complementar.',concluida:'A avaliação e os itens aprovados estão concluídos.',encerrada:'Atendimento encerrado. Consulte a avaliação, os orçamentos e o histórico.',cancelada:'Atendimento cancelado. Os registros da avaliação permanecem no histórico.'};return guidance[this.order?.status]||'';}
 get budgets():any[]{return (this.api.data().budgets||[]).filter((x:any)=>x.orderId===this.order?.id);}
 get canWork(){return ['gerente','mecanico'].includes(this.api.user()?.role);}
 get canManage(){return ['gerente','atendente'].includes(this.api.user()?.role);}
 get canBudget(){return ['gerente','consultor'].includes(this.api.user()?.role);}
 get canDownloadBudget(){return ['gerente','consultor','atendente','cliente'].includes(this.api.user()?.role);}
 get locked(){return ['encerrada','cancelada'].includes(this.order?.status);}
 get total(){return this.items.filter(x=>x.decision==='aprovado').reduce((sum,x)=>sum+Number(x.quantity)*Number(x.price),0);}
 get nextStatuses(){const map:Record<string,string[]>={aberta:['inspecao','cancelada'],inspecao:['aguardando_aprovacao','cancelada'],aguardando_aprovacao:['execucao'],execucao:['concluida'],concluida:['encerrada']};return map[this.order?.status]||[];}
 async perform(path:string,body:any){if(this.busy)return;this.busy=true;this.error='';try{await this.api.post(path,body);await this.api.load();await this.reload();this.api.notify('Registro atualizado.');}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
 transition(status:string){const title=status==='cancelada'?'Cancelar ordem de serviço':status==='encerrada'?'Encerrar atendimento':'Atualizar etapa';this.dialog.open(ConfirmDialog,{data:{title,message:'Alterar a O.S. para “'+statusLabel(status)+'”? A ação será registrada no histórico.',confirm:'Confirmar'}}).afterClosed().subscribe(ok=>{if(ok)void this.perform('/orders/'+this.order.id+'/status',{status});});}
 add(finding=false){this.dialog.open(OrderItemDialog,{width:'660px',disableClose:true,data:{orderId:this.order.id,finding}}).afterClosed().subscribe(saved=>{if(saved)void this.refresh();});}
 async refresh(){if(this.busy)return;this.busy=true;this.error='';try{await this.api.load();await this.reload();}catch(error:any){this.error=error.message;}finally{this.busy=false;}}
 execute(item:any){void this.perform('/orders/'+this.order.id+'/execute',{itemId:item.id});}
 reverse(item:any){this.dialog.open(ReasonDialog,{width:'520px',data:{title:'Estornar peça aplicada',message:'A quantidade aplicada retornará ao estoque. Informe o motivo.'}}).afterClosed().subscribe(reason=>{if(reason)void this.perform('/orders/'+this.order.id+'/reverse',{itemId:item.id,reason});});}
 saveInspection(item:any){void this.perform('/orders/'+this.order.id+'/inspection',{itemId:item.id,inspectionId:item.id,result:item.result,notes:item.notes});}
 budget(budget?:any){if(this.busy)return;this.dialog.open(BudgetEditorDialog,{width:'740px',disableClose:true,data:{orderId:this.order.id,budget,findings:(this.order.findings||[]).filter((f:any)=>!this.budgets.some((b:any)=>b.items.some((i:any)=>i.findingId===f.id||i.id===f.id)))}}).afterClosed().subscribe(saved=>{if(saved)void this.refresh();});}
 async publish(budget:any){await this.perform('/budgets/'+budget.id+'/publish',{});}
 respond(budget:any){this.dialog.open(BudgetDecisionDialog,{width:'640px',disableClose:true,data:budget}).afterClosed().subscribe(saved=>{if(saved)void this.refresh();});}
 url(budget:any){return budget.link?new URL(budget.link,window.location.origin).href:'';}
 async copy(budget:any){try{await navigator.clipboard.writeText(this.url(budget));this.api.notify('Link copiado. Encaminhe ao cliente pelo canal combinado.');}catch{this.api.notify('Selecione o link exibido e copie para encaminhar ao cliente.');}}
 async downloadBudgetPdf(budget:any){
  if(this.pdfBusyId!==null)return;
  this.pdfBusyId=budget.id;this.error='';
  try{
   const response=await fetch(`/api/budgets/${budget.id}/pdf`,{credentials:'same-origin'});
   if(!response.ok){
    const error=await response.json().catch(()=>null);
    throw new Error(error?.message||'Não foi possível gerar o PDF do orçamento.');
   }
   const blob=await response.blob();
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;link.download=`orcamento-${budget.number||budget.id}.pdf`;
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(error:any){this.error=error.message||'Não foi possível gerar o PDF do orçamento.';this.api.notify(this.error);}
  finally{this.pdfBusyId=null;}
 }
}
