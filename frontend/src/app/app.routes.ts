import { Routes } from '@angular/router';
import { GaleriaImagenesComponent } from './components/galeria-imagenes/galeria-imagenes.component';
import { ComentariosComponent } from './components/comentarios/comentarios.component';

export const routes: Routes = [
  { path: '', component: GaleriaImagenesComponent },
  { path: 'galeria', component: GaleriaImagenesComponent },
  { path: 'comentarios', component: ComentariosComponent },
  { path: '**', redirectTo: '' }
];
