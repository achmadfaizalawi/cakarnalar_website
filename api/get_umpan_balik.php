<?php
/**
 * get_umpan_balik.php
 * -----------------------------------------------------
 * Dipanggil oleh umpan_balik.html begitu dimuat, buat menentukan layar
 * mana yang ditampilkan ke peserta:
 *  - belum berhak sama sekali (belum selesai semua rangkaian program)
 *    -> eligible:false, tampilkan pesan "belum bisa diakses"
 *  - berhak TAPI belum pernah isi -> eligible:true, sudah_isi:false,
 *    tampilkan form-nya
 *  - berhak DAN sudah pernah isi -> eligible:true, sudah_isi:true,
 *    tampilkan layar "sudah pernah mengisi" + tombol lanjut ke
 *    sertifikat.html (TIDAK disuruh isi ulang, lihat submit_umpan_balik.php)
 *
 * Cara panggil: GET api/get_umpan_balik.php?user_id=5
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

$user_id = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$user_ada = $stmt->get_result()->num_rows > 0;
$stmt->close();

if (!$user_ada) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

$eligible = cn_sudah_selesai_semua_rangkaian($conn, $user_id);

$stmt = $conn->prepare("SELECT COUNT(*) AS c FROM umpan_balik WHERE user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$sudah_isi = ((int) $stmt->get_result()->fetch_assoc()['c']) > 0;
$stmt->close();

echo json_encode([
    "status" => "success",
    "data" => [
        "eligible" => $eligible,
        "sudah_isi" => $sudah_isi
    ]
]);

$conn->close();
?>
