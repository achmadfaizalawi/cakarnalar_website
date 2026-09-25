<?php
/**
 * admin/get_peserta_detail.php
 * -----------------------------------------------------
 * Rincian lengkap SATU peserta untuk modal "Detail" di Monitor Peserta:
 * rincian jawaban per soal (benar/salah vs kunci + penjelasan) untuk
 * Tes Diagnostik & Final Tryout (dari detail_json yang sudah tersimpan
 * sejak peserta submit, lihat submit_diagnostik.php/submit_tryout.php),
 * dan progres + hasil kuis (percobaan terakhir) tiap bab.
 *
 * Cara panggil: GET api/admin/get_peserta_detail.php?user_id=5
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

$user_id = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, name, email, created_at FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$user_row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user_row) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

// --- Tes Diagnostik ---
$diagnostik = null;
$stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, detail_json, created_at FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$dh = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($dh) {
    $pembahasan = !empty($dh['detail_json']) ? json_decode($dh['detail_json'], true) : [];
    $diagnostik = [
        "jumlah_benar" => (int) $dh['jumlah_benar'],
        "jumlah_soal" => (int) $dh['jumlah_soal'],
        "skor" => (int) $dh['skor'],
        "selesai_pada" => str_replace(' ', 'T', $dh['created_at']),
        "pembahasan" => is_array($pembahasan) ? $pembahasan : []
    ];
}

// --- Final Tryout ---
// Final Tryout kini BOLEH dicoba lebih dari sekali (peserta mengulang
// sampai skornya >= TRYOUT_PASSING_SCORE), jadi tabel tryout_hasil bisa
// punya BANYAK baris per user -- sama seperti hasil_kuis per bab di
// bawah. Query di sini diambil SEMUA baris (ORDER BY id DESC), bukan
// LIMIT 1 tanpa ORDER BY seperti sebelumnya (itu bisa mengembalikan
// percobaan MANA SAJA secara acak, bukan yang terbaru). Percobaan
// PALING BARU (baris pertama karena DESC) dipakai sebagai skor/status
// utama (mengikuti pola "percobaan terakhir" yang sama dengan kuis per
// bab), sisanya masuk ke "riwayat".
$tryout = null;
$tryout_jumlah_percobaan = 0;
$riwayat_tryout = [];
$rwt_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, detail_json, created_at FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC");
$rwt_stmt->bind_param("i", $user_id);
$rwt_stmt->execute();
$rwt_res = $rwt_stmt->get_result();
while ($rwt_row = $rwt_res->fetch_assoc()) {
    $tryout_jumlah_percobaan++;
    $pembahasan = !empty($rwt_row['detail_json']) ? json_decode($rwt_row['detail_json'], true) : [];
    $percobaan = [
        "jumlah_benar" => (int) $rwt_row['jumlah_benar'],
        "jumlah_soal" => (int) $rwt_row['jumlah_soal'],
        "skor" => (int) $rwt_row['skor'],
        "selesai_pada" => str_replace(' ', 'T', $rwt_row['created_at']),
        "pembahasan" => is_array($pembahasan) ? $pembahasan : []
    ];
    if ($tryout === null) {
        // Percobaan terbaru (baris pertama, DESC) -- jadi ringkasan utama.
        $tryout = [
            "jumlah_benar" => $percobaan['jumlah_benar'],
            "jumlah_soal" => $percobaan['jumlah_soal'],
            "skor" => $percobaan['skor'],
            "selesai_pada" => $percobaan['selesai_pada'],
            "pembahasan" => $percobaan['pembahasan'],
            "lulus" => $percobaan['skor'] >= TRYOUT_PASSING_SCORE
        ];
    }
    $riwayat_tryout[] = $percobaan;
}
$rwt_stmt->close();
if ($tryout !== null) {
    $tryout['jumlah_percobaan'] = $tryout_jumlah_percobaan;
    $tryout['riwayat'] = $riwayat_tryout;
}

// --- Tiap Bab: progres + percobaan kuis terakhir (kalau ada_kuis) ---
$bab_result = $conn->query("SELECT id, nomor, judul, ada_kuis, nilai_minimal FROM bab ORDER BY nomor ASC");
$bab_list = [];
while ($b = $bab_result->fetch_assoc()) {
    $bab_id = (int) $b['id'];

    $stmt = $conn->prepare("SELECT materi_dibaca, lulus FROM progres WHERE user_id = ? AND bab_id = ? LIMIT 1");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $progres_row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $percobaan_terakhir = null;
    $jumlah_percobaan = 0;
    // Riwayat SEMUA percobaan (bukan cuma yang terakhir) -- dipakai oleh
    // tombol "Lihat" di kolom Percobaan pada tabel Progres Materi, supaya
    // admin bisa lihat histori nilai tiap kali peserta mencoba kuis bab
    // ini, mirip layar riwayat percobaan di sisi peserta (renderRiwayatKuisBab
    // di js/quiz.js). Diurutkan TERBARU dulu.
    $riwayat_kuis = [];
    $rw_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, detail_json, created_at FROM hasil_kuis WHERE user_id = ? AND bab_id = ? ORDER BY id DESC");
    $rw_stmt->bind_param("ii", $user_id, $bab_id);
    $rw_stmt->execute();
    $rw_res = $rw_stmt->get_result();
    while ($rw_row = $rw_res->fetch_assoc()) {
        $jumlah_percobaan++;
        $pembahasan = !empty($rw_row['detail_json']) ? json_decode($rw_row['detail_json'], true) : [];
        $percobaan = [
            "jumlah_benar" => (int) $rw_row['jumlah_benar'],
            "jumlah_soal" => (int) $rw_row['jumlah_soal'],
            "skor" => (int) $rw_row['skor'],
            "selesai_pada" => str_replace(' ', 'T', $rw_row['created_at']),
            "pembahasan" => is_array($pembahasan) ? $pembahasan : []
        ];
        if ($percobaan_terakhir === null) {
            $percobaan_terakhir = $percobaan;
        }
        $riwayat_kuis[] = $percobaan;
    }
    $rw_stmt->close();

    $bab_list[] = [
        "id" => $bab_id,
        "nomor" => (int) $b['nomor'],
        "judul" => $b['judul'],
        "ada_kuis" => (bool) $b['ada_kuis'],
        "nilai_minimal" => $b['nilai_minimal'] !== null ? (int) $b['nilai_minimal'] : null,
        "materi_dibaca" => $progres_row ? (bool) $progres_row['materi_dibaca'] : false,
        "lulus" => $progres_row ? (bool) $progres_row['lulus'] : false,
        "jumlah_percobaan_kuis" => $jumlah_percobaan,
        "percobaan_terakhir" => $percobaan_terakhir,
        "riwayat_kuis" => $riwayat_kuis
    ];
}

echo json_encode([
    "status" => "success",
    "data" => [
        "id" => (int) $user_row['id'],
        "name" => $user_row['name'],
        "email" => $user_row['email'],
        "terdaftar_pada" => str_replace(' ', 'T', $user_row['created_at']),
        "diagnostik" => $diagnostik,
        "tryout" => $tryout,
        "bab" => $bab_list
    ]
]);

$conn->close();
?>