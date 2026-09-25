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

$name = trim($data['name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$password = $data['password'] ?? '';

// --- Validasi ---
if (empty($name) || empty($email) || empty($password)) {
    echo json_encode(["status" => "error", "message" => "Semua kolom wajib diisi"]);
    exit;
}
$error_nama = cn_validasi_nama($name);
if ($error_nama !== null) {
    echo json_encode(["status" => "error", "message" => $error_nama]);
    exit;
}
if (!cn_validasi_format_email($email)) {
    echo json_encode(["status" => "error", "message" => "Format email tidak valid"]);
    exit;
}
$error_password = cn_validasi_kata_sandi($password);
if ($error_password !== null) {
    echo json_encode(["status" => "error", "message" => $error_password]);
    exit;
}

// --- Cek Email Duplikat ---
$stmt = $conn->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    echo json_encode(["status" => "error", "message" => "Email ini sudah terdaftar. Silakan masuk."]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

// --- Simpan User Baru (role selalu 'peserta') ---
$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $conn->prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'peserta')");
$stmt->bind_param("sss", $name, $email, $hash);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "message" => "Pendaftaran berhasil. Silakan masuk.",
        "data" => ["id" => $stmt->insert_id, "name" => $name, "email" => $email, "role" => "peserta"]
    ]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal mendaftar: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>