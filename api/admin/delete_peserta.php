<?php
/**
 * admin/delete_peserta.php
 * -----------------------------------------------------
 * Endpoint untuk fitur "Manajemen User" di Panel Admin: menghapus akun
 * PESERTA secara permanen -- TIDAK BISA DIURUNGKAN, makanya konfirmasi
 * wajib dilakukan di sisi Panel Admin sebelum memanggil endpoint ini.
 *
 * Cukup DELETE baris di tabel "users": seluruh data terkait (hasil
 * diagnostik/tryout, waktu pengerjaan, riwayat kuis, progres bab, dst)
 * otomatis ikut terhapus lewat FOREIGN KEY ... ON DELETE CASCADE yang
 * sudah dipasang pada tabel-tabel tsb (beda dengan reset_peserta_progres.php
 * yang menghapus manual karena itu reset SEBAGIAN, bukan hapus akun).
 *
 * Body JSON:
 * { "user_id": 5 }
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

if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

// --- Pastikan Akun Ini Ada & Perannya "peserta" -- sengaja dijaga supaya
//     endpoint ini TIDAK BISA dipakai untuk menghapus akun admin. ---
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

$stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
$stmt->bind_param("i", $user_id);

if ($stmt->execute()) {
    echo json_encode(["status" => "success", "message" => "Akun peserta berhasil dihapus."]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal menghapus: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
