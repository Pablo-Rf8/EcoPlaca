import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);
  const roles: unknown = route.data['roles'];
  return auth.ensureSession().pipe(map((active: boolean) => {
    if (!active) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (Array.isArray(roles) && roles.length > 0 && roles.every((role: unknown) => typeof role === 'string')
        && auth.hasRole(roles)) return true;
    notifications.alert('Tu rol no tiene permiso para acceder a esta pantalla.');
    return router.createUrlTree(['/catalogo']);
  }));
};
