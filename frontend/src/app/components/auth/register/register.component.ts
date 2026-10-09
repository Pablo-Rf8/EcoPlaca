import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../services/auth.service';
import { errorMessage, nombreValido, passwordBytesValidos } from '../auth-form.util';

@Component({
  selector: 'app-register', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html', styleUrls: ['../auth.component.css']
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal<boolean>(false);
  readonly passwordVisible = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    nombreCompleto: ['', [nombreValido]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    password: ['', [Validators.required, Validators.minLength(8), passwordBytesValidos]],
    rolId: [2, [Validators.required, Validators.pattern(/^[23]$/)]]
  });
  submit(): void {
    if (this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    if (value.rolId !== 2 && value.rolId !== 3) return;
    this.loading.set(true); this.error.set(null);
    this.auth.register({ nombreCompleto: value.nombreCompleto.trim(), email: value.email.trim(),
      password: value.password, rolId: value.rolId }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize((): void => this.loading.set(false))
    ).subscribe({
      next: (): void => { void this.router.navigate(['/login'], { queryParams: { registered: '1' } }); },
      error: (error: unknown): void => { this.error.set(errorMessage(error)); }
    });
  }
}
