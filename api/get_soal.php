<?php
/**
 * get_soal.php
 * -----------------------------------------------------
 * Ambil soal Kuis per Bab untuk PESERTA (TANPA jawaban_benar, supaya
 * tidak bisa diintip lewat response API). Dipakai oleh kuis.html lewat
 * mesin soal generik js/quiz.js -- bentuk response-nya disamakan dengan
 * api/get_diagnostik.php: {sudah_selesai, skor, soal[]}.
 *
 * Beda dengan Tes Diagnostik (yang cuma bisa dikerjakan sekali), Kuis
 * per Bab BOLEH diulang kalau belum lulus -- jadi "sudah_selesai" di sini
 * berarti "sudah LULUS" (progres.lulus = 1), bukan "sudah pernah
 * mengerjakan". Selama belum lulus, soal tetap dikirim supaya peserta
 * bisa mencoba lagi.
 *
 * Cara panggil: GET api/get_soal.php?bab_id=1&user_id=5
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

$stmt = $conn->prepare("SELECT id, nomor, judul, ada_kuis, nilai_minimal, petunjuk_kuis, durasi_kuis_menit FROM bab WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $bab_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Bab tidak ditemukan"]);
    $stmt->close();
    $conn->close();
    exit;
}
$bab = $result->fetch_assoc();
$stmt->close();

if (cn_bab_locked($conn, $user_id, (int) $bab['nomor'])) {
    echo json_encode(["status" => "error", "message" => "Bab ini masih terkunci"]);
    $conn->close();
    exit;
}

if (!$bab['ada_kuis']) {
    echo json_encode(["status" => "error", "message" => "Bab ini tidak memiliki kuis"]);
    $conn->close();
    exit;
}

// --- Sudah lulus sebelumnya? (kuis boleh diulang kalau belum lulus) ---
$stmt = $conn->prepare("SELECT lulus FROM progres WHERE user_id = ? AND bab_id = ? LIMIT 1");
$stmt->bind_param("ii", $user_id, $bab_id);
$stmt->execute();
$progresRow = $stmt->get_result()->fetch_assoc();
$stmt->close();

$sudah_lulus = $progresRow && (int) $progresRow['lulus'] === 1;

// --- Riwayat SEMUA percobaan (dipakai baik untuk layar "sudah lulus" di
//     bawah ini -- dropdown "Riwayat Percobaan" di tampilkanHasilKuisBab --
//     maupun layar riwayat sebelum "Coba Lagi" untuk yang belum lulus, lihat
//     di bawah). Diurutkan TERBARU dulu. ---
$riwayat = [];
$rw_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, detail_json, created_at FROM hasil_kuis WHERE user_id = ? AND bab_id = ? ORDER BY id DESC");
$rw_stmt->bind_param("ii", $user_id, $bab_id);
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

// --- Bab selanjutnya (nomor + 1), kalau ada -- dipakai baik oleh layar
//     "sudah lulus" di bawah (tombol "Lanjut ke Bab Berikutnya") maupun
//     subtitle kuis.html SEBELUM peserta mengerjakan (lihat quiz-subtitle
//     di js/quiz.js), supaya keduanya bisa menyebut nama bab berikutnya
//     kalau memang ada, dan tidak menyebut apa-apa kalau bab ini yang
//     terakhir. Dihitung sekali di sini, dipakai bersama seperti $riwayat. ---
$bab_selanjutnya = null;
$nomor_berikutnya = (int) $bab['nomor'] + 1;
$nb_stmt = $conn->prepare("SELECT id, judul FROM bab WHERE nomor = ? LIMIT 1");
$nb_stmt->bind_param("i", $nomor_berikutnya);
$nb_stmt->execute();
$nb_row = $nb_stmt->get_result()->fetch_assoc();
$nb_stmt->close();
if ($nb_row) {
    $bab_selanjutnya = [
        "id" => (int) $nb_row['id'],
        "judul" => $nb_row['judul']
    ];
}

if ($sudah_lulus) {
    // Rincian pembahasan (jawaban peserta vs kunci, per soal) dari
    // percobaan TERAKHIR (yang bikin peserta lulus) -- disimpan permanen
    // di kolom hasil_kuis.detail_json saat submit (lihat submit_kuis.php),
    // supaya peserta bisa buka lagi pembahasannya kapan saja, bukan cuma
    // sekali muncul pas submit. Baris lama (sebelum kolom ini ada) akan
    // punya detail_json NULL -- pembahasan dianggap tidak tersedia, bukan
    // error.
    $pembahasan = [];
    if ($percobaan_terakhir && !empty($percobaan_terakhir['detail_json'])) {
        $decoded = json_decode($percobaan_terakhir['detail_json'], true);
        if (is_array($decoded)) {
            $pembahasan = $decoded;
        }
    }

    echo json_encode([
        "status" => "success",
        "data" => [
            "sudah_selesai" => true,
            "lulus" => true,
            "skor" => $percobaan_terakhir ? (int) $percobaan_terakhir['skor'] : null,
            "jumlah_benar" => $percobaan_terakhir ? (int) $percobaan_terakhir['jumlah_benar'] : null,
            "jumlah_soal" => $percobaan_terakhir ? (int) $percobaan_terakhir['jumlah_soal'] : null,
            "nilai_minimal" => $bab['nilai_minimal'] !== null ? (int) $bab['nilai_minimal'] : null,
            "pembahasan" => $pembahasan,
            "riwayat" => $riwayat,
            "jumlah_percobaan" => count($riwayat),
            "soal" => [],
            "nomor" => (int) $bab['nomor'],
            "bab_judul" => $bab['judul'],
            "bab_selanjutnya" => $bab_selanjutnya
        ]
    ]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, pertanyaan, urutan FROM quiz_soal WHERE bab_id = ? ORDER BY urutan ASC, id ASC");
$stmt->bind_param("i", $bab_id);
$stmt->execute();
$result = $stmt->get_result();

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
$stmt->close();

if (count($soal_list) === 0) {
    echo json_encode(["status" => "error", "message" => "Soal kuis bab ini belum tersedia. Coba lagi nanti."]);
    $conn->close();
    exit;
}

// Pilihan jawaban dinamis, TANPA is_benar (supaya tidak bocor ke peserta)
$ids = implode(',', array_map('intval', $id_urutan));
$pilihanResult = $conn->query("SELECT id, soal_id, teks, urutan FROM quiz_soal_pilihan WHERE soal_id IN ($ids) ORDER BY urutan ASC, id ASC");
while ($p = $pilihanResult->fetch_assoc()) {
    $soal_list[(int) $p['soal_id']]['pilihan'][] = [
        "id" => (int) $p['id'],
        "teks" => $p['teks']
    ];
}

// --- Batas waktu (opsional, diatur admin per bab). PENTING: endpoint
//     ini (get_soal.php) HANYA "melihat" data -- dipanggil setiap kali
//     halaman kuis dibuka, TERMASUK cuma untuk mengintip layar riwayat
//     percobaan sebelum peserta klik "Coba Lagi" (lihat
//     renderRiwayatKuisBab di js/quiz.js). Kalau waktu mulai dicatat di
//     SINI (seperti sebelumnya), peserta yang cuma buka halaman buat
//     lihat riwayat nilai gagalnya saja -- TANPA benar-benar klik "Coba
//     Lagi" -- sudah otomatis dianggap "sedang mengerjakan" (kelihatan
//     salah di Monitor Peserta). Makanya waktu mulai TIDAK dicatat di
//     sini lagi -- cuma diberitahukan ADA/TIDAKnya batas waktu & berapa
//     menit durasinya (buat teks konfirmasi "Coba Lagi"). Pencatatan
//     waktu mulai yang SEBENARNYA dipindah ke endpoint terpisah,
//     api/mulai_kuis_bab.php, yang HANYA dipanggil dari
//     mulaiKerjakanSoalKuis() di js/quiz.js -- persis saat peserta
//     benar-benar mulai/lanjut mengerjakan, bukan cuma membuka halaman. ---
$durasi_menit = $bab['durasi_kuis_menit'] !== null ? (int) $bab['durasi_kuis_menit'] : null;

// $riwayat sudah dihitung di atas (dipakai bersama layar "sudah lulus"),
// dipakai lagi di sini untuk layar riwayat sebelum "Coba Lagi" (peserta
// sudah pernah SUBMIT tapi belum lulus -- lihat renderRiwayatKuisBab di
// js/quiz.js).

echo json_encode([
    "status" => "success",
    "data" => [
        "sudah_selesai" => false,
        "skor" => null,
        "soal" => array_values($soal_list),
        "jumlah_soal" => count($soal_list),
        "nomor" => (int) $bab['nomor'],
        "bab_judul" => $bab['judul'],
        "nilai_minimal" => $bab['nilai_minimal'] !== null ? (int) $bab['nilai_minimal'] : null,
        "petunjuk" => $bab['petunjuk_kuis'],
        "durasi_menit" => $durasi_menit,
        "passing_score" => PASSING_SCORE,
        "riwayat" => $riwayat,
        "jumlah_percobaan" => count($riwayat),
        "bab_selanjutnya" => $bab_selanjutnya
    ]
]);

$conn->close();
?>