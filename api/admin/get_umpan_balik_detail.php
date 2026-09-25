<?php
/**
 * admin/get_umpan_balik_detail.php
 * -----------------------------------------------------
 * Rincian LENGKAP satu respons Form Umpan Balik, buat modal detail di
 * halaman admin (menu "Umpan Balik") -- semua 27 kolom isian
 * (lihat struktur tabel umpan_balik & api/submit_umpan_balik.php),
 * dengan kolom yang disimpan sebagai JSON (platform_medsos, tindakan_nyata,
 * format_media, fitur_baru) di-decode dulu jadi array PHP biasa sebelum
 * di-echo balik sebagai JSON -- supaya frontend tidak perlu JSON.parse()
 * dua kali (nilainya sendiri sudah string JSON di dalam string JSON).
 *
 * Cara panggil: GET api/admin/get_umpan_balik_detail.php?id=3
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id <= 0) {
    echo json_encode(["status" => "error", "message" => "id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare(
    "SELECT ub.*, u.name AS nama, u.email
     FROM umpan_balik ub
     JOIN users u ON u.id = ub.user_id
     WHERE ub.id = ?
     LIMIT 1"
);
$stmt->bind_param("i", $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    echo json_encode(["status" => "error", "message" => "Respons tidak ditemukan"]);
    $conn->close();
    exit;
}

// Kolom JSON (TEXT berisi array yang di-json_encode() waktu submit --
// lihat submit_umpan_balik.php) -- decode dulu di sini, bukan diserahkan
// mentah-mentah ke frontend sebagai string.
foreach (["platform_medsos", "tindakan_nyata", "format_media", "fitur_baru"] as $kolom) {
    $decoded = json_decode($row[$kolom], true);
    $row[$kolom] = is_array($decoded) ? $decoded : [];
}

// Kolom angka -- pastikan jadi int (bukan string) di JSON keluarannya.
foreach ([
    "user_id", "bab1_skor", "bab2_skor", "bab3_skor", "bab4_skor", "bab5_skor",
    "maskot_skor", "desain_skor", "studi_kasus_skor", "lembar_kerja_skor",
    "kepercayaan_verifikasi", "nps"
] as $kolom) {
    $row[$kolom] = (int) $row[$kolom];
}

echo json_encode([
    "status" => "success",
    "data" => $row
]);

$conn->close();
?>
