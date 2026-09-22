<?php
require 'backend/db.php';
$stmt = $pdo->query('SELECT * FROM users');
$users = $stmt->fetchAll();
print_r($users);
$user = $users[0];
var_dump(password_verify('123', $user['password_hash']));
