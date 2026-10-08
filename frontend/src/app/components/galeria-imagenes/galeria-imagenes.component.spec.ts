import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GaleriaImagenesComponent } from './galeria-imagenes.component';
import { provideHttpClient } from '@angular/common/http';

describe('GaleriaImagenesComponent', () => {
  let component: GaleriaImagenesComponent;
  let fixture: ComponentFixture<GaleriaImagenesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GaleriaImagenesComponent],
      providers: [provideHttpClient()]
    }).compileComponents();

    fixture = TestBed.createComponent(GaleriaImagenesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the galeria-imagenes component', () => {
    expect(component).toBeTruthy();
  });
});
