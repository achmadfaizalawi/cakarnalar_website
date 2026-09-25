<?php
/**
 * admin/update_peserta.php
 * -----------------------------------------------------
 * Endpoint untuk fitur "Manajemen User" di Panel Admin: mengubah nama,
 * email, dan (opsional) kata sandi akun PESERTA (bukan akun admin --
 * dijaga lewat pengecekan role di bawah), mis. kalau ada peserta yang
 * minta diperbaiki datanya.
 *
 * Beda dengan update_profile.php (self-service, dipakai peserta ganti
 * profil sendiri): di sini TIDAK perlu "current_password" karena yang
 * mengubah adalah admin, bukan pemilik akunnya sendiri -- admin boleh
 * langsung mengatur kata sandi baru tanpa tahu kata sandi lama.
 *
 * Body JSON:
 * { "user_id": 5, "name": "...", "email": "...", "password": "" }
 * - "password" boleh dikosongkan kalau tidak ingin diubah.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$user_id = isset($data['user_id']) ? (int) $data['user_id'] : 0;
$name = trim($data['name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$password_baru = $data['password'] ?? '';

if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

// --- Pastikan Akun Ini Ada & Perannya "peserta" (bukan admin) ---
$stmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$ada = $stmt->get_result()->num_rows > 0;
$stmt->close();
if (!$ada) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

// --- Validasi Nama & Email ---
$error_nama = cn_validasi_nama($name);
if ($error_nama !== null) {
    echo json_encode(["status" => "error", "message" => $error_nama]);
    $conn->close();
    exit;
}
if (empty($email) || !cn_validasi_format_email($email)) {
    echo json_encode(["status" => "error", "message" => "Format email tidak valid"]);
    $conn->close();
    exit;
}

// --- Cek Email Duplikat (punya akun lain) ---
$stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1");
$stmt->bind_param("si", $email, $user_id);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    echo json_encode(["status" => "error", "message" => "Email ini sudah dipakai akun lain"]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

// --- Kalau Admin Mau Mengatur Kata Sandi Baru ---
$ganti_password = $password_baru !== '';
$hash_baru = null;

if ($ganti_password) {
    $error_password = cn_validasi_kata_sandi($password_baru);
    if ($error_password !== null) {
        echo json_encode(["status" => "error", "message" => $error_password]);
        $conn->close();
        exit;
    }
    $hash_baru = password_hash($password_baru, PASSWORD_DEFAULT);
}

// --- Simpan Perubahan ---
if ($ganti_password) {
    $stmt = $conn->prepare("UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?");
    $stmt->bind_param("sssi", $name, $email, $hash_baru, $user_id);
} else {
    $stmt = $conn->prepare("UPDATE users SET name = ?, email = ? WHERE id = ?");
    $stmt->bind_param("ssi", $name, $email, $user_id);
}

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "message" => "Akun peserta berhasil diperbarui",
        "data" => ["id" => $user_id, "name" => $name, "email" => $email]
    ]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
