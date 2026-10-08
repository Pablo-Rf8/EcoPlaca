import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComentariosComponent } from './comentarios.component';
import { FormsModule } from '@angular/forms';

describe('ComentariosComponent', () => {
  let component: ComentariosComponent;
  let fixture: ComponentFixture<ComentariosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComentariosComponent, FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(ComentariosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the comentarios component', () => {
    expect(component).toBeTruthy();
  });
});
