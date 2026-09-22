<?php
require 'backend/db.php';
try {
    $pdo->exec("ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS id_card VARCHAR(100) DEFAULT NULL;");
    echo "DB Update Complete\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
