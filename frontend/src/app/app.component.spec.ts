import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent], providers: [provideHttpClient(), provideRouter(routes)]
    }).compileComponents();
    localStorage.removeItem('ecoplaca_token');
  });
  it('renders the authentication links for an anonymous visitor', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Iniciar sesión');
    expect(element.textContent).toContain('Registro');
  });
  it('skips to the content without leaving the current route', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    element.querySelector<HTMLAnchorElement>('.skip-link')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(router.url).toBe('/login');
    expect(document.activeElement).toBe(element.querySelector('main'));
    fixture.destroy();
  });
});
