<?php
/**
 * mulai_kuis_bab.php
 * -----------------------------------------------------
 * Tandai peserta BENAR-BENAR memulai/melanjutkan pengerjaan Kuis per
 * Bab -- HANYA dipanggil dari mulaiKerjakanSoalKuis() di js/quiz.js,
 * persis saat soal-soal ditampilkan & timer (kalau ada) dinyalakan.
 * BUKAN dipanggil setiap kali halaman kuis dibuka -- itu tugas
 * api/get_soal.php, yang cuma "melihat" data (termasuk layar riwayat
 * percobaan) tanpa efek samping apapun. Lihat catatan lengkap di
 * get_soal.php kenapa pemisahan ini perlu (supaya Monitor Peserta tidak
 * salah menganggap peserta yang cuma mengintip riwayat gagalnya sebagai
 * "sedang mengerjakan").
 *
 * Kalau bab ini tidak punya batas waktu (durasi_kuis_menit NULL), tidak
 * ada apapun yang dicatat -- cukup balas durasi_menit: null.
 * Kalau dipanggil lagi SEBELUM submit (mis. peserta refresh halaman di
 * tengah pengerjaan), waktu mulai yang SAMA dikembalikan lagi (bukan
 * direset), lewat cn_mulai_atau_ambil_waktu_kuis().
 *
 * Cara panggil: GET api/mulai_kuis_bab.php?bab_id=1&user_id=5
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

$bab_id = isset($_GET['bab_id']) ? (int) $_GET['bab_id'] : 0;
$user_id = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;

if ($bab_id <= 0 || $user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "bab_id dan user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT durasi_kuis_menit FROM bab WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $bab_id);
$stmt->execute();
$bab = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$bab) {
    echo json_encode(["status" => "error", "message" => "Bab tidak ditemukan"]);
    $conn->close();
    exit;
}

$durasi_menit = $bab['durasi_kuis_menit'] !== null ? (int) $bab['durasi_kuis_menit'] : null;
$waktu_mulai = null;
if ($durasi_menit !== null) {
    $mulai_pada = cn_mulai_atau_ambil_waktu_kuis($conn, $user_id, $bab_id);
    $waktu_mulai = str_replace(' ', 'T', $mulai_pada) . '+07:00';
}

echo json_encode([
    "status" => "success",
    "data" => [
        "durasi_menit" => $durasi_menit,
        "waktu_mulai" => $waktu_mulai
    ]
]);

$conn->close();
?>
