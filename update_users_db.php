<?php
require 'backend/db.php';
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE,
            password_hash VARCHAR(255),
            name VARCHAR(255),
            role VARCHAR(50)
        )
    ");
    
    // Check if empty
    $stmt = $pdo->query("SELECT COUNT(*) FROM users");
    if ($stmt->fetchColumn() == 0) {
        $admin_hash = password_hash('123', PASSWORD_BCRYPT);
        $rec_hash = password_hash('456', PASSWORD_BCRYPT);
        
        $insert = $pdo->prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)");
        $insert->execute(['admin', $admin_hash, 'Administrador Principal', 'admin']);
        $insert->execute(['recepcion', $rec_hash, 'Recepcionista Turno A', 'recepcion']);
        echo "Users inserted.\n";
    }
    echo "DB Update Complete.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
