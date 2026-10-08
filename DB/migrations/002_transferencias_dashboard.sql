-- Ejecutar una vez sobre una base existente; conserva los datos y estados históricos.
-- Usa la base configurada en DB_NAME, sin cambiar de esquema.
ALTER TABLE dispositivos MODIFY estado_disponibilidad
  ENUM('DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'RECICLADO', 'ENTREGADO')
  NOT NULL DEFAULT 'DISPONIBLE';
ALTER TABLE ordenes_transferencia MODIFY estado
  ENUM('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO', 'COMPLETADA')
  NOT NULL DEFAULT 'PENDIENTE';
