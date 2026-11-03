import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

export const authGuard: CanActivateFn = async (route) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.ready()) await api.initialize();
  if (!api.user()) return router.createUrlTree(['/entrar']);
  const roles = route.data['roles'] as string[] | undefined;
  return !roles || roles.includes(api.user().role) ? true : router.createUrlTree(['/painel']);
};
