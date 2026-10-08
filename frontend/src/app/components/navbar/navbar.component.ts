import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
@Component({
  selector: 'app-navbar', standalone: true, imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html', styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly isMenuOpen = signal<boolean>(false);
  toggleMenu(): void { this.isMenuOpen.update((value: boolean): boolean => !value); }
  closeMenu(): void { this.isMenuOpen.set(false); }
  logout(): void { this.closeMenu(); this.auth.logout(); }
}
