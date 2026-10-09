import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../services/auth.service';
import { errorMessage, passwordBytesValidos } from '../auth-form.util';

@Component({
  selector: 'app-login', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html', styleUrls: ['../auth.component.css']
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal<boolean>(false);
  readonly passwordVisible = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly registered = this.route.snapshot.queryParamMap.get('registered') === '1';
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    password: ['', [Validators.required, Validators.minLength(8), passwordBytesValidos]]
  });
  submit(): void {
    if (this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true); this.error.set(null);
    const value = this.form.getRawValue();
    this.auth.login({ email: value.email.trim(), password: value.password }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize((): void => this.loading.set(false))
    ).subscribe({
      next: (): void => {
        const target = this.route.snapshot.queryParamMap.get('returnUrl');
        const safe = target && /^\/(?!\/)/.test(target) && !/[\\\r\n]/.test(target)
          && !/^\/(login|register)(?:[/?#]|$)/.test(target) ? target : '/catalogo';
        void this.router.navigateByUrl(safe);
      },
      error: (error: unknown): void => { this.error.set(errorMessage(error)); }
    });
  }
}
