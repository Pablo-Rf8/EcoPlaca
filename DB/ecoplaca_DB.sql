-- =============================================================================
-- EcoPlaca - Plataforma de Gestión Circular y Trazabilidad de RAEE
-- Script de Base de Datos Relacional: ecoplaca_DB.sql
-- Motor: InnoDB | Codificación: UTF-8 (utf8mb4_unicode_ci)
-- Normalización: 3FN (Tercera Forma Normal)
-- =============================================================================

DROP DATABASE IF EXISTS `ecoplaca_db`;
CREATE DATABASE `ecoplaca_db` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `ecoplaca_db`;

-- -----------------------------------------------------------------------------
-- 1. Tabla: roles
-- Define los perfiles dentro de la plataforma: ADMIN, DONOR, TECHNICIAN
-- -----------------------------------------------------------------------------
CREATE TABLE `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(50) NOT NULL UNIQUE,
    `descripcion` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2. Tabla: usuarios
-- Registra a administradores, donantes y técnicos de talleres de reciclaje/reparación
-- -----------------------------------------------------------------------------
CREATE TABLE `usuarios` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `rol_id` INT NOT NULL,
    `nombre_completo` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `direccion` VARCHAR(255) NULL,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 3. Tabla: categorias_raee
-- Catálogo oficial de tipos de residuos de aparatos eléctricos y electrónicos
-- -----------------------------------------------------------------------------
CREATE TABLE `categorias_raee` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo` VARCHAR(20) NOT NULL UNIQUE,
    `nombre` VARCHAR(100) NOT NULL UNIQUE,
    `descripcion` TEXT NULL,
    `factor_co2_kg` DECIMAL(8, 2) NOT NULL DEFAULT 25.00 COMMENT 'kg CO2eq ahorrados por cada kg reutilizado',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 4. Tabla: centros_acopio
-- Almacenes, talleres técnicos y centros autorizados de recepción de hardware
-- -----------------------------------------------------------------------------
CREATE TABLE `centros_acopio` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(150) NOT NULL,
    `direccion` VARCHAR(255) NOT NULL,
    `ciudad` VARCHAR(100) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `capacidad_kg` DECIMAL(10, 2) NOT NULL DEFAULT 5000.00,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 5. Tabla: centros_categorias (Relación M:N)
-- Define qué categorías de RAEE está autorizado a procesar cada centro
-- -----------------------------------------------------------------------------
CREATE TABLE `centros_categorias` (
    `centro_id` INT NOT NULL,
    `categoria_id` INT NOT NULL,
    PRIMARY KEY (`centro_id`, `categoria_id`),
    CONSTRAINT `fk_cc_centro` FOREIGN KEY (`centro_id`) REFERENCES `centros_acopio` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cc_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_raee` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 6. Tabla: dispositivos
-- Inventario de hardware catalogado y trazable
-- -----------------------------------------------------------------------------
CREATE TABLE `dispositivos` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo_trazabilidad` VARCHAR(50) NOT NULL UNIQUE,
    `titulo` VARCHAR(200) NOT NULL,
    `categoria_id` INT NOT NULL,
    `donante_id` INT NOT NULL,
    `centro_acopio_id` INT NULL,
    `marca` VARCHAR(100) NULL,
    `modelo` VARCHAR(100) NULL,
    `numero_serie` VARCHAR(100) NULL,
    `estado_funcional` ENUM('OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE') NOT NULL DEFAULT 'REPARABLE',
    `estado_disponibilidad` ENUM('DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'RECICLADO', 'ENTREGADO') NOT NULL DEFAULT 'DISPONIBLE',
    `peso_kg` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    `co2_evitado_kg` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `especificaciones` JSON NULL,
    `notas` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_dispositivos_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_raee` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_dispositivos_donante` FOREIGN KEY (`donante_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_dispositivos_centro` FOREIGN KEY (`centro_acopio_id`) REFERENCES `centros_acopio` (`id`) ON DELETE SET NULL,
    INDEX `idx_busqueda_estado` (`estado_disponibilidad`, `estado_funcional`),
    INDEX `idx_categoria` (`categoria_id`)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 7. Tabla: ordenes_transferencia
-- Bitácora de traspaso de dispositivos hacia técnicos o entre centros
-- -----------------------------------------------------------------------------
CREATE TABLE `ordenes_transferencia` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `dispositivo_id` INT NOT NULL,
    `tecnico_id` INT NOT NULL,
    `centro_origen_id` INT NOT NULL,
    `centro_destino_id` INT NULL,
    `estado` ENUM('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO', 'COMPLETADA') NOT NULL DEFAULT 'PENDIENTE',
    `motivo` VARCHAR(255) NOT NULL,
    `fecha_solicitud` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `fecha_completado` TIMESTAMP NULL,
    CONSTRAINT `fk_ot_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `dispositivos` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ot_tecnico` FOREIGN KEY (`tecnico_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ot_origen` FOREIGN KEY (`centro_origen_id`) REFERENCES `centros_acopio` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ot_destino` FOREIGN KEY (`centro_destino_id`) REFERENCES `centros_acopio` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- DATOS INICIALES (SEED DATA)
-- =============================================================================

-- Roles requeridos
INSERT INTO `roles` (`id`, `nombre`, `descripcion`) VALUES
(1, 'ADMIN', 'Administrador general del sistema EcoPlaca'),
(2, 'DONOR', 'Donante particular, corporativo o institucional de hardware'),
(3, 'TECHNICIAN', 'Técnico especialista de taller de reacondicionamiento');

-- Usuarios con hash BCrypt (contraseña de prueba: 'ecoplaca2026')
-- Hash generado con bcrypt salt 10 rounds para 'ecoplaca2026': $2a$10$oX3i6G/w7a8Z9n1yBwXyOegvD.jK.K4Y3G6gXlS21M8W5D3B8D.8G
INSERT INTO `usuarios` (`id`, `rol_id`, `nombre_completo`, `email`, `password_hash`, `telefono`, `direccion`) VALUES
(1, 1, 'Carlos Mendoza (Admin)', 'admin@ecoplaca.org', '$2a$10$.ePJYTtRo/4PMmes7NHiSe.JwrhL33RxRBd4TuV1EjAPkQev4qBym', '+52 55 1122 3344', 'Av. Reforma 400, CDMX'),
(2, 2, 'TecnoEmpresa Donaciones', 'contacto@tecnoempresa.mx', '$2a$10$.ePJYTtRo/4PMmes7NHiSe.JwrhL33RxRBd4TuV1EjAPkQev4qBym', '+52 55 9988 7766', 'Parque Tecnológico 12, Monterrey'),
(3, 3, 'Ing. Laura Valenzuela (Técnico)', 'laura.tecnico@ecoplaca.org', '$2a$10$.ePJYTtRo/4PMmes7NHiSe.JwrhL33RxRBd4TuV1EjAPkQev4qBym', '+52 33 4455 6677', 'Laboratorio Re-Boot, Guadalajara');

-- 4 Categorías oficiales de RAEE
INSERT INTO `categorias_raee` (`id`, `codigo`, `nombre`, `descripcion`, `factor_co2_kg`) VALUES
(1, 'RAEE-MB', 'Tarjetas Madre y Circuitos PCB', 'Placas base de computadoras de escritorio, laptops y servidores', 35.50),
(2, 'RAEE-PSU', 'Fuentes de Poder', 'Fuentes de alimentación ATX, modulares y de servidores', 18.20),
(3, 'RAEE-RAM', 'Módulos de Memoria RAM', 'Módulos DDR3, DDR4 y DDR5 para reutilización técnica', 65.00),
(4, 'RAEE-CPU', 'Microprocesadores', 'CPUs de arquitecturas x86 y ARM rescatados para ensamble', 80.00);

-- 2 Centros de Acopio
INSERT INTO `centros_acopio` (`id`, `nombre`, `direccion`, `ciudad`, `telefono`, `capacidad_kg`) VALUES
(1, 'Centro de Acopio Central - CDMX', 'Calzada Vallejo 1020', 'Ciudad de México', '+52 55 2345 6789', 10000.00),
(2, 'Taller Técnico y Acopio Occidente', 'Av. Niños Héroes 450', 'Guadalajara', '+52 33 8765 4321', 4500.00);

-- Relación M:N: Qué categorías procesa cada centro
INSERT INTO `centros_categorias` (`centro_id`, `categoria_id`) VALUES
(1, 1), (1, 2), (1, 3), (1, 4),
(2, 1), (2, 2), (2, 3);

-- Dispositivos de prueba catalogados
INSERT INTO `dispositivos` (`id`, `codigo_trazabilidad`, `titulo`, `categoria_id`, `donante_id`, `centro_acopio_id`, `marca`, `modelo`, `numero_serie`, `estado_funcional`, `estado_disponibilidad`, `peso_kg`, `co2_evitado_kg`, `especificaciones`, `notas`) VALUES
(1, 'RAEE-2026-0001', 'Tarjeta Madre Asus Prime B450M-A II', 1, 2, 1, 'ASUS', 'Prime B450M-A II', 'AS-B450M-88192', 'REPARABLE', 'DISPONIBLE', 0.85, 30.17, '{"socket": "AM4", "ram_slots": 4, "chipset": "AMD B450"}', 'Requiere soldadura de puerto PCIe y diagnóstico de VRM.'),
(2, 'RAEE-2026-0002', 'Fuente de Poder EVGA 600W 80+ White', 2, 2, 1, 'EVGA', '600 W1', 'EV-600W-11234', 'OPERATIVO', 'DISPONIBLE', 1.60, 29.12, '{"potencia": "600W", "certificacion": "80 PLUS", "cableado": "Estándar"}', 'Voltajes testeados con medidor digital. Líneas 12V y 5V estables.'),
(3, 'RAEE-2026-0003', 'Kit Memoria RAM Kingston HyperX Fury 16GB DDR4', 3, 2, 2, 'Kingston', 'HyperX Fury', 'HX-16G-3200-99', 'OPERATIVO', 'RESERVADO', 0.12, 7.80, '{"tipo": "DDR4", "capacidad": "16GB (2x8GB)", "velocidad": "3200MHz"}', 'MemTest86 sin errores en 4 pases continuos.'),
(4, 'RAEE-2026-0004', 'Procesador AMD Ryzen 5 3600 (6C/12T)', 4, 2, 2, 'AMD', 'Ryzen 5 3600', 'RYZ-3600-77610', 'OPERATIVO', 'ASIGNADO', 0.05, 4.00, '{"nucleos": 6, "hilos": 12, "frecuencia_base": "3.6GHz"}', 'Pines en excelente estado. Asignado a taller escolar.');

-- Órdenes de transferencia de prueba
INSERT INTO `ordenes_transferencia` (`id`, `dispositivo_id`, `tecnico_id`, `centro_origen_id`, `centro_destino_id`, `estado`, `motivo`, `fecha_solicitud`, `fecha_completado`) VALUES
(1, 1, 3, 1, 2, 'EN_TRANSITO', 'Traspaso a laboratorio técnico para reparación de socket y VRM', '2026-02-20 10:00:00', NULL),
(2, 4, 3, 2, 2, 'RECIBIDO', 'Asignación directa para ensamble de equipo de cómputo educativo', '2026-02-22 14:30:00', '2026-02-22 16:00:00');
