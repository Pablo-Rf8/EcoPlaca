import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { Component, ComponentStatus, ConditionState, CreateComponentDTO } from '../models/component.model';
import { TraceabilityLog } from '../models/traceability.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';

// Memoria inicial de componentes (idéntica al script DB/ecoplaca_DB.sql)
let componentsData: Component[] = [
  {
    id: 1,
    trackingCode: 'RAEE-2026-0001',
    title: 'Tarjeta Madre Asus Prime B450M-A',
    categoryId: 1,
    categoryName: 'Placas Madre / Motherboards',
    donorId: 2,
    donorName: 'TecnoEmpresa Soluciones',
    assignedWorkshopId: 3,
    assignedWorkshopName: 'Taller Comunitario Re-Boot',
    brand: 'ASUS',
    model: 'Prime B450M-A',
    serialNumber: 'AS-B450M-98124',
    conditionState: 'REPAIRABLE',
    status: 'AVAILABLE',
    weightKg: 0.85,
    co2SavedKg: 30.17,
    location: 'Almacén Central - Rack A1',
    specifications: { socket: 'AM4', form_factor: 'Micro-ATX', ram_slots: 4 },
    notes: 'Probada con multímetro. Requiere cambio de condensador sólido en fase VRM.',
    createdAt: new Date('2026-02-15T10:00:00Z'),
    updatedAt: new Date('2026-02-15T12:00:00Z')
  },
  {
    id: 2,
    trackingCode: 'RAEE-2026-0002',
    title: 'Fuente de Poder EVGA 600W 80 Plus',
    categoryId: 2,
    categoryName: 'Fuentes de Poder / PSU',
    donorId: 2,
    donorName: 'TecnoEmpresa Soluciones',
    assignedWorkshopId: 3,
    assignedWorkshopName: 'Taller Comunitario Re-Boot',
    brand: 'EVGA',
    model: '600 W1',
    serialNumber: 'EV-600W-34211',
    conditionState: 'FUNCTIONAL',
    status: 'AVAILABLE',
    weightKg: 1.60,
    co2SavedKg: 29.12,
    location: 'Almacén Central - Rack B3',
    specifications: { wattage: '600W', efficiency: '80 PLUS White', cables: 'Non-Modular' },
    notes: 'Completamente operativa y testeada con probador de fuentes de poder.',
    createdAt: new Date('2026-02-16T14:30:00Z')
  },
  {
    id: 3,
    trackingCode: 'RAEE-2026-0003',
    title: 'Kit RAM Kingston Fury Beast 16GB (2x8GB) DDR4',
    categoryId: 3,
    categoryName: 'Memorias RAM',
    donorId: 2,
    donorName: 'TecnoEmpresa Soluciones',
    assignedWorkshopId: null,
    brand: 'Kingston',
    model: 'Fury Beast DDR4',
    serialNumber: 'KF-DDR4-16G-887',
    conditionState: 'FUNCTIONAL',
    status: 'RESERVED',
    weightKg: 0.12,
    co2SavedKg: 7.80,
    location: 'Taller Comunitario Re-Boot',
    specifications: { type: 'DDR4', speed: '3200MHz', latency: 'CL16' },
    notes: 'MemTest86 superado al 100% sin errores.',
    createdAt: new Date('2026-02-18T09:15:00Z')
  },
  {
    id: 4,
    trackingCode: 'RAEE-2026-0004',
    title: 'Procesador AMD Ryzen 5 3600',
    categoryId: 6,
    categoryName: 'Procesadores / CPU',
    donorId: 2,
    donorName: 'TecnoEmpresa Soluciones',
    assignedWorkshopId: null,
    brand: 'AMD',
    model: 'Ryzen 5 3600',
    serialNumber: 'RYZ-3600-44910',
    conditionState: 'FUNCTIONAL',
    status: 'AVAILABLE',
    weightKg: 0.05,
    co2SavedKg: 4.00,
    location: 'Almacén Central - Caja Antiestática C2',
    specifications: { cores: 6, threads: 12, base_clock: '3.6GHz', tdp: '65W' },
    notes: 'Pines intactos, probado en banco de diagnóstico con éxito.',
    createdAt: new Date('2026-02-20T16:45:00Z')
  },
  {
    id: 5,
    trackingCode: 'RAEE-2026-0005',
    title: 'Lote de 3 Fuentes Dañadas para Extracción de Cobre y Bobinas',
    categoryId: 2,
    categoryName: 'Fuentes de Poder / PSU',
    donorId: 2,
    donorName: 'TecnoEmpresa Soluciones',
    assignedWorkshopId: null,
    brand: 'Generics',
    model: 'ATX-Various',
    serialNumber: 'LOT-GEN-009',
    conditionState: 'SCRAP_RECYCLING',
    status: 'AVAILABLE',
    weightKg: 3.80,
    co2SavedKg: 69.16,
    location: 'Área de Desarme y Reciclaje',
    specifications: { materials: ['Cobre', 'Aluminio', 'Chapa de Acero'] },
    notes: 'Listas para donación a centro de reciclaje certificado para recuperación de metales.',
    createdAt: new Date('2026-02-22T11:00:00Z')
  }
];

// Bitácora de trazabilidad en memoria
let traceabilityData: TraceabilityLog[] = [
  {
    id: 1,
    componentId: 1,
    actorId: 2,
    actorName: 'TecnoEmpresa Soluciones',
    action: 'CATALOGED',
    details: 'Pieza ingresada y registrada en el sistema EcoPlaca.',
    recordedAt: new Date('2026-02-15T10:00:00Z')
  },
  {
    id: 2,
    componentId: 1,
    actorId: 3,
    actorName: 'Taller Comunitario Re-Boot',
    action: 'DIAGNOSED',
    details: 'Inspección técnica completada. Condensador dañado detectado, placa recuperable.',
    recordedAt: new Date('2026-02-15T12:00:00Z')
  },
  {
    id: 3,
    componentId: 2,
    actorId: 2,
    actorName: 'TecnoEmpresa Soluciones',
    action: 'CATALOGED',
    details: 'Fuente de poder donada por renovación corporativa de equipos.',
    recordedAt: new Date('2026-02-16T14:30:00Z')
  },
  {
    id: 4,
    componentId: 3,
    actorId: 2,
    actorName: 'TecnoEmpresa Soluciones',
    action: 'CATALOGED',
    details: 'Módulos de memoria RAM donados.',
    recordedAt: new Date('2026-02-18T09:15:00Z')
  },
  {
    id: 5,
    componentId: 3,
    actorId: 3,
    actorName: 'Taller Comunitario Re-Boot',
    action: 'RESERVED',
    details: 'Reserva aprobada para ensamble escolar en aula comunitaria.',
    recordedAt: new Date('2026-02-19T10:00:00Z')
  }
];

export const componentController = {
  // Obtener todos los componentes con filtros
  getComponents: async (req: Request, res: Response): Promise<void> => {
    const { status, condition, categoryId, search } = req.query;

    let filtered = [...componentsData];

    if (status) {
      filtered = filtered.filter(c => c.status === (status as string).toUpperCase());
    }

    if (condition) {
      filtered = filtered.filter(c => c.conditionState === (condition as string).toUpperCase());
    }

    if (categoryId) {
      const catId = parseInt(categoryId as string, 10);
      filtered = filtered.filter(c => c.categoryId === catId);
    }

    if (search) {
      const term = (search as string).toLowerCase();
      filtered = filtered.filter(c => 
        c.title.toLowerCase().includes(term) ||
        c.trackingCode.toLowerCase().includes(term) ||
        (c.brand && c.brand.toLowerCase().includes(term)) ||
        (c.model && c.model.toLowerCase().includes(term))
      );
    }

    sendSuccess(res, filtered, 'Listado de componentes obtenido', 200, {
      total: filtered.length
    });
  },

  // Obtener componente individual por ID
  getComponentById: async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    const item = componentsData.find(c => c.id === id);

    if (!item) {
      sendError(res, `Componente con ID ${id} no encontrado`, 404);
      return;
    }

    sendSuccess(res, item, 'Detalle del componente');
  },

  // Catalogar un nuevo componente de hardware
  createComponent: async (req: Request, res: Response): Promise<void> => {
    const body: CreateComponentDTO = req.body;

    if (!body.title || !body.categoryId || body.weightKg === undefined) {
      sendError(res, 'Campos requeridos faltantes: title, categoryId, weightKg', 400);
      return;
    }

    const nextId = componentsData.length > 0 ? Math.max(...componentsData.map(c => c.id)) + 1 : 1;
    const trackingCode = `RAEE-2026-${String(nextId).padStart(4, '0')}`;
    const co2SavedKg = calculateAvoidedCo2(body.weightKg);

    const newComponent: Component = {
      id: nextId,
      trackingCode,
      title: body.title,
      categoryId: body.categoryId,
      donorId: body.donorId || 2,
      brand: body.brand,
      model: body.model,
      serialNumber: body.serialNumber,
      conditionState: body.conditionState || 'REPAIRABLE',
      status: 'AVAILABLE',
      weightKg: body.weightKg,
      co2SavedKg,
      location: body.location || 'Almacén General EcoPlaca',
      specifications: body.specifications,
      notes: body.notes,
      createdAt: new Date()
    };

    componentsData.push(newComponent);

    // Registrar en trazabilidad
    traceabilityData.push({
      id: traceabilityData.length + 1,
      componentId: newComponent.id,
      actorId: newComponent.donorId,
      action: 'CATALOGED',
      details: `Componente catalogado con código de seguimiento ${trackingCode}`,
      recordedAt: new Date()
    });

    sendSuccess(res, newComponent, 'Componente catalogado exitosamente', 201);
  },

  // Actualizar estado del componente
  updateStatus: async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string, 10);
    const { status, details, actorId } = req.body;

    const index = componentsData.findIndex(c => c.id === id);
    if (index === -1) {
      sendError(res, `Componente con ID ${id} no encontrado`, 404);
      return;
    }

    const validStatuses: ComponentStatus[] = ['AVAILABLE', 'RESERVED', 'IN_REPAIR', 'REUSED', 'RECYCLED'];
    if (!validStatuses.includes(status)) {
      sendError(res, `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}`, 400);
      return;
    }

    componentsData[index].status = status;
    componentsData[index].updatedAt = new Date();

    traceabilityData.push({
      id: traceabilityData.length + 1,
      componentId: id,
      actorId: actorId || null,
      action: status === 'RESERVED' ? 'RESERVED' : status === 'IN_REPAIR' ? 'REPAIR_STARTED' : 'REPAIRED',
      details: details || `Estado actualizado a ${status}`,
      recordedAt: new Date()
    });

    sendSuccess(res, componentsData[index], 'Estado de componente actualizado');
  },

  // Obtener historial de trazabilidad de un componente
  getTraceability: async (req: Request, res: Response): Promise<void> => {
    const componentId = parseInt(req.params.id as string, 10);
    const history = traceabilityData.filter(t => t.componentId === componentId);
    sendSuccess(res, history, `Historial de trazabilidad del componente ${componentId}`);
  },

  // Exponer lista interna para cálculos de impacto
  getInternalData: () => componentsData
};
