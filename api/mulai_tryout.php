<?php
/**
 * mulai_tryout.php
 * -----------------------------------------------------
 * Tandai peserta BENAR-BENAR memulai/melanjutkan pengerjaan Final
 * Tryout -- HANYA dipanggil dari mulaiKerjakanSoalKuis() di
 * js/quiz.js, persis saat soal-soal ditampilkan & timer (kalau ada)
 * dinyalakan. BUKAN dipanggil setiap kali halaman tryout.html dibuka
 * -- itu tugas api/get_tryout.php, yang cuma "melihat" data (termasuk
 * layar riwayat percobaan sebelum "Coba Lagi") tanpa efek samping
 * apapun. Sama pola dengan api/mulai_kuis_bab.php untuk Kuis per Bab.
 *
 * Kalau Final Tryout tidak punya batas waktu (durasi_menit NULL),
 * tidak ada apapun yang dicatat -- cukup balas durasi_menit: null.
 * Kalau dipanggil lagi SEBELUM submit (mis. peserta refresh halaman
 * di tengah pengerjaan), waktu mulai yang SAMA dikembalikan lagi
 * (bukan direset), lewat cn_mulai_atau_ambil_waktu().
 *
 * Cara panggil: GET api/mulai_tryout.php?user_id=5
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

if (!cn_tryout_unlocked($conn, $user_id)) {
    echo json_encode(["status" => "error", "message" => "Final Tryout baru terbuka setelah semua bab lulus"]);
    $conn->close();
    exit;
}

$durasi_menit = cn_get_durasi_tes($conn, 'tryout');
$waktu_mulai = null;
if ($durasi_menit !== null) {
    $mulai_pada = cn_mulai_atau_ambil_waktu($conn, 'tryout_waktu', $user_id);
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
