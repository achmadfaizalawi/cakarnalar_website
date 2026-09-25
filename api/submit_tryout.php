<?php
/**
 * submit_tryout.php
 * -----------------------------------------------------
 * Terima & nilai jawaban Final Tryout. Hanya terbuka jika semua bab
 * sudah lulus.
 *
 * Final Tryout BOLEH diulang selama skornya belum mencapai
 * TRYOUT_PASSING_SCORE (51) -- setiap percobaan (lulus ataupun tidak)
 * tercatat sebagai baris baru di tryout_hasil (persis pola Kuis per
 * Bab/hasil_kuis, lihat submit_kuis.php), BUKAN lagi "sekali kerja
 * selamanya". Begitu skor >= 51 di SATU percobaan, Final Tryout
 * dianggap final -- percobaan berikutnya ditolak di sini juga (bukan
 * cuma disembunyikan di frontend).
 *
 * Pilihan jawaban dinamis (lihat FASE 9 di schema.sql) -- jawaban
 * peserta berupa ID pilihan yang dipilih (bukan huruf a/b/c/d lagi),
 * dinilai lewat cn_hitung_skor_soal_dinamis() (sama fungsi yang
 * dipakai Kuis per Bab).
 *
 * Body JSON:
 * {
 *   "user_id": 5,
 *   "jawaban": { "1": 3, "2": 9 }   // soal_id => id pilihan yang dipilih
 * }
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

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$user_id = isset($data['user_id']) ? (int) $data['user_id'] : 0;
$jawaban_peserta = isset($data['jawaban']) && is_array($data['jawaban']) ? $data['jawaban'] : [];

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

// --- Cegah kirim ulang kalau SUDAH pernah mencapai skor final (>=51)
//     di percobaan manapun -- Final Tryout yang sudah final TIDAK
//     BOLEH diulang lagi (beda dengan Kuis per Bab yang boleh diulang
//     tanpa batas atas). ---
$stmt = $conn->prepare("SELECT skor FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$last_row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($last_row && (int) $last_row['skor'] >= TRYOUT_PASSING_SCORE) {
    echo json_encode(["status" => "error", "message" => "Final Tryout kamu sudah final dan tidak bisa diulang lagi"]);
    $conn->close();
    exit;
}

// --- Ambil kunci jawaban + poin + penjelasan dari server ---
$result = $conn->query("SELECT id, pertanyaan, poin, penjelasan FROM tryout_soal");

$soal_rows = [];
$id_list = [];
while ($row = $result->fetch_assoc()) {
    $row['id'] = (int) $row['id'];
    $row['poin'] = $row['poin'] !== null ? (float) $row['poin'] : null;
    $row['pilihan'] = [];
    $id_list[] = $row['id'];
    $soal_rows[$row['id']] = $row;
}

if (count($soal_rows) === 0) {
    echo json_encode(["status" => "error", "message" => "Soal Final Tryout belum tersedia"]);
    $conn->close();
    exit;
}

// Ambil pilihan jawaban dinamis (termasuk is_benar, ini kode server jadi aman)
$ids = implode(',', array_map('intval', $id_list));
$pilihanResult = $conn->query("SELECT id, soal_id, teks, is_benar FROM tryout_soal_pilihan WHERE soal_id IN ($ids)");
while ($p = $pilihanResult->fetch_assoc()) {
    $soal_rows[(int) $p['soal_id']]['pilihan'][] = [
        "id" => (int) $p['id'],
        "teks" => $p['teks'],
        "is_benar" => (bool) $p['is_benar']
    ];
}
$soal_rows = array_values($soal_rows);

// Kunci jawaban_peserta dikirim sbg soal_id string dari JSON -> normalisasi jadi
// int-keyed (nilainya = id pilihan yang dipilih peserta, bukan huruf a/b/c/d lagi)
$jawaban_ternormalisasi = [];
foreach ($jawaban_peserta as $k => $v) {
    $jawaban_ternormalisasi[(int) $k] = $v;
}

$hasil_hitung = cn_hitung_skor_soal_dinamis($soal_rows, $jawaban_ternormalisasi);
$jumlah_soal = count($soal_rows);
$jumlah_benar = $hasil_hitung['jumlah_benar'];
$skor = (int) round($hasil_hitung['skor']);
$lulus = $skor >= TRYOUT_PASSING_SCORE;

// Simpan rincian pembahasan sebagai JSON supaya peserta bisa buka lagi
// kapan saja lewat get_tryout.php, bukan cuma sekali pas submit ini
// (cuma ditampilkan balik ke peserta kalau skornya sudah final, lihat
// di bawah -- supaya kunci jawaban tidak bocor untuk percobaan ulang).
$detail_json = json_encode($hasil_hitung['detail']);

$stmt = $conn->prepare("INSERT INTO tryout_hasil (user_id, jumlah_benar, jumlah_soal, skor, detail_json) VALUES (?,?,?,?,?)");
$stmt->bind_param("iiiis", $user_id, $jumlah_benar, $jumlah_soal, $skor, $detail_json);
$stmt->execute();
$stmt->close();

// Percobaan ini sudah selesai -- hapus catatan "waktu mulai" supaya
// kalau peserta belum final dan mengulang lagi, timernya dihitung
// ulang dari awal (durasi penuh), bukan melanjutkan sisa waktu
// percobaan yang baru saja disubmit ini (sama pola dengan Kuis per
// Bab, lihat cn_hapus_waktu_kuis()).
cn_hapus_waktu_tryout($conn, $user_id);

// --- Riwayat SEMUA percobaan (termasuk yang baru saja disubmit ini),
//     dikirim balik supaya layar hasil (tampilkanHasilTryout di
//     js/quiz.js) bisa langsung menampilkan dropdown "Riwayat
//     Percobaan" tanpa perlu fetch ulang. ---
$riwayat = [];
$rw_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, created_at FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC");
$rw_stmt->bind_param("i", $user_id);
$rw_stmt->execute();
$rw_res = $rw_stmt->get_result();
while ($rw_row = $rw_res->fetch_assoc()) {
    $riwayat[] = [
        "jumlah_benar" => (int) $rw_row['jumlah_benar'],
        "jumlah_soal" => (int) $rw_row['jumlah_soal'],
        "skor" => (int) $rw_row['skor'],
        "tanggal" => str_replace(' ', 'T', $rw_row['created_at'])
    ];
}
$rw_stmt->close();

echo json_encode([
    "status" => "success",
    "message" => $lulus
        ? "Selamat, kamu telah menyelesaikan Program Cakar Nalar!"
        : "Skormu belum mencapai kategori final. Pelajari lagi materinya, lalu coba kerjakan ulang Final Tryout ini.",
    "data" => [
        "jumlah_benar" => $jumlah_benar,
        "jumlah_soal" => $jumlah_soal,
        "skor" => $skor,
        "lulus" => $lulus,
        "passing_score" => TRYOUT_PASSING_SCORE,
        "klasifikasi" => cn_klasifikasi_tryout($skor),
        // Pembahasan Jawaban SENGAJA TIDAK PERNAH dikirim ke peserta --
        // baik sudah lulus/final maupun belum -- sama seperti Tes
        // Diagnostik. Rincian jawaban tetap tersimpan permanen di
        // tryout_hasil.detail_json untuk keperluan admin.
        "pembahasan" => [],
        "riwayat" => $riwayat,
        "jumlah_percobaan" => count($riwayat)
    ]
]);

$conn->close();
?>