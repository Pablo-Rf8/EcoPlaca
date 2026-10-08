import { CreateDispositivoDTO, EstadoFuncional } from '../models/dispositivo.model';
import { HttpError, decimal, optionalText, record, text } from './crud.util';
export interface ValidatedDispositivoDTO extends CreateDispositivoDTO { centroAcopioId: number; estadoFuncional: EstadoFuncional; }
export function validarDispositivoDTO(value: unknown): ValidatedDispositivoDTO {
  const body = record(value);
  const title: string = text(body, 'titulo', 150);
  if (title.length < 3) throw new HttpError('titulo debe tener al menos 3 caracteres', 400);
  const category: unknown = body['categoriaId']; const center: unknown = body['centroAcopioId'];
  if (typeof category !== 'number' || !Number.isSafeInteger(category) || category <= 0
      || typeof center !== 'number' || !Number.isSafeInteger(center) || center <= 0) {
    throw new HttpError('categoriaId y centroAcopioId deben ser IDs positivos', 400);
  }
  const state: unknown = body['estadoFuncional'];
  if (typeof state !== 'string' || !['OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE'].includes(state)) {
    throw new HttpError('estadoFuncional inválido', 400);
  }
  return { titulo: title, categoriaId: category, centroAcopioId: center,
    estadoFuncional: state as EstadoFuncional, pesoKg: decimal(body['pesoKg'], 'pesoKg', 9999.99),
    marca: optionalText(body, 'marca', 100) ?? undefined, modelo: optionalText(body, 'modelo', 100) ?? undefined,
    numeroSerie: optionalText(body, 'numeroSerie', 100) ?? undefined, notas: optionalText(body, 'notas', 5000) ?? undefined,
    especificaciones: body['especificaciones'] === undefined ? undefined : record(body['especificaciones']) };
}
