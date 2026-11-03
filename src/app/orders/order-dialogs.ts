import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ApiService } from '../core/api.service';

@Component({selector:'app-create-order',standalone:false,template:`
<h2 mat-dialog-title>Abrir ordem de serviço</h2>
<mat-dialog-content>
<p class="muted">Escolha como iniciar o atendimento e registre a autorização do cliente.</p>
<div class="start-modes" role="group" aria-label="Como iniciar o atendimento">
<button type="button" mat-stroked-button (click)="chooseStart('avaliacao')" [disabled]="!!sourceRequestId" [class.selected]="model.startMode==='avaliacao'" [attr.aria-pressed]="model.startMode==='avaliacao'"><mat-icon>manage_search</mat-icon>Avaliação inicial</button>
<button type="button" mat-stroked-button (click)="chooseStart('servicos')" [disabled]="!!sourceRequestId" [class.selected]="model.startMode==='servicos'" [attr.aria-pressed]="model.startMode==='servicos'"><mat-icon>build</mat-icon>Serviços já definidos</button>
</div>
<p class="start-guidance" *ngIf="model.startMode==='avaliacao'">A avaliação usa o valor cadastrado no serviço. Depois da inspeção, acrescente os serviços e as peças identificados em um orçamento para aprovação do cliente.</p>
<p class="start-guidance" *ngIf="sourceRequestId">Esta O.S. vem do pedido #{{sourceRequestId}} do catálogo. Cliente, veículo, mecânico e serviços seguem o agendamento confirmado. <a routerLink="/solicitacoes" [queryParams]="{pedido:sourceRequestId}" (click)="ref.close(null)">Ver relato original</a></p>
<form #f="ngForm" class="form-grid">
<mat-form-field appearance="outline"><mat-label>Cliente</mat-label><mat-select name="client" [(ngModel)]="model.clientId" required [disabled]="!!sourceRequestId" (selectionChange)="model.vehicleId=null"><mat-option *ngFor="let x of api.data().clients" [value]="x.id">{{x.name}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Veículo</mat-label><mat-select name="vehicle" [(ngModel)]="model.vehicleId" required [disabled]="!!sourceRequestId"><mat-option *ngFor="let x of vehicles" [value]="x.id">{{x.plate || 'Placa pendente'}} · {{x.model}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Mecânico responsável</mat-label><mat-select name="mechanic" [(ngModel)]="model.mechanicId" required [disabled]="!!sourceRequestId"><mat-option *ngFor="let x of mechanics" [value]="x.id">{{x.name}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Agendamento de origem</mat-label><mat-select name="appointment" [(ngModel)]="model.appointmentId" (selectionChange)="fromAppointment()"><mat-option [value]="null">Atendimento sem agendamento</mat-option><mat-option *ngFor="let x of appointments" [value]="x.id">{{x.date}} {{x.time}} · {{api.vehicle(x.vehicleId)?.plate}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline" class="full"><mat-label>{{model.startMode==='avaliacao'?'Serviço de avaliação':'Serviços contratados'}}</mat-label><mat-select name="services" [(ngModel)]="model.serviceIds" multiple required [disabled]="!!sourceRequestId"><mat-option *ngFor="let x of services" [value]="x.id">{{x.name||x.description}} · {{x.price|currency:'BRL'}}</mat-option></mat-select><mat-hint *ngIf="model.startMode==='avaliacao'">Valor definido no cadastro do serviço.</mat-hint></mat-form-field>
<p class="start-guidance full" *ngIf="model.startMode==='avaliacao'&&!evaluationServices.length">Cadastre ou edite um serviço com a finalidade “Avaliação / diagnóstico inicial” antes de abrir este atendimento.</p>
<mat-form-field appearance="outline" class="full" *ngIf="model.startMode==='avaliacao'"><mat-label>Relato inicial do cliente</mat-label><textarea matInput name="assessmentNotes" [(ngModel)]="model.assessmentNotes" maxlength="1000" rows="2" placeholder="Descreva o sintoma ou o que deve ser avaliado"></textarea><mat-hint>Opcional. A equipe registra os resultados na folha de verificação.</mat-hint></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Forma de aprovação do cliente</mat-label><mat-select name="method" [(ngModel)]="model.approvalMethod" required><mat-option *ngFor="let method of methods" [value]="method">{{method}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Registro da manifestação</mat-label><input matInput name="notes" [(ngModel)]="model.approvalNotes" maxlength="500" placeholder="Ex.: autorizado no balcão"></mat-form-field>
<p class="small muted full">A aprovação dos serviços selecionados será registrada com data, hora e seu usuário.</p>
</form><p class="form-error" role="alert" *ngIf="error">{{error}}</p></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null" [disabled]="busy">Voltar</button><button mat-flat-button (click)="save()" [disabled]="busy||f.invalid||!model.serviceIds.length">{{busy?'Abrindo…':'Abrir ordem'}}</button></mat-dialog-actions>`,styles:[`
.start-modes{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.start-modes button{min-height:48px;flex:1;white-space:normal;border-radius:16px}.start-modes .selected{background:var(--accent-soft);color:var(--accent-strong);border-color:var(--accent)}.start-guidance{margin:0 0 22px;line-height:1.7;color:var(--text-muted)}@media(max-width:480px){.start-modes{flex-direction:column}}
`]})
export class CreateOrderDialog {
 model:any={clientId:null,vehicleId:null,mechanicId:null,appointmentId:null,startMode:'servicos',serviceIds:[],assessmentNotes:'',approvalMethod:'presencial',approvalNotes:''};busy=false;error='';
 private confirmedSnapshot:any[]=[];
 constructor(public api:ApiService,public ref:MatDialogRef<CreateOrderDialog>,@Inject(MAT_DIALOG_DATA) data:any){this.model.approvalMethod=this.methods[0];if(data?.appointmentId){this.model.appointmentId=data.appointmentId;this.fromAppointment();}}
 get vehicles(){return this.api.data().vehicles.filter((x:any)=>x.clientId===this.model.clientId&&x.active!==false);}
 get activeServices(){return this.api.data().services.filter((x:any)=>x.active!==false);}
 get confirmedServices(){return this.confirmedSnapshot;}
 get evaluationServices(){return (this.sourceRequestId?this.confirmedServices:this.activeServices).filter((x:any)=>x.purpose==='avaliacao');}
 get services(){return this.sourceRequestId?this.confirmedServices:this.model.startMode==='avaliacao'?this.evaluationServices:this.activeServices;}
 get mechanics(){return this.api.data().users.filter((x:any)=>x.role==='mecanico'&&x.active);}
 get appointments(){return this.api.data().appointments.filter((x:any)=>x.status!=='cancelado'&&!this.api.data().orders.some((o:any)=>o.appointmentId===x.id));}
 get sourceRequestId():number|null{return Number(this.appointments.find((x:any)=>x.id===this.model.appointmentId)?.serviceRequestId)||null;}
 get methods(){return (this.api.data().settings as any).approvalMethods||['presencial','telefone','mensagem'];}
 chooseStart(mode:string){if(this.model.startMode===mode||this.sourceRequestId)return;this.model.startMode=mode;this.model.serviceIds=mode==='avaliacao'&&this.evaluationServices.length===1?[this.evaluationServices[0].id]:[];}
 fromAppointment(){const ap=this.appointments.find((x:any)=>x.id===this.model.appointmentId);this.confirmedSnapshot=ap?.serviceRequestId?(ap.confirmedServices||[]).map((snapshot:any)=>({...(this.api.data().services.find((service:any)=>service.id===snapshot.id)||{}),...snapshot})):[];if(ap){const selected=ap.serviceRequestId?this.confirmedSnapshot:this.api.data().services.filter((x:any)=>ap.serviceIds.includes(x.id));Object.assign(this.model,{clientId:ap.clientId,vehicleId:ap.vehicleId,mechanicId:ap.mechanicId,serviceIds:[...ap.serviceIds],startMode:selected.length&&selected.every((x:any)=>x.purpose==='avaliacao')?'avaliacao':'servicos'});}}
 async save(){if(this.busy||!this.model.serviceIds.length)return;this.busy=true;this.error='';try{const res=await this.api.post('/orders',this.model);await this.api.load();this.ref.close(res.order||res);}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
}

@Component({selector:'app-order-item-dialog',standalone:false,template:`
<h2 mat-dialog-title>{{data.finding?'Registrar necessidade identificada':'Adicionar item ao atendimento'}}</h2><mat-dialog-content><p class="muted" *ngIf="data.finding">Registre o que a avaliação identificou. O item será incluído em um orçamento complementar e dependerá da aprovação do cliente.</p><form #f="ngForm" class="form-grid">
<mat-form-field appearance="outline"><mat-label>Tipo</mat-label><mat-select name="kind" [(ngModel)]="item.kind" (selectionChange)="item.referenceId=null"><mat-option value="servico">Serviço</mat-option><mat-option value="peca">Peça</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>{{item.kind==='peca'?'Peça':'Serviço'}}</mat-label><mat-select name="ref" [(ngModel)]="item.referenceId" required (selectionChange)="selectReference()"><mat-option *ngFor="let x of references" [value]="x.id">{{x.name||x.description}}</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Quantidade</mat-label><input matInput type="number" name="quantity" [(ngModel)]="item.quantity" required min="0.01" step="0.01"></mat-form-field>
<mat-form-field appearance="outline"><mat-label>Valor unitário (R$)</mat-label><input matInput type="number" name="price" [(ngModel)]="item.price" required min="0" step="0.01"></mat-form-field>
<mat-form-field appearance="outline" class="full" *ngIf="data.finding"><mat-label>Justificativa técnica</mat-label><textarea matInput name="justification" [(ngModel)]="item.justification" required maxlength="1000" rows="3"></textarea></mat-form-field>
<mat-form-field appearance="outline" *ngIf="!data.finding"><mat-label>Decisão do cliente</mat-label><mat-select name="decision" [(ngModel)]="item.decision" required><mat-option value="aprovado">Aprovado</mat-option><mat-option value="recusado">Recusado</mat-option></mat-select></mat-form-field>
<mat-form-field appearance="outline" *ngIf="!data.finding"><mat-label>Forma de manifestação</mat-label><mat-select name="approvalMethod" [(ngModel)]="item.approvalMethod" required><mat-option *ngFor="let method of methods" [value]="method">{{method}}</mat-option></mat-select></mat-form-field>
<mat-checkbox class="full" name="clientPart" [(ngModel)]="item.suppliedByClient" *ngIf="item.kind==='peca'">Peça fornecida pelo cliente</mat-checkbox></form><p class="form-error" role="alert" *ngIf="error">{{error}}</p></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null" [disabled]="busy">Voltar</button><button mat-flat-button (click)="save()" [disabled]="busy||f.invalid">{{busy?'Registrando…':'Registrar item'}}</button></mat-dialog-actions>`})
export class OrderItemDialog {
 item:any={kind:'servico',referenceId:null,quantity:1,price:0,decision:'aprovado',approvalMethod:'presencial',justification:'',suppliedByClient:false};busy=false;error='';
 constructor(public api:ApiService,@Inject(MAT_DIALOG_DATA) public data:any,private ref:MatDialogRef<OrderItemDialog>){this.item.approvalMethod=this.methods[0];}
 get methods(){return (this.api.data().settings as any).approvalMethods||['presencial','telefone','mensagem'];}
 get references(){return (this.item.kind==='peca'?this.api.data().parts:this.api.data().services).filter((x:any)=>x.active!==false);}
 selectReference(){const x=this.references.find((x:any)=>x.id===this.item.referenceId);this.item.price=x?.price||0;this.item.description=x?.name||x?.description||'';}
 async save(){this.busy=true;this.error='';const payload={...this.item,serviceId:this.item.kind==='servico'?this.item.referenceId:null,partId:this.item.kind==='peca'?this.item.referenceId:null};try{await this.api.post('/orders/'+this.data.orderId+(this.data.finding?'/findings':'/items'),payload);this.ref.close(true);}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
}

@Component({selector:'app-budget-editor',standalone:false,template:`
<h2 mat-dialog-title>{{data.budget?'Editar orçamento complementar':'Preparar orçamento complementar'}}</h2><mat-dialog-content><p class="muted">Revise os itens antes de disponibilizar a proposta ao cliente.</p>
<div *ngFor="let item of items;let i=index" class="budget-edit-row"><div class="form-grid"><mat-form-field appearance="outline" class="full"><mat-label>Descrição do item {{i+1}}</mat-label><input matInput [(ngModel)]="item.description" required [name]="'desc'+i"></mat-form-field><mat-form-field appearance="outline"><mat-label>Quantidade</mat-label><input matInput type="number" [(ngModel)]="item.quantity" min="0.01" step="0.01" [name]="'qty'+i"></mat-form-field><mat-form-field appearance="outline"><mat-label>Valor unitário (R$)</mat-label><input matInput type="number" [(ngModel)]="item.price" min="0" step="0.01" [name]="'price'+i"></mat-form-field></div><div class="actions-row"><span class="muted">{{item.quantity*item.price|currency:'BRL'}}</span><button mat-button color="warn" (click)="items.splice(i,1)"><mat-icon>delete_outline</mat-icon>Remover item</button></div></div>
<div class="form-grid"><mat-form-field appearance="outline"><mat-label>Adicionar serviço</mat-label><mat-select (selectionChange)="add($event.value,'servico')"><mat-option *ngFor="let x of api.data().services" [value]="x">{{x.name||x.description}}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>Adicionar peça</mat-label><mat-select (selectionChange)="add($event.value,'peca')"><mat-option *ngFor="let x of api.data().parts" [value]="x">{{x.description}}</mat-option></mat-select></mat-form-field></div>
<p *ngIf="!items.length" class="muted">Adicione ao menos um serviço ou peça.</p><p class="budget-total"><strong>Total {{total|currency:'BRL'}}</strong></p><p class="form-error" role="alert" *ngIf="error">{{error}}</p></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null" [disabled]="busy">Voltar</button><button mat-flat-button (click)="save()" [disabled]="busy||!valid">{{busy?'Salvando…':'Salvar rascunho'}}</button></mat-dialog-actions>`,styles:[`.budget-edit-row{border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:18px;background:var(--surface-alt)}.budget-total{text-align:right;font-size:17px}`]})
export class BudgetEditorDialog {
 items:any[]=[];busy=false;error='';
 constructor(public api:ApiService,@Inject(MAT_DIALOG_DATA) public data:any,private ref:MatDialogRef<BudgetEditorDialog>){this.items=structuredClone(data.budget?.items||data.findings||[]);}
 get total(){return this.items.reduce((s,x)=>s+Number(x.quantity)*Number(x.price),0);}
 get valid(){return this.items.length>0&&this.items.every(x=>x.description?.trim()&&x.quantity>0&&x.price>=0);}
 add(ref:any,kind:string){this.items.push({kind,serviceId:kind==='servico'?ref.id:null,partId:kind==='peca'?ref.id:null,description:ref.name||ref.description,quantity:1,price:ref.price,justification:'Item complementar identificado pela equipe',suppliedByClient:false});}
 async save(){this.busy=true;this.error='';try{if(this.data.budget)await this.api.put('/budgets/'+this.data.budget.id,{items:this.items});else await this.api.post('/orders/'+this.data.orderId+'/budgets',{items:this.items});this.ref.close(true);}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
}

@Component({selector:'app-reason-dialog',standalone:false,template:`
<h2 mat-dialog-title>{{data.title}}</h2><mat-dialog-content><p>{{data.message}}</p><mat-form-field appearance="outline"><mat-label>Motivo</mat-label><textarea matInput [(ngModel)]="reason" rows="3" required maxlength="1000"></textarea></mat-form-field></mat-dialog-content><mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null">Voltar</button><button mat-flat-button [mat-dialog-close]="reason" [disabled]="!reason.trim()">Confirmar</button></mat-dialog-actions>`})
export class ReasonDialog {reason='';constructor(@Inject(MAT_DIALOG_DATA)public data:any){}}

@Component({selector:'app-budget-decision-dialog',standalone:false,template:`
<h2 mat-dialog-title>Registrar resposta por canal externo</h2><mat-dialog-content><p class="muted">Registre a manifestação do cliente para cada item.</p><div *ngFor="let item of items" class="decision-row"><strong>{{item.description}}</strong><mat-form-field appearance="outline"><mat-label>Decisão</mat-label><mat-select [(ngModel)]="item.decision" [name]="item.id"><mat-option value="aprovado">Aprovado</mat-option><mat-option value="recusado">Recusado</mat-option></mat-select></mat-form-field></div><mat-form-field appearance="outline"><mat-label>Origem da manifestação</mat-label><mat-select [(ngModel)]="origin"><mat-option *ngFor="let method of methods" [value]="method">{{method}}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>Observação do contato</mat-label><textarea matInput [(ngModel)]="notes" maxlength="1000" rows="2"></textarea></mat-form-field><p class="form-error" *ngIf="error" role="alert">{{error}}</p></mat-dialog-content><mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null" [disabled]="busy">Voltar</button><button mat-flat-button (click)="save()" [disabled]="busy||!valid">{{busy?'Registrando…':'Registrar resposta'}}</button></mat-dialog-actions>`,styles:[`.decision-row{display:flex;align-items:center;justify-content:space-between;gap:20px}.decision-row strong{font-size:14px;color:var(--text)}.decision-row mat-form-field{width:170px}`]})
export class BudgetDecisionDialog {
 items:any[]=[];origin='telefone';notes='';busy=false;error='';
 constructor(public api:ApiService,@Inject(MAT_DIALOG_DATA)public data:any,private ref:MatDialogRef<BudgetDecisionDialog>){this.items=structuredClone(data.items);this.origin=this.methods[0];}
 get methods(){return (this.api.data().settings as any).approvalMethods||['presencial','telefone','mensagem'];}
 get valid(){return this.items.every(x=>['aprovado','recusado'].includes(x.decision));}
 async save(){this.busy=true;try{await this.api.post('/budgets/'+this.data.id+'/decisions',{decisions:this.items.map(x=>({itemId:x.id,decision:x.decision})),origin:this.origin,notes:this.notes});this.ref.close(true);}catch(e:any){this.error=e.message;}finally{this.busy=false;}}
}
