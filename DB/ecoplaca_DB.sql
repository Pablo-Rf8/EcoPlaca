-- =============================================================================
-- EcoPlaca - Plataforma de Gestión Circular y Trazabilidad de RAEE
-- Script de Base de Datos Relacional: ecoplaca_DB.sql
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `ecoplaca_db` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `ecoplaca_db`;

-- -----------------------------------------------------------------------------
-- 1. Tabla: roles
-- Define los perfiles del ecosistema circular:
-- DONOR (Donante), WORKSHOP (Taller técnico), RECYCLER (Centro de reciclaje), ADMIN (Administrador)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(50) NOT NULL UNIQUE,
    `description` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2. Tabla: users
-- Usuarios registrados (donantes de hardware, talleres de reparación, centros de reciclaje)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `role_id` INT NOT NULL,
    `full_name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `organization_name` VARCHAR(150) NULL,
    `address` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 3. Tabla: categories
-- Categorías de residuos de aparatos eléctricos y electrónicos (RAEE)
-- Incluye factor de emisión promedio para cálculo de CO2 evitado
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `code` VARCHAR(20) NOT NULL UNIQUE,
    `description` TEXT NULL,
    `carbon_factor_kg_per_kg` DECIMAL(8, 2) NOT NULL DEFAULT 25.00 COMMENT 'Factor de kg CO2eq ahorrado por cada kg de componente reutilizado',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 4. Tabla: components
-- Inventario de piezas de hardware rescatadas y catalogadas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `components` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tracking_code` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Identificador único de trazabilidad (e.g. RAEE-2026-001)',
    `title` VARCHAR(200) NOT NULL,
    `category_id` INT NOT NULL,
    `donor_id` INT NOT NULL,
    `assigned_workshop_id` INT NULL,
    `brand` VARCHAR(100) NULL,
    `model` VARCHAR(100) NULL,
    `serial_number` VARCHAR(100) NULL,
    `condition_state` ENUM('FUNCTIONAL', 'REPAIRABLE', 'SCRAP_RECYCLING') NOT NULL DEFAULT 'REPAIRABLE',
    `status` ENUM('AVAILABLE', 'RESERVED', 'IN_REPAIR', 'REUSED', 'RECYCLED') NOT NULL DEFAULT 'AVAILABLE',
    `weight_kg` DECIMAL(6, 2) NOT NULL DEFAULT 0.00 COMMENT 'Peso físico para métricas de desvío de vertedero',
    `co2_saved_kg` DECIMAL(8, 2) NOT NULL DEFAULT 0.00 COMMENT 'Impacto ambiental calculado en CO2 evitado',
    `location` VARCHAR(150) NULL COMMENT 'Ubicación física actual o depósito',
    `specifications` JSON NULL COMMENT 'Metadatos técnicos específicos (chips, socket, capacidad, voltajes)',
    `notes` TEXT NULL,
    `image_url` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_components_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_components_donor` FOREIGN KEY (`donor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_components_workshop` FOREIGN KEY (`assigned_workshop_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 5. Tabla: reservations
-- Solicitudes y reservas de piezas por parte de talleres o centros de reciclaje
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `component_id` INT NOT NULL,
    `requester_id` INT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `intended_use` ENUM('REFURBISHMENT', 'PARTS_HARVESTING', 'MATERIAL_RECYCLING') NOT NULL DEFAULT 'REFURBISHMENT',
    `notes` TEXT NULL,
    `requested_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` TIMESTAMP NULL,
    CONSTRAINT `fk_reservations_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_reservations_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 6. Tabla: traceability_logs
-- Bitácora inmutable de trazabilidad de cada componente desde su ingreso
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `traceability_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `component_id` INT NOT NULL,
    `actor_id` INT NULL,
    `action` ENUM('CATALOGED', 'DIAGNOSED', 'REPAIR_STARTED', 'REPAIRED', 'RESERVED', 'DELIVERED', 'SCRAPPED', 'RECYCLED') NOT NULL,
    `details` TEXT NOT NULL,
    `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_traceability_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_traceability_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 7. Vista: v_environmental_impact_summary
-- Mide en tiempo real el impacto ambiental acumulado de hardware rescatado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_environmental_impact_summary` AS
SELECT 
    COUNT(c.id) AS total_rescued_components,
    COALESCE(SUM(c.weight_kg), 0.00) AS total_diverted_landfill_kg,
    COALESCE(SUM(c.co2_saved_kg), 0.00) AS total_co2_avoided_kg,
    COUNT(CASE WHEN c.status = 'AVAILABLE' THEN 1 END) AS active_available_components,
    COUNT(CASE WHEN c.status = 'RESERVED' THEN 1 END) AS reserved_components,
    COUNT(CASE WHEN c.status IN ('REUSED', 'RECYCLED') THEN 1 END) AS circularized_components
FROM `components` c;

-- =============================================================================
-- DATOS INICIALES (SEED DATA)
-- =============================================================================

-- Roles del sistema
INSERT INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'ADMIN', 'Administrador general de la plataforma EcoPlaca'),
(2, 'DONOR', 'Donante particular, institucional o corporativo de hardware en desuso'),
(3, 'WORKSHOP', 'Taller técnico especializado en reacondicionamiento y reparación'),
(4, 'RECYCLER', 'Centro certificado de tratamiento y reciclaje de materiales RAEE')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- Categorías iniciales de hardware con factores de huella de carbono estimada
INSERT INTO `categories` (`id`, `name`, `code`, `description`, `carbon_factor_kg_per_kg`) VALUES
(1, 'Placas Madre / Motherboards', 'CAT-MB', 'Placas base de computadoras de escritorio, servidores y portátiles', 35.50),
(2, 'Fuentes de Poder / PSU', 'CAT-PSU', 'Fuentes de alimentación ATX, modulares y de servidores', 18.20),
(3, 'Memorias RAM', 'CAT-RAM', 'Módulos DDR3, DDR4, DDR5 y SO-DIMM para reutilización', 65.00),
(4, 'Unidades de Almacenamiento', 'CAT-STO', 'Discos duros mecánicos HDD y unidades de estado sólido SSD', 42.00),
(5, 'Tarjetas de Video / GPU', 'CAT-GPU', 'Tarjetas gráficas dedicadas de estaciones de trabajo y consumo', 55.80),
(6, 'Procesadores / CPU', 'CAT-CPU', 'Microprocesadores de varias generaciones listos para ensamble', 80.00),
(7, 'Monitores y Pantallas', 'CAT-DISP', 'Paneles LCD/LED de monitores y laptops rescatadas', 22.40)
ON DUPLICATE KEY UPDATE `carbon_factor_kg_per_kg` = VALUES(`carbon_factor_kg_per_kg`);

-- Usuarios de demostración (Contraseña de prueba: 'ecoplaca2026')
INSERT INTO `users` (`id`, `role_id`, `full_name`, `email`, `password_hash`, `phone`, `organization_name`, `address`, `city`) VALUES
(1, 1, 'Administrador EcoPlaca', 'admin@ecoplaca.org', '$2b$10$7vN34bF.Z9x9aQyKjDqLpOSnIe9P2aH2r2D1j.8D8.4D2aA.12345', '+52 55 1234 5678', 'EcoPlaca Foundation', 'Av. Reforma 100', 'Ciudad de México'),
(2, 2, 'TecnoEmpresa Soluciones', 'contacto@tecnoempresa.com', '$2b$10$7vN34bF.Z9x9aQyKjDqLpOSnIe9P2aH2r2D1j.8D8.4D2aA.12345', '+52 55 9876 5432', 'TecnoEmpresa S.A.', 'Parque Industrial Norte 45', 'Monterrey'),
(3, 3, 'Taller Comunitario Re-Boot', 'contacto@taller-reboot.org', '$2b$10$7vN34bF.Z9x9aQyKjDqLpOSnIe9P2aH2r2D1j.8D8.4D2aA.12345', '+52 33 4455 6677', 'Re-Boot Hardware Lab', 'Calle Hidalgo 210', 'Guadalajara'),
(4, 4, 'E-Waste Reciclaje Sustentable', 'operaciones@ewasterecicla.mx', '$2b$10$7vN34bF.Z9x9aQyKjDqLpOSnIe9P2aH2r2D1j.8D8.4D2aA.12345', '+52 55 7788 9900', 'E-Waste Solutions de México', 'Zona Industrial Sur 12', 'Puebla')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- Componentes de hardware iniciales catalogados con trazabilidad e impacto calculado
INSERT INTO `components` (`id`, `tracking_code`, `title`, `category_id`, `donor_id`, `assigned_workshop_id`, `brand`, `model`, `serial_number`, `condition_state`, `status`, `weight_kg`, `co2_saved_kg`, `location`, `specifications`, `notes`) VALUES
(1, 'RAEE-2026-0001', 'Tarjeta Madre Asus Prime B450M-A', 1, 2, 3, 'ASUS', 'Prime B450M-A', 'AS-B450M-98124', 'REPAIRABLE', 'AVAILABLE', 0.85, 30.17, 'Almacén Central - Rack A1', '{"socket": "AM4", "form_factor": "Micro-ATX", "ram_slots": 4}', 'Probada con multímetro. Requiere cambio de condensador sólido en fase VRM.'),
(2, 'RAEE-2026-0002', 'Fuente de Poder EVGA 600W 80 Plus', 2, 2, 3, 'EVGA', '600 W1', 'EV-600W-34211', 'FUNCTIONAL', 'AVAILABLE', 1.60, 29.12, 'Almacén Central - Rack B3', '{"wattage": "600W", "efficiency": "80 PLUS White", "cables": "Non-Modular"}', 'Completamente operativa y testeada con probador de fuentes de poder.'),
(3, 'RAEE-2026-0003', 'Kit RAM Kingston Fury Beast 16GB (2x8GB) DDR4', 3, 2, NULL, 'Kingston', 'Fury Beast DDR4', 'KF-DDR4-16G-887', 'FUNCTIONAL', 'RESERVED', 0.12, 7.80, 'Taller Comunitario Re-Boot', '{"type": "DDR4", "speed": "3200MHz", "latency": "CL16"}', 'MemTest86 superado al 100% sin errores.'),
(4, 'RAEE-2026-0004', 'Procesador AMD Ryzen 5 3600', 6, 2, NULL, 'AMD', 'Ryzen 5 3600', 'RYZ-3600-44910', 'FUNCTIONAL', 'AVAILABLE', 0.05, 4.00, 'Almacén Central - Caja Antiestática C2', '{"cores": 6, "threads": 12, "base_clock": "3.6GHz", "tdp": "65W"}', 'Pines intactos, probado en banco de diagnóstico con éxito.'),
(5, 'RAEE-2026-0005', 'Lote de 3 Fuentes Dañadas para Extracción de Cobre y Bobinas', 2, 2, NULL, 'Generics', 'ATX-Various', 'LOT-GEN-009', 'SCRAP_RECYCLING', 'AVAILABLE', 3.80, 69.16, 'Área de Desarme y Reciclaje', '{"materials": ["Cobre", "Aluminio", "Chapa de Acero"]}', 'Listas para donación a centro de reciclaje certificado para recuperación de metales.')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

-- Reservas de ejemplo
INSERT INTO `reservations` (`id`, `component_id`, `requester_id`, `status`, `intended_use`, `notes`) VALUES
(1, 3, 3, 'APPROVED', 'REFURBISHMENT', 'Requerido para equipar una computadora recuperada para la escuela técnica local.');

-- Historial de trazabilidad inicial
INSERT INTO `traceability_logs` (`component_id`, `actor_id`, `action`, `details`) VALUES
(1, 2, 'CATALOGED', 'Pieza ingresada y registrada por TecnoEmpresa Soluciones.'),
(1, 3, 'DIAGNOSED', 'Inspección técnica completada. Condensador dañado detectado, placa recuperable.'),
(2, 2, 'CATALOGED', 'Fuente de poder donada por renovación de equipos de cómputo corporativo.'),
(3, 2, 'CATALOGED', 'Módulos de memoria RAM donados.'),
(3, 3, 'RESERVED', 'Reserva aprobada para ensamble escolar.');
