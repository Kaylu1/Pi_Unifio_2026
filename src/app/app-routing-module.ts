import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginPage, RecoverPage, ResetPage } from './auth/auth-pages';
import { DashboardPage } from './dashboard/dashboard';
import { AgendaPage } from './agenda/agenda';
import { OrdersPage, OrderDetailPage } from './orders/orders';
import { PublicCataloguePage, PublicBudgetPage, NotFoundPage } from './public/public-pages';
import { EntityViewPage,InventoryPage,ReportsPage,SettingsPage,EmailsPage } from './features/feature-pages';
import { ServiceRequestsPage } from './features/service-requests-page';
const routes:Routes=[
 {path:'entrar',component:LoginPage},{path:'recuperar',component:RecoverPage},{path:'redefinir/:token',component:ResetPage},
 {path:'catalogo',component:PublicCataloguePage},{path:'orcamento/:token',component:PublicBudgetPage},
 {path:'painel',component:DashboardPage,canActivate:[authGuard]},
 {path:'ordens',component:OrdersPage,canActivate:[authGuard]},{path:'ordens/:id',component:OrderDetailPage,canActivate:[authGuard]},
 {path:'clientes',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'clients',roles:['gerente','atendente','consultor']}},
 {path:'veiculos',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'vehicles'}},
 {path:'agenda',component:AgendaPage,canActivate:[authGuard],data:{roles:['gerente','atendente','mecanico']}},
 {path:'solicitacoes',component:ServiceRequestsPage,canActivate:[authGuard],data:{roles:['gerente','atendente','mecanico','consultor']}},
 {path:'servicos',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'services',roles:['gerente','atendente','consultor']}},
 {path:'estoque',component:InventoryPage,canActivate:[authGuard],data:{roles:['gerente','atendente','mecanico','consultor']}},
 {path:'fornecedores',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'suppliers',roles:['gerente']}},
 {path:'usuarios',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'users',roles:['gerente']}},
 {path:'pos-venda',component:EntityViewPage,canActivate:[authGuard],data:{entityKey:'tickets'}},
 {path:'relatorios',component:ReportsPage,canActivate:[authGuard],data:{roles:['gerente']}},
 {path:'configuracoes',component:SettingsPage,canActivate:[authGuard],data:{roles:['gerente']}},
 {path:'emails',component:EmailsPage,canActivate:[authGuard],data:{roles:['gerente']}},
 {path:'',pathMatch:'full',redirectTo:'painel'},
 {path:'**',component:NotFoundPage}
];
@NgModule({imports:[RouterModule.forRoot(routes,{scrollPositionRestoration:'enabled',anchorScrolling:'enabled'})],exports:[RouterModule]})
export class AppRoutingModule{}
