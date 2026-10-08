import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent], providers: [provideHttpClient(), provideRouter([])]
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
});
