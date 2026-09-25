<?php
/**
 * get_tryout.php
 * -----------------------------------------------------
 * Ambil soal Final Tryout (TANPA info jawaban benar) untuk peserta.
 * Hanya terbuka jika SEMUA bab sudah lulus.
 *
 * Final Tryout BOLEH diulang selama skornya belum mencapai
 * TRYOUT_PASSING_SCORE (51) -- persis pola Kuis per Bab
 * (quiz_soal/hasil_kuis, lihat get_soal.php): "sudah_selesai" di sini
 * berarti "skor SUDAH mencapai 51" (final, tidak bisa diulang lagi),
 * BUKAN "sudah pernah mengerjakan". Selama belum mencapai 51, soal
 * tetap dikirim supaya peserta bisa mencoba lagi, dan endpoint ini
 * HANYA "melihat" data (termasuk buat layar riwayat percobaan) TANPA
 * efek samping mencatat waktu mulai -- pencatatan waktu mulai yang
 * SEBENARNYA ada di endpoint terpisah, api/mulai_tryout.php, persis
 * saat peserta benar-benar klik mulai/coba lagi (lihat
 * mulaiKerjakanSoalKuis() di js/quiz.js).
 *
 * Pilihan jawaban dinamis (tabel tryout_soal_pilihan, lihat FASE 9 di
 * schema.sql) -- sama pola dengan Kuis per Bab (quiz_soal_pilihan),
 * dikirim sebagai array "pilihan": [{id, teks}], TANPA flag is_benar.
 *
 * Cara panggil: GET api/get_tryout.php?user_id=5
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

// --- Riwayat SEMUA percobaan (dipakai baik untuk layar "sudah final" di
//     bawah, maupun layar sebelum "Coba Lagi" untuk yang belum mencapai
//     51 -- lihat tampilkanHasilTryout di js/quiz.js). Diurutkan
//     TERBARU dulu. ---
$riwayat = [];
$rw_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, detail_json, created_at FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC");
$rw_stmt->bind_param("i", $user_id);
$rw_stmt->execute();
$rw_res = $rw_stmt->get_result();
$percobaan_terakhir = null;
while ($rw_row = $rw_res->fetch_assoc()) {
    if ($percobaan_terakhir === null) {
        $percobaan_terakhir = $rw_row; // baris pertama (ORDER BY id DESC) = percobaan paling baru
    }
    $riwayat[] = [
        "jumlah_benar" => (int) $rw_row['jumlah_benar'],
        "jumlah_soal" => (int) $rw_row['jumlah_soal'],
        "skor" => (int) $rw_row['skor'],
        "tanggal" => str_replace(' ', 'T', $rw_row['created_at'])
    ];
}
$rw_stmt->close();

$skor_terakhir = $percobaan_terakhir ? (int) $percobaan_terakhir['skor'] : null;
$sudah_final = $skor_terakhir !== null && $skor_terakhir >= TRYOUT_PASSING_SCORE;

if ($sudah_final) {
    // Pembahasan Jawaban SENGAJA TIDAK dikirim ke peserta sama sekali,
    // baik sudah final maupun belum -- sama seperti Tes Diagnostik
    // (showPembahasan:false). Kolom tryout_hasil.detail_json tetap
    // tersimpan permanen di database untuk keperluan admin (lihat
    // api/admin/get_peserta_detail.php / monitorShowTryoutDialog di
    // js/admin.js), cuma tidak diikutsertakan di respons endpoint ini.
    echo json_encode([
        "status" => "success",
        "data" => [
            "sudah_selesai" => true,
            "lulus" => true,
            "skor" => $skor_terakhir,
            "jumlah_benar" => (int) $percobaan_terakhir['jumlah_benar'],
            "jumlah_soal" => (int) $percobaan_terakhir['jumlah_soal'],
            "passing_score" => TRYOUT_PASSING_SCORE,
            "klasifikasi" => cn_klasifikasi_tryout($skor_terakhir),
            "pembahasan" => [],
            "riwayat" => $riwayat,
            "jumlah_percobaan" => count($riwayat),
            "soal" => []
        ]
    ]);
    $conn->close();
    exit;
}

$result = $conn->query("SELECT id, pertanyaan, urutan FROM tryout_soal ORDER BY urutan ASC, id ASC");

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

if (count($soal_list) === 0) {
    echo json_encode(["status" => "error", "message" => "Soal Final Tryout belum tersedia. Coba lagi nanti."]);
    $conn->close();
    exit;
}

// Pilihan jawaban dinamis, TANPA is_benar (supaya tidak bocor ke peserta)
$ids = implode(',', array_map('intval', $id_urutan));
$pilihanResult = $conn->query("SELECT id, soal_id, teks, urutan FROM tryout_soal_pilihan WHERE soal_id IN ($ids) ORDER BY urutan ASC, id ASC");
while ($p = $pilihanResult->fetch_assoc()) {
    $soal_list[(int) $p['soal_id']]['pilihan'][] = [
        "id" => (int) $p['id'],
        "teks" => $p['teks']
    ];
}
$soal_list = array_values($soal_list);

// --- Batas waktu (opsional, diatur admin). PENTING: endpoint ini HANYA
//     "melihat" data, TIDAK mencatat waktu mulai -- lihat catatan di
//     atas & api/mulai_tryout.php. ---
$durasi_menit = cn_get_durasi_tes($conn, 'tryout');
$petunjuk_pengerjaan = cn_get_petunjuk_tes($conn, 'tryout');

// Klasifikasi percobaan TERAKHIR (kalau ada) -- supaya layar riwayat
// sebelum "Coba Lagi" juga bisa menampilkan rubrik & kategori skor
// peserta saat ini, bukan cuma layar "sudah final" di atas.
$klasifikasi = $skor_terakhir !== null ? cn_klasifikasi_tryout($skor_terakhir) : null;

echo json_encode([
    "status" => "success",
    "data" => [
        "sudah_selesai" => false,
        "lulus" => false,
        "skor" => $skor_terakhir,
        "soal" => $soal_list,
        "jumlah_soal" => count($soal_list),
        "passing_score" => TRYOUT_PASSING_SCORE,
        "klasifikasi" => $klasifikasi,
        "petunjuk" => $petunjuk_pengerjaan,
        "durasi_menit" => $durasi_menit,
        "riwayat" => $riwayat,
        "jumlah_percobaan" => count($riwayat)
    ]
]);

$conn->close();
?>