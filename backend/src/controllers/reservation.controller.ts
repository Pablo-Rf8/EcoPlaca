import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { Reservation, CreateReservationDTO, ReservationStatus } from '../models/reservation.model';
import { componentController } from './component.controller';

let reservationsData: Reservation[] = [
  {
    id: 1,
    componentId: 3,
    componentTitle: 'Kit RAM Kingston Fury Beast 16GB (2x8GB) DDR4',
    trackingCode: 'RAEE-2026-0003',
    requesterId: 3,
    requesterName: 'Taller Comunitario Re-Boot',
    status: 'APPROVED',
    intendedUse: 'REFURBISHMENT',
    notes: 'Requerido para equipar una computadora recuperada para la escuela técnica local.',
    requestedAt: new Date('2026-02-18T10:00:00Z'),
    resolvedAt: new Date('2026-02-19T10:00:00Z')
  }
];

export const reservationController = {
  getReservations: async (req: Request, res: Response): Promise<void> => {
    const { status, requesterId } = req.query;

    let filtered = [...reservationsData];

    if (status) {
      filtered = filtered.filter(r => r.status === (status as string).toUpperCase());
    }

    if (requesterId) {
      const reqId = parseInt(requesterId as string, 10);
      filtered = filtered.filter(r => r.requesterId === reqId);
    }

    sendSuccess(res, filtered, 'Listado de reservas obtenido', 200, {
      total: filtered.length
    });
  },

  createReservation: async (req: Request, res: Response): Promise<void> => {
    const body: CreateReservationDTO = req.body;

    if (!body.componentId || !body.requesterId || !body.intendedUse) {
      sendError(res, 'Campos requeridos: componentId, requesterId, intendedUse', 400);
      return;
    }

    const components = componentController.getInternalData();
    const component = components.find(c => c.id === body.componentId);

    if (!component) {
      sendError(res, `Componente con ID ${body.componentId} no existe`, 404);
      return;
    }

    if (component.status !== 'AVAILABLE') {
      sendError(res, `El componente no está disponible para reserva (estado actual: ${component.status})`, 400);
      return;
    }

    const nextId = reservationsData.length > 0 ? Math.max(...reservationsData.map(r => r.id)) + 1 : 1;

    const newReservation: Reservation = {
      id: nextId,
      componentId: component.id,
      componentTitle: component.title,
      trackingCode: component.trackingCode,
      requesterId: body.requesterId,
      status: 'PENDING',
      intendedUse: body.intendedUse,
      notes: body.notes,
      requestedAt: new Date()
    };

    reservationsData.push(newReservation);
    component.status = 'RESERVED';

    sendSuccess(res, newReservation, 'Reserva creada satisfactoriamente', 201);
  },

  updateReservationStatus: async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    const { status, notes } = req.body;

    const index = reservationsData.findIndex(r => r.id === id);
    if (index === -1) {
      sendError(res, `Reserva con ID ${id} no encontrada`, 404);
      return;
    }

    const validStatuses: ReservationStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      sendError(res, `Estado inválido. Permitidos: ${validStatuses.join(', ')}`, 400);
      return;
    }

    reservationsData[index].status = status;
    reservationsData[index].resolvedAt = new Date();
    if (notes) reservationsData[index].notes = notes;

    // Si se cancela o rechaza, liberar el componente
    const components = componentController.getInternalData();
    const component = components.find(c => c.id === reservationsData[index].componentId);
    if (component) {
      if (status === 'REJECTED' || status === 'CANCELLED') {
        component.status = 'AVAILABLE';
      } else if (status === 'COMPLETED') {
        component.status = 'REUSED';
      }
    }

    sendSuccess(res, reservationsData[index], 'Estado de reserva actualizado');
  }
};
