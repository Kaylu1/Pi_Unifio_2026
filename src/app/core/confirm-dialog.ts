import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
@Component({selector:'app-confirm-dialog', standalone:false, template:`
<h2 mat-dialog-title>{{data.title || 'Confirmar ação'}}</h2><mat-dialog-content><p>{{data.message}}</p></mat-dialog-content>
<mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="false">Voltar</button><button mat-flat-button [mat-dialog-close]="true">{{data.confirm || 'Confirmar'}}</button></mat-dialog-actions>`})
export class ConfirmDialog { constructor(@Inject(MAT_DIALOG_DATA) public data:any) {} }
