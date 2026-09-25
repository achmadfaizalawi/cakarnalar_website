<?php
/**
 * admin/get_umpan_balik_all.php
 * -----------------------------------------------------
 * Rincian LENGKAP *SEMUA* respons Form Umpan Balik (semua peserta
 * sekaligus, bukan cuma satu seperti get_umpan_balik_detail.php) --
 * DIPAKAI KHUSUS untuk "Unduh Laporan Keseluruhan" (matriks semua
 * peserta x semua pertanyaan, 1 baris per peserta) di
 * exportUmpanBalikKeseluruhanXlsx() di js/admin.js. Tabel daftar biasa
 * (get_umpan_balik_list.php) SENGAJA tidak dipakai untuk ini -- endpoint
 * itu cuma mengembalikan ringkasan (nama/email/NPS), tidak semua 27
 * kolom isian yang dibutuhkan laporan ini.
 *
 * Sama seperti get_umpan_balik_detail.php: kolom yang disimpan sebagai
 * JSON (platform_medsos, tindakan_nyata, format_media, fitur_baru)
 * di-decode dulu jadi array PHP biasa.
 *
 * Cara panggil: GET api/admin/get_umpan_balik_all.php
 * (tidak butuh parameter -- selalu semua respons)
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

$sql = "SELECT ub.*, u.name AS nama, u.email
        FROM umpan_balik ub
        JOIN users u ON u.id = ub.user_id
        ORDER BY u.name ASC";
$res = $conn->query($sql);

$list = [];
while ($row = $res->fetch_assoc()) {
    foreach (["platform_medsos", "tindakan_nyata", "format_media", "fitur_baru"] as $kolom) {
        $decoded = json_decode($row[$kolom], true);
        $row[$kolom] = is_array($decoded) ? $decoded : [];
    }
    foreach ([
        "user_id", "bab1_skor", "bab2_skor", "bab3_skor", "bab4_skor", "bab5_skor",
        "maskot_skor", "desain_skor", "studi_kasus_skor", "lembar_kerja_skor",
        "kepercayaan_verifikasi", "nps"
    ] as $kolom) {
        $row[$kolom] = (int) $row[$kolom];
    }
    $list[] = $row;
}

echo json_encode([
    "status" => "success",
    "data" => $list
]);

$conn->close();
?>
