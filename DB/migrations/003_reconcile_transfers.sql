-- Repara los estados incompatibles del seed histórico sin eliminar órdenes.
UPDATE dispositivos d
SET d.estado_disponibilidad = 'RESERVADO'
WHERE d.estado_disponibilidad = 'DISPONIBLE'
  AND (SELECT COUNT(*) FROM ordenes_transferencia o
       WHERE o.dispositivo_id = d.id AND o.estado IN ('PENDIENTE', 'EN_TRANSITO')) = 1;

UPDATE dispositivos d
SET d.estado_disponibilidad = 'DISPONIBLE'
WHERE d.estado_disponibilidad = 'RESERVADO'
  AND NOT EXISTS (SELECT 1 FROM ordenes_transferencia o WHERE o.dispositivo_id = d.id);

UPDATE dispositivos d
SET d.estado_disponibilidad = 'ENTREGADO'
WHERE d.estado_disponibilidad = 'ASIGNADO'
  AND EXISTS (SELECT 1 FROM ordenes_transferencia o
              WHERE o.dispositivo_id = d.id AND o.estado = 'RECIBIDO' AND o.fecha_completado IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM ordenes_transferencia o
                  WHERE o.dispositivo_id = d.id AND o.estado IN ('PENDIENTE', 'EN_TRANSITO'));

UPDATE ordenes_transferencia o
JOIN dispositivos d ON d.id = o.dispositivo_id
SET o.estado = 'COMPLETADA'
WHERE o.estado = 'RECIBIDO' AND o.fecha_completado IS NOT NULL
  AND d.estado_disponibilidad = 'ENTREGADO';
