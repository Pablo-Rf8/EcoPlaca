import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
@Component({
  selector: 'app-navbar', standalone: true, imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html', styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');
  readonly auth = inject(AuthService);
  readonly isMenuOpen = signal<boolean>(false);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.closeMenu();
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isMenuOpen()) return;
    this.closeMenu();
    this.menuToggle()?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (this.isMenuOpen() && event.target instanceof Node && !this.element.nativeElement.contains(event.target)) {
      this.closeMenu();
    }
  }

  toggleMenu(): void { this.isMenuOpen.update((value: boolean): boolean => !value); }
  closeMenu(): void { this.isMenuOpen.set(false); }
  logout(): void { this.closeMenu(); this.auth.logout(); }
}
