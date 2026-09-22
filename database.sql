-- Script de creación de Base de Datos para Gran Casino Hotel
CREATE DATABASE IF NOT EXISTS hotel_casino;
USE hotel_casino;

-- Tabla de Habitaciones
CREATE TABLE IF NOT EXISTS rooms (
    id INT PRIMARY KEY,
    number INT NOT NULL,
    floor INT NOT NULL,
    status VARCHAR(50) DEFAULT 'available',
    type VARCHAR(100),
    rate DECIMAL(10, 2),
    notes TEXT,
    check_in DATETIME NULL,
    check_out DATETIME NULL
);

-- Tabla de Huéspedes Actuales
CREATE TABLE IF NOT EXISTS current_guests (
    room_id INT PRIMARY KEY,
    name VARCHAR(255),
    id_card VARCHAR(100),
    payment_method VARCHAR(100),
    payment_status VARCHAR(50),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Tabla de Cargos Adicionales
CREATE TABLE IF NOT EXISTS extra_charges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    description VARCHAR(255),
    amount DECIMAL(10, 2),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Tabla de Historial (Pagos Realizados)
CREATE TABLE IF NOT EXISTS payment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    guest_name VARCHAR(255),
    total_usd DECIMAL(10, 2),
    total_bs DECIMAL(15, 2),
    payment_method VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    final_status VARCHAR(50)
);

-- Tabla de Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_name VARCHAR(255),
    action VARCHAR(255),
    details TEXT
);

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    role VARCHAR(50)
);

-- Usuarios Iniciales por Defecto (admin / 123, recepcion / 456)
INSERT IGNORE INTO users (username, password_hash, name, role) VALUES 
('admin', '$2y$10$0GiOZzW7tWvA/BrnP.pDnuDGTwDc37EmotsSSXR0g4vk7Y67gMAMa', 'Administrador Principal', 'admin'),
('recepcion', '$2y$10$i3pNkr7nMiKcq528WDVZZO7V3ObCsdTB.saenXjOZ3bVEPRxElqQy', 'Recepcionista Turno A', 'recepcion');

-- Poblado inicial de habitaciones (Pisos 1 al 7)
-- Generando habitaciones programáticamente para los 7 pisos
DELIMITER //
DROP PROCEDURE IF EXISTS PopulateRooms //
CREATE PROCEDURE PopulateRooms()
BEGIN
    DECLARE f INT DEFAULT 1;
    DECLARE r INT DEFAULT 1;
    DECLARE room_num INT;
    DECLARE r_type VARCHAR(100);
    DECLARE r_rate DECIMAL(10,2);
    
    WHILE f <= 7 DO
        SET r = 1;
        WHILE r <= (CASE WHEN f = 7 THEN 13 ELSE 14 END) DO
            SET room_num = (f * 100) + r;
            SET r_type = CASE 
                WHEN f = 7 THEN 'Suite Real' 
                WHEN r > 10 THEN 'Doble Superior' 
                ELSE 'Estándar' 
            END;
            SET r_rate = CASE 
                WHEN f = 7 THEN 150.00 
                ELSE 45.00 
            END;
            
            INSERT IGNORE INTO rooms (id, number, floor, status, type, rate) 
            VALUES (room_num, room_num, f, 'available', r_type, r_rate);
            
            SET r = r + 1;
        END WHILE;
        SET f = f + 1;
    END WHILE;
END //
DELIMITER ;

CALL PopulateRooms();
DROP PROCEDURE IF EXISTS PopulateRooms;

-- Tabla de Mesas del Restaurante (Capacidad total 110 personas)
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 4,
    status VARCHAR(50) DEFAULT 'available' -- available, occupied, reserved
);

-- Tabla de Menú
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price_usd DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT -1 -- -1 para ilimitado
);

-- Tabla de Comandas / Órdenes
CREATE TABLE IF NOT EXISTS restaurant_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INT,
    room_id INT DEFAULT NULL, -- NULL si no es huésped
    total_usd DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'open', -- open, closed, paid
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Detalle de la Orden
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    item_id INT,
    quantity INT DEFAULT 1,
    subtotal_usd DECIMAL(10, 2),
    FOREIGN KEY (order_id) REFERENCES restaurant_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES menu_items(id)
);

-- Tabla de Eventos y Sala de Reuniones (Capacidad 100 personas)
CREATE TABLE IF NOT EXISTS event_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    organizer VARCHAR(255),
    start_time DATETIME,
    end_time DATETIME,
    attendees INT DEFAULT 0,
    total_usd DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'confirmed' -- confirmed, cancelled, completed
);

-- Tabla de Inventario General
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- Hotel, Restaurante, Limpieza
    quantity DECIMAL(10, 2) DEFAULT 0,
    unit VARCHAR(50), -- Unidades, Kg, Litros
    min_stock DECIMAL(10, 2) DEFAULT 0
);

-- Actualizar payment_history para cumplimiento legal (IGTF e INATUR)
-- Nota: Si la tabla ya existe, añadir las columnas
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS id_card VARCHAR(100) DEFAULT NULL;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS igtf_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS inatur_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS subtotal_usd DECIMAL(10, 2) DEFAULT 0.00;

-- Poblado inicial de mesas del restaurante
INSERT IGNORE INTO restaurant_tables (id, name, capacity) VALUES 
(1, 'Mesa 1', 4), (2, 'Mesa 2', 4), (3, 'Mesa 3', 4), (4, 'Mesa 4', 4), (5, 'Mesa 5', 4),
(6, 'Mesa 6', 4), (7, 'Mesa 7', 4), (8, 'Mesa 8', 4), (9, 'Mesa 9', 4), (10, 'Mesa 10', 4),
(11, 'Mesa 11', 6), (12, 'Mesa 12', 6), (13, 'Mesa 13', 6), (14, 'Mesa 14', 6), (15, 'Mesa 15', 6),
(16, 'Mesa 16', 2), (17, 'Mesa 17', 2), (18, 'Mesa 18', 2), (19, 'Mesa 19', 2), (20, 'Mesa 20', 2),
(21, 'VIP 1', 10), (22, 'VIP 2', 10);

-- Poblado inicial de menú (ejemplo)
INSERT IGNORE INTO menu_items (name, category, price_usd) VALUES 
('Desayuno Americano', 'Desayuno', 8.50),
('Almuerzo Ejecutivo', 'Almuerzo', 12.00),
('Cena Romántica', 'Cena', 45.00),
('Café Espresso', 'Bebidas', 2.00),
('Refresco 355ml', 'Bebidas', 1.50);
