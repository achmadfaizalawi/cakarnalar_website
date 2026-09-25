<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

// --- Terima Data JSON ---
$json_input = file_get_contents('php://input');
$data = json_decode($json_input, true);

$email = strtolower(trim($data['email'] ?? ''));
$password = $data['password'] ?? '';

if (empty($email) || empty($password)) {
    echo json_encode(["status" => "error", "message" => "Email dan kata sandi wajib diisi"]);
    exit;
}

// --- Cari User ---
$stmt = $conn->prepare("SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Email atau kata sandi salah"]);
    $stmt->close();
    $conn->close();
    exit;
}

$user = $result->fetch_assoc();
$stmt->close();

// --- Verifikasi Password (bcrypt) ---
if (!password_verify($password, $user['password'])) {
    echo json_encode(["status" => "error", "message" => "Email atau kata sandi salah"]);
    $conn->close();
    exit;
}

echo json_encode([
    "status" => "success",
    "message" => "Login berhasil",
    "data" => [
        "id" => (int) $user['id'],
        "name" => $user['name'],
        "email" => $user['email'],
        "role" => $user['role']
    ]
]);

$conn->close();
?>