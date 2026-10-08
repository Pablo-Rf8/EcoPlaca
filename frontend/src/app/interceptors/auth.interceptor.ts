import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { API_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(API_URL).replace(/\/$/, '');
  const token = inject(AuthService).getToken();
  const isApi = req.url.startsWith(api + '/');
  const publicAuth = req.url === api + '/auth/login' || req.url === api + '/auth/register';
  return next(token && isApi && !publicAuth
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
