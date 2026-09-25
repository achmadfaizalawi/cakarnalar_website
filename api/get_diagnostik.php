<?php
/**
 * get_diagnostik.php
 * -----------------------------------------------------
 * Ambil soal Tes Diagnostik (TANPA info jawaban benar) untuk peserta.
 * Tes ini hanya bisa dikerjakan SEKALI per peserta. Jika sudah
 * pernah selesai, endpoint ini tidak lagi mengirim daftar soal
 * (mencegah jawaban "diintip" ulang lewat API), hanya info skor.
 *
 * Pilihan jawaban dinamis (tabel diagnostik_soal_pilihan, lihat FASE 9
 * di schema.sql) -- sama pola dengan Kuis per Bab (quiz_soal_pilihan),
 * dikirim sebagai array "pilihan": [{id, teks}], TANPA flag is_benar.
 *
 * Cara panggil: GET api/get_diagnostik.php?user_id=5
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

$stmt = $conn->prepare("SELECT skor, detail_json FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();

if ($row = $res->fetch_assoc()) {
    $stmt->close();
    $pembahasan = !empty($row['detail_json']) ? json_decode($row['detail_json'], true) : [];
    $skor_int = (int) $row['skor'];
    echo json_encode([
        "status" => "success",
        "data" => [
            "sudah_selesai" => true,
            "skor" => $skor_int,
            "soal" => [],
            "pembahasan" => $pembahasan,
            "klasifikasi" => cn_klasifikasi_paul_elder($skor_int)
        ]
    ]);
    $conn->close();
    exit;
}
$stmt->close();

$result = $conn->query("SELECT id, pertanyaan, urutan FROM diagnostik_soal ORDER BY urutan ASC, id ASC");

$soal_list = [];
$id_urutan = [];
while ($row = $result->fetch_assoc()) {
    $sid = (int) $row['id'];
    $id_urutan[] = $sid;
    $soal_list[$sid] = [
        "id" => $sid,
        "pertanyaan" => $row['pertanyaan'],
        "pilihan" => [],
        "urutan" => (int) $row['urutan']
    ];
}

// Pilihan jawaban dinamis, TANPA is_benar (supaya tidak bocor ke peserta)
if (count($id_urutan) > 0) {
    $ids = implode(',', array_map('intval', $id_urutan));
    $pilihanResult = $conn->query("SELECT id, soal_id, teks, urutan FROM diagnostik_soal_pilihan WHERE soal_id IN ($ids) ORDER BY urutan ASC, id ASC");
    while ($p = $pilihanResult->fetch_assoc()) {
        $soal_list[(int) $p['soal_id']]['pilihan'][] = [
            "id" => (int) $p['id'],
            "teks" => $p['teks']
        ];
    }
}
$soal_list = array_values($soal_list);

// --- Batas waktu (opsional, diatur admin). Waktu mulai dicatat di
//     server supaya timer tidak reset kalau peserta refresh halaman. ---
// Baris diagnostik_waktu SEKARANG SELALU dicatat begitu soal ditampilkan
// (bukan cuma kalau ada durasi_menit) -- baris ini dipakai get_bab.php
// sebagai penanda PERMANEN "peserta sudah mulai mengerjakan" (field
// sedang_dikerjakan, lihat get_bab.php), supaya tombol "Lanjutkan Tes"
// di dashboard tetap akurat walau localStorage peserta hilang/browser
// beda -- dan supaya penanda ini ikut terhapus begitu admin me-reset
// Tes Diagnostik peserta ini (lihat cn_hapus_diagnostik() di
// api/admin/reset_peserta_progres.php), sehingga dashboard tahu kapan
// attempt lama sudah tidak berlaku lagi. $waktu_mulai sendiri TETAP
// cuma dikirim ke peserta kalau memang ada durasi_menit (js/quiz.js
// cuma mengaktifkan timer kalau durasi_menit DAN waktu_mulai sama-sama
// terisi, lihat quizPendingTimerInfo).
$durasi_menit = cn_get_durasi_tes($conn, 'diagnostik');
$petunjuk_pengerjaan = cn_get_petunjuk_tes($conn, 'diagnostik');
$waktu_mulai = null;
if (count($soal_list) > 0) {
    $mulai_pada = cn_mulai_atau_ambil_waktu($conn, 'diagnostik_waktu', $user_id);
    if ($durasi_menit !== null) {
        $waktu_mulai = str_replace(' ', 'T', $mulai_pada) . '+07:00';
    }
}

echo json_encode([
    "status" => "success",
    "data" => [
        "sudah_selesai" => false,
        "skor" => null,
        "soal" => $soal_list,
        "jumlah_soal" => count($soal_list),
        "durasi_menit" => $durasi_menit,
        "petunjuk" => $petunjuk_pengerjaan,
        "waktu_mulai" => $waktu_mulai
    ]
]);

$conn->close();
?>