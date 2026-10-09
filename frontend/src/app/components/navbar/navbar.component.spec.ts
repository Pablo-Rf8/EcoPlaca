import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavbarComponent } from './navbar.component';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([{ path: 'catalogo', component: NavbarComponent }]),
        { provide: AuthService, useValue: { hasRole: () => false, isAuthenticated: () => false, currentUser: () => null } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the navbar component', () => {
    expect(component).toBeTruthy();
  });

  it('exposes the mobile menu state and its accessible controls', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.mobile-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeTruthy();
  });

  it('closes the menu with Escape and returns focus to its toggle', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.mobile-toggle');
    toggle.style.display = 'flex';
    toggle.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isMenuOpen()).toBeFalse();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes on an outside click while keeping clicks inside the menu open', () => {
    component.toggleMenu();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('nav').click();
    expect(component.isMenuOpen()).toBeTrue();
    document.body.click();
    expect(component.isMenuOpen()).toBeFalse();
  });

  it('closes when navigation is initiated programmatically', async () => {
    component.toggleMenu();
    await TestBed.inject(Router).navigateByUrl('/catalogo');
    expect(component.isMenuOpen()).toBeFalse();
  });
});
