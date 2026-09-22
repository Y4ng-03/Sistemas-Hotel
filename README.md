# 🏨 Gran Casino Hotel - Sistema de Gestión Hotelera (PMS & POS)

Sistema integral de gestión para hoteles, suites y restaurantes con interfaz moderna de alto rendimiento (*glassmorphism*), panel administrativo, control de ocupación en tiempo real y facturación multimoneda (USD / Bs) con cálculo de tributos legales (IGTF e INATUR).

---

## 🌟 Características Principales

- **Gestión de Habitaciones (Pisos 1 al 7)**:
  - Visualización interactiva y filtrado por pisos y estados (*Disponible, Ocupada, Mantenimiento, Limpieza*).
  - Tipos de habitación: *Estándar*, *Doble Superior*, *Suite Real*.
  - Modales para Check-In, Check-Out, registro de huéspedes y cargos extras (consumos de frigobar, lavandería, etc.).
- **Punto de Venta / Restaurante**:
  - Control de 22 mesas (incluyendo mesas VIP) con estado en tiempo real.
  - Catálogo de menú por categorías (Desayunos, Almuerzos, Cenas, Bebidas).
  - Facturación directa a la habitación o pago independiente.
- **Salón de Eventos y Reuniones**:
  - Reserva y programación de eventos corporativos o sociales (capacidad de hasta 100 personas).
- **Inventario General**:
  - Seguimiento de stock para suministros de Hotel, Restaurante y Limpieza con alertas de reposición.
- **Cálculo Financiero Multimoneda**:
  - Conversión dinámica USD / Bolívares (tasa BCV configurable).
  - Desglose de impuestos y retenciones: Subtotal, IGTF (3%) e INATUR (1%).
  - Historial detallado de pagos con número de cédula/documento de identidad.
- **Seguridad y Auditoría**:
  - Autenticación segura mediante contraseñas cifradas con `BCRYPT`.
  - Roles de usuario: `admin` (acceso completo y auditoría) y `recepcion` (operaciones diarias).
  - Bitácora de auditoría en base de datos (`audit_logs`) con registro cronológico de acciones.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**:
  - [Vite](https://vitejs.dev/)
  - JavaScript Vanilla (ES6+)
  - CSS3 Moderno (Glassmorphism, Dark Mode, variables CSS, micro-interacciones)
  - [Chart.js](https://www.chartjs.org/) para métricas y reportes visuales
- **Backend**:
  - PHP 8.x con arquitectura REST
  - PDO (PHP Data Objects) con consultas preparadas contra inyecciones SQL
  - Headers de seguridad (CSP, XSS Protection, CORS)
- **Base de Datos**:
  - MySQL / MariaDB (con procedimientos almacenados y disparadores)

---

## 🚀 Requisitos e Instalación

### 1. Clonar el Repositorio
```bash
git clone https://github.com/Y4ng-03/Sistemas-Hotel.git
cd Sistemas-Hotel
```

### 2. Configurar el Servidor y Base de Datos (XAMPP)
1. Coloca la carpeta del proyecto en `htdocs` de XAMPP (por ejemplo: `C:/xampp/htdocs/Sistema hotel`).
2. Inicia los servicios de **Apache** y **MySQL** desde el panel de control de XAMPP.
3. Abre **phpMyAdmin** (`http://localhost/phpmyadmin`) o tu cliente MySQL preferido.
4. Importa el archivo `database.sql` incluido en el proyecto. Este script:
   - Crea la base de datos `hotel_casino`.
   - Crea las tablas correspondientes (`rooms`, `current_guests`, `extra_charges`, `payment_history`, `audit_logs`, `users`, `restaurant_tables`, `menu_items`, `restaurant_orders`, `order_items`, `event_bookings`, `inventory`).
   - Popula automáticamente las habitaciones y los usuarios iniciales.

### 3. Configuración de Base de Datos
Verifica en [backend/db.php](backend/db.php) que los parámetros de conexión coincidan con tu servidor local:
```php
$host = 'localhost';
$db   = 'hotel_casino';
$user = 'root';
$pass = ''; // Por defecto vacío en XAMPP
```

### 4. Instalar Dependencias del Frontend
Asegúrate de tener [Node.js](https://nodejs.org/) instalado y ejecuta:
```bash
npm install
```

### 5. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
Abre la URL proporcionada por Vite (habitualmente `http://localhost:5173`) en tu navegador.

---

## 🔑 Credenciales de Acceso por Defecto

| Rol | Usuario | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin` | `123` | Control total, auditoría, configuración |
| **Recepción** | `recepcion` | `456` | Check-in/out, restaurante, habitaciones |

---

## 📁 Estructura del Proyecto

```text
├── backend/
│   ├── api.php             # Endpoint API principal (controlador REST)
│   └── db.php              # Configuración PDO y conexión MySQL
├── public/                 # Recursos estáticos (logos, iconos, Chart.js)
├── src/
│   ├── assets/             # Imágenes y assets del frontend
│   ├── main.js             # Lógica central de la aplicación y renderizado
│   └── style.css           # Estilos principales y diseño de la interfaz
├── database.sql            # Script DDL y DML completo para importar en MySQL
├── index.html              # Plantilla base SPA
├── package.json            # Scripts y dependencias frontend
└── vite.config.js          # Configuración de Vite
```

---

## 📄 Licencia

Este proyecto se distribuye bajo los términos de uso interno y académico. Desarrollado para la gestión eficiente hotelera y de casino.
