import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';
describe('JWT request scope', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getToken: (): string => 'test-token' } }
    ] });
    http = TestBed.inject(HttpTestingController); client = TestBed.inject(HttpClient);
  });
  afterEach(() => http.verify());
  it('attaches JWT only to private API requests', () => {
    client.get('/api/auth/perfil').subscribe();
    const privateRequest = http.expectOne('/api/auth/perfil');
    expect(privateRequest.request.headers.get('Authorization')).toBe('Bearer test-token');
    privateRequest.flush({});
    for (const url of ['/api/auth/login', '/api/auth/register', 'https://other.example/api/test', '/api-other/test']) {
      client.get(url).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
    }
  });
});
