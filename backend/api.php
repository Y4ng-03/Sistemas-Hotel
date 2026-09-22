<?php
require_once 'db.php';

$inputData = json_decode(file_get_contents('php://input'), true);
if (!$inputData) $inputData = $_POST;

$action = $_GET['action'] ?? ($inputData['action'] ?? '');

switch ($action) {
    case 'login':
        $data = $inputData;
        
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([trim($data['username'] ?? '')]);
        $user = $stmt->fetch();
        
        if ($user && password_verify($data['password'] ?? '', $user['password_hash'])) {
            echo json_encode(['success' => true, 'user' => [
                'name' => $user['name'],
                'role' => $user['role'],
                'username' => $user['username']
            ]]);
        } else {
            echo json_encode(['error' => 'Credenciales incorrectas', 'debug' => $data]);
        }
        break;

    case 'get_rooms':
        $stmt = $pdo->query("
            SELECT r.*, g.name as guest_name, g.id_card, g.payment_method, g.payment_status 
            FROM rooms r 
            LEFT JOIN current_guests g ON r.id = g.room_id
        ");
        $rooms = $stmt->fetchAll();
        
        // Obtener cargos para cada habitación
        foreach ($rooms as &$room) {
            $stmt = $pdo->prepare("SELECT * FROM extra_charges WHERE room_id = ?");
            $stmt->execute([$room['id']]);
            $room['charges'] = $stmt->fetchAll();
        }
        
        echo json_encode($rooms);
        break;

    case 'save_room':
        $data = $inputData;
        $pdo->beginTransaction();
        
        // Actualizar habitación
        $stmt = $pdo->prepare("UPDATE rooms SET status = ?, rate = ?, notes = ?, check_in = ?, check_out = ? WHERE id = ?");
        $stmt->execute([
            $data['status'], 
            $data['rate'], 
            htmlspecialchars($data['notes'] ?? '', ENT_QUOTES, 'UTF-8'), 
            $data['checkIn'], 
            $data['checkOut'], 
            $data['id']
        ]);
        
        // Gestionar huésped
        $pdo->prepare("DELETE FROM current_guests WHERE room_id = ?")->execute([$data['id']]);
        if ($data['status'] === 'occupied') {
            $stmt = $pdo->prepare("INSERT INTO current_guests (room_id, name, id_card, payment_method, payment_status) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $data['id'], 
                $data['guest']['name'], 
                $data['guest']['id'], 
                $data['guest']['paymentMethod'], 
                $data['guest']['paymentStatus']
            ]);
        }
        
        $pdo->commit();
        echo json_encode(['success' => true]);
        break;

    case 'add_charge':
        $data = $inputData;
        $stmt = $pdo->prepare("INSERT INTO extra_charges (room_id, description, amount) VALUES (?, ?, ?)");
        $stmt->execute([$data['room_id'], $data['description'], $data['amount']]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        break;

    case 'delete_charge':
        $id = $_GET['id'] ?? 0;
        $stmt = $pdo->prepare("DELETE FROM extra_charges WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        break;

    case 'checkout':
        $data = $inputData;
        $pdo->beginTransaction();
        
        // Guardar en historial con IGTF e INATUR
        $stmt = $pdo->prepare("INSERT INTO payment_history (room_id, guest_name, id_card, total_usd, total_bs, payment_method, final_status, igtf_amount, inatur_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['room_id'], 
            $data['guestName'], 
            $data['guestId'],
            $data['total'], 
            $data['totalBs'], 
            $data['method'], 
            'Checkout Realizado',
            $data['igtf'] ?? 0.00,
            $data['inatur'] ?? 0.00
        ]);
        
        // Resetear habitación
        $pdo->prepare("UPDATE rooms SET status = 'cleaning', check_in = NULL, check_out = NULL, notes = '' WHERE id = ?")->execute([$data['room_id']]);
        $pdo->prepare("DELETE FROM current_guests WHERE room_id = ?")->execute([$data['room_id']]);
        $pdo->prepare("DELETE FROM extra_charges WHERE room_id = ?")->execute([$data['room_id']]);
        
        $pdo->commit();
        echo json_encode(['success' => true]);
        break;

    case 'get_history':
        $roomId = $_GET['room_id'] ?? 0;
        $stmt = $pdo->prepare("SELECT * FROM payment_history WHERE room_id = ? ORDER BY timestamp DESC");
        $stmt->execute([$roomId]);
        echo json_encode($stmt->fetchAll());
        break;

    case 'get_reports':
        // Lógica simplificada de reportes
        $reports = [
            'today' => $pdo->query("SELECT SUM(total_usd) FROM payment_history WHERE DATE(timestamp) = CURDATE()")->fetchColumn() ?: 0,
            'week' => $pdo->query("SELECT SUM(total_usd) FROM payment_history WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn() ?: 0,
            'month' => $pdo->query("SELECT SUM(total_usd) FROM payment_history WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn() ?: 0,
            'transactions' => $pdo->query("SELECT * FROM payment_history ORDER BY timestamp DESC LIMIT 20")->fetchAll()
        ];
        echo json_encode($reports);
        break;

    case 'log_action':
        $data = $inputData;
        $stmt = $pdo->prepare("INSERT INTO audit_logs (user_name, action, details) VALUES (?, ?, ?)");
        $stmt->execute([$data['user'], $data['action'], $data['details']]);
        echo json_encode(['success' => true]);
        break;

    case 'get_restaurant':
        $stmt = $pdo->query("SELECT * FROM restaurant_tables");
        $tables = $stmt->fetchAll();
        foreach ($tables as &$table) {
            $stmt = $pdo->prepare("SELECT * FROM restaurant_orders WHERE table_id = ? AND status = 'open'");
            $stmt->execute([$table['id']]);
            $table['active_order'] = $stmt->fetch();
            if ($table['active_order']) {
                $stmt = $pdo->prepare("SELECT oi.*, mi.name FROM order_items oi JOIN menu_items mi ON oi.item_id = mi.id WHERE oi.order_id = ?");
                $stmt->execute([$table['active_order']['id']]);
                $table['active_order']['items'] = $stmt->fetchAll();
            }
        }
        echo json_encode($tables);
        break;

    case 'get_menu':
        echo json_encode($pdo->query("SELECT * FROM menu_items")->fetchAll());
        break;

    case 'save_order':
        $data = $inputData;
        $pdo->beginTransaction();
        if (isset($data['id'])) {
            $orderId = $data['id'];
        } else {
            $stmt = $pdo->prepare("INSERT INTO restaurant_orders (table_id, room_id, total_usd) VALUES (?, ?, ?)");
            $stmt->execute([$data['table_id'], $data['room_id'], $data['total']]);
            $orderId = $pdo->lastInsertId();
            $pdo->prepare("UPDATE restaurant_tables SET status = 'occupied' WHERE id = ?")->execute([$data['table_id']]);
        }
        
        $pdo->prepare("DELETE FROM order_items WHERE order_id = ?")->execute([$orderId]);
        foreach ($data['items'] as $item) {
            $stmt = $pdo->prepare("INSERT INTO order_items (order_id, item_id, quantity, subtotal_usd) VALUES (?, ?, ?, ?)");
            $stmt->execute([$orderId, $item['id'], $item['quantity'], $item['subtotal']]);
        }
        $pdo->commit();
        echo json_encode(['success' => true, 'id' => $orderId]);
        break;

    case 'get_events':
        echo json_encode($pdo->query("SELECT * FROM event_bookings ORDER BY start_time ASC")->fetchAll());
        break;

    case 'save_event':
        $data = $inputData;
        $stmt = $pdo->prepare("INSERT INTO event_bookings (title, organizer, start_time, end_time, attendees, total_usd) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$data['title'], $data['organizer'], $data['start'], $data['end'], $data['attendees'], $data['total']]);
        echo json_encode(['success' => true]);
        break;

    case 'get_inventory':
        echo json_encode($pdo->query("SELECT * FROM inventory ORDER BY category, item_name")->fetchAll());
        break;

    case 'export_seniat':
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="libro_ventas_seniat_'.date('Y-m').'.csv"');
        $output = fopen('php://output', 'w');
        fputcsv($output, ['Fecha', 'RIF/Cedula', 'Nombre', 'Tipo Doc', 'Monto Exento', 'Base Imponible', 'IVA (16%)', 'Total', 'IGTF (3%)', 'INATUR (1%)']);
        
        $stmt = $pdo->query("SELECT * FROM payment_history WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        while ($row = $stmt->fetch()) {
            fputcsv($output, [
                $row['timestamp'],
                $row['id_card'] ?? 'N/A',
                $row['guest_name'],
                'DOCUMENTO NO FISCAL',
                0,
                $row['total_usd'],
                $row['total_usd'] * 0.16,
                $row['total_usd'] * 1.16,
                $row['igtf_amount'],
                $row['inatur_amount']
            ]);
        }
        fclose($output);
        exit;

    default:
        echo json_encode(['error' => 'Acción no válida', 'received' => $action, 'method' => $_SERVER['REQUEST_METHOD']]);
        break;
}
