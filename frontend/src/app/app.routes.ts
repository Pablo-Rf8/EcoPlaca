import { Routes } from '@angular/router';
import { GaleriaImagenesComponent } from './components/galeria-imagenes/galeria-imagenes.component';
import { ComentariosComponent } from './components/comentarios/comentarios.component';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalogo' },
  { path: 'catalogo', component: GaleriaImagenesComponent },
  { path: 'galeria', pathMatch: 'full', redirectTo: 'catalogo' },
  { path: 'login', loadComponent: () => import('./components/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./components/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'nuevo-dispositivo', canActivate: [authGuard, roleGuard], data: { roles: ['DONOR', 'ADMIN'] },
    loadComponent: () => import('./components/dispositivo-form/dispositivo-form.component').then(m => m.DispositivoFormComponent) },
  { path: 'transferencias', canActivate: [authGuard, roleGuard], data: { roles: ['TECHNICIAN', 'ADMIN'] },
    loadComponent: () => import('./components/transferencias/transferencias.component').then(m => m.TransferenciasComponent) },
  { path: 'dashboard', canActivate: [authGuard, roleGuard], data: { roles: ['ADMIN', 'DONOR', 'TECHNICIAN'] },
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'comentarios', component: ComentariosComponent, canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN', 'TECHNICIAN'] } },
  { path: '**', loadComponent: () => import('./components/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
