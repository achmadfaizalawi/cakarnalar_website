<?php
/**
 * update_profile.php
 * -----------------------------------------------------
 * Endpoint untuk fitur "Edit Profil" di dashboard peserta: mengubah
 * nama, email, dan (opsional) kata sandi akun yang sedang login.
 *
 * Kata sandi baru hanya diproses kalau field "password" diisi, dan
 * WAJIB disertai "current_password" yang cocok dengan kata sandi lama
 * (dicek pakai password_verify), supaya orang lain yang kebetulan
 * memegang sesi/localStorage peserta tidak bisa asal ganti sandi.
 */
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

$user_id = (int) ($data['user_id'] ?? 0);
$name = trim($data['name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$password_baru = $data['password'] ?? '';
$password_saat_ini = $data['current_password'] ?? '';

if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "Sesi tidak valid, silakan masuk kembali"]);
    exit;
}

// --- Validasi Nama & Email ---
$error_nama = cn_validasi_nama($name);
if ($error_nama !== null) {
    echo json_encode(["status" => "error", "message" => $error_nama]);
    exit;
}
if (empty($email) || !cn_validasi_format_email($email)) {
    echo json_encode(["status" => "error", "message" => "Format email tidak valid"]);
    exit;
}

// --- Ambil Data User Saat Ini ---
$stmt = $conn->prepare("SELECT id, password FROM users WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    echo json_encode(["status" => "error", "message" => "Akun tidak ditemukan"]);
    exit;
}

// --- Cek Email Duplikat (punya user lain) ---
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

// --- Kalau Mau Ganti Kata Sandi ---
$ganti_password = $password_baru !== '';
$hash_baru = null;

if ($ganti_password) {
    if (empty($password_saat_ini)) {
        echo json_encode(["status" => "error", "message" => "Masukkan kata sandi saat ini untuk mengganti kata sandi"]);
        exit;
    }
    if (!password_verify($password_saat_ini, $user['password'])) {
        echo json_encode(["status" => "error", "message" => "Kata sandi saat ini salah"]);
        exit;
    }
    $error_password = cn_validasi_kata_sandi($password_baru);
    if ($error_password !== null) {
        echo json_encode(["status" => "error", "message" => $error_password]);
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
        "message" => "Profil berhasil diperbarui",
        "data" => ["id" => $user_id, "name" => $name, "email" => $email]
    ]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>