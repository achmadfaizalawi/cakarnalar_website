<?php
/**
 * admin/get_bab_admin.php
 * -----------------------------------------------------
 * Daftar semua bab lengkap dengan konten materi, video (link ATAU file
 * upload), dan daftar file materi (bisa lebih dari satu per bab, lihat
 * tabel bab_file_materi) — dipakai halaman admin untuk memilih bab yang
 * mau diedit. (Beda dengan api/get_bab.php yang dipakai peserta & butuh
 * user_id untuk menghitung status lulus/terkunci.)
 *
 * Cara panggil: GET api/admin/get_bab_admin.php
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

$sql = "SELECT id, nomor, judul, ringkasan, konten_materi, video_url, video_file, video_file_nama_asli, ada_kuis, nilai_minimal, petunjuk_kuis, durasi_kuis_menit
        FROM bab ORDER BY nomor ASC";
$result = $conn->query($sql);

$bab_list = [];
$bab_by_id = [];
while ($row = $result->fetch_assoc()) {
    $bab_item = [
        "id" => (int) $row['id'],
        "nomor" => (int) $row['nomor'],
        "judul" => $row['judul'],
        "ringkasan" => $row['ringkasan'],
        "konten_materi" => $row['konten_materi'],
        "video_url" => $row['video_url'],
        "video_file" => $row['video_file'],
        "video_file_nama_asli" => $row['video_file_nama_asli'],
        "ada_kuis" => (bool) $row['ada_kuis'],
        "nilai_minimal" => $row['nilai_minimal'] !== null ? (int) $row['nilai_minimal'] : null,
        "petunjuk_kuis" => $row['petunjuk_kuis'],
        "durasi_kuis_menit" => $row['durasi_kuis_menit'] !== null ? (int) $row['durasi_kuis_menit'] : null,
        "file_materi" => []
    ];
    $bab_list[] = $bab_item;
    $bab_by_id[$bab_item['id']] = count($bab_list) - 1;
}

// Lampirkan daftar file materi (bisa lebih dari 1) tiap bab dalam satu
// query tambahan, lalu dikelompokkan per bab_id di PHP -- lebih murah
// daripada query terpisah per bab.
if (count($bab_list) > 0) {
    $file_result = $conn->query("SELECT id, bab_id, nama_file, nama_asli FROM bab_file_materi ORDER BY urutan ASC, id ASC");
    while ($file_row = $file_result->fetch_assoc()) {
        $bab_id = (int) $file_row['bab_id'];
        if (isset($bab_by_id[$bab_id])) {
            $bab_list[$bab_by_id[$bab_id]]['file_materi'][] = [
                "id" => (int) $file_row['id'],
                "nama_file" => $file_row['nama_file'],
                "nama_asli" => $file_row['nama_asli'],
                "url" => "uploads/ppt/" . $file_row['nama_file']
            ];
        }
    }
}

echo json_encode(["status" => "success", "data" => $bab_list]);

$conn->close();
?>