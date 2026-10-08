CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(50) NOT NULL UNIQUE,
    `descripcion` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `usuarios` (
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

CREATE TABLE IF NOT EXISTS `categorias_raee` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo` VARCHAR(20) NOT NULL UNIQUE,
    `nombre` VARCHAR(100) NOT NULL UNIQUE,
    `descripcion` TEXT NULL,
    `factor_co2_kg` DECIMAL(8, 2) NOT NULL DEFAULT 25.00 COMMENT 'kg CO2eq ahorrados por cada kg reutilizado',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `centros_acopio` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(150) NOT NULL,
    `direccion` VARCHAR(255) NOT NULL,
    `ciudad` VARCHAR(100) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `capacidad_kg` DECIMAL(10, 2) NOT NULL DEFAULT 5000.00,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `centros_categorias` (
    `centro_id` INT NOT NULL,
    `categoria_id` INT NOT NULL,
    PRIMARY KEY (`centro_id`, `categoria_id`),
    CONSTRAINT `fk_cc_centro` FOREIGN KEY (`centro_id`) REFERENCES `centros_acopio` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cc_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_raee` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `dispositivos` (
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

CREATE TABLE IF NOT EXISTS `ordenes_transferencia` (
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