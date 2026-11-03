import { NgModule, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, MatPaginatorIntl } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { LoginPage, RecoverPage, ResetPage } from './auth/auth-pages';
import { DashboardPage } from './dashboard/dashboard';
import { AgendaPage } from './agenda/agenda';
import { OrdersPage, OrderDetailPage } from './orders/orders';
import { CreateOrderDialog, OrderItemDialog, BudgetEditorDialog, ReasonDialog, BudgetDecisionDialog } from './orders/order-dialogs';
import { ConfirmDialog } from './core/confirm-dialog';
import { PublicCataloguePage, PublicBudgetPage, NotFoundPage } from './public/public-pages';
import { FEATURE_COMPONENTS } from './features/feature-pages';
import { ServiceRequestsPage } from './features/service-requests-page';
import { RequestConfirmDialog } from './features/request-confirm-dialog';
registerLocaleData(localePt);
function paginatorIntl() {
 const intl=new MatPaginatorIntl();
 intl.itemsPerPageLabel='Itens por página:';intl.nextPageLabel='Próxima página';intl.previousPageLabel='Página anterior';intl.firstPageLabel='Primeira página';intl.lastPageLabel='Última página';
 intl.getRangeLabel=(page,size,length)=>length?((page*size+1)+' – '+Math.min((page+1)*size,length)+' de '+length):'0 de 0';
 return intl;
}
@NgModule({
 declarations:[App,LoginPage,RecoverPage,ResetPage,DashboardPage,AgendaPage,OrdersPage,OrderDetailPage,CreateOrderDialog,OrderItemDialog,BudgetEditorDialog,ReasonDialog,BudgetDecisionDialog,ConfirmDialog,PublicCataloguePage,PublicBudgetPage,NotFoundPage,ServiceRequestsPage,RequestConfirmDialog,...FEATURE_COMPONENTS],
 imports:[BrowserModule,FormsModule,ReactiveFormsModule,AppRoutingModule,MatButtonModule,MatCardModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatTableModule,MatPaginatorModule,MatChipsModule,MatIconModule,MatTabsModule,MatCheckboxModule,MatDatepickerModule,MatNativeDateModule,MatTooltipModule,MatProgressSpinnerModule,MatProgressBarModule,MatSnackBarModule,MatMenuModule,MatExpansionModule,MatSlideToggleModule],
 providers:[provideHttpClient(),provideBrowserGlobalErrorListeners(),{provide:LOCALE_ID,useValue:'pt-BR'},{provide:MAT_DATE_LOCALE,useValue:'pt-BR'},{provide:MatPaginatorIntl,useFactory:paginatorIntl}],
 bootstrap:[App]
})
export class AppModule {}
