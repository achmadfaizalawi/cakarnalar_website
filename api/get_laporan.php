<?php
/**
 * get_laporan.php
 * -----------------------------------------------------
 * Rekap lengkap perjalanan belajar SATU peserta untuk laporan.html --
 * mirip api/admin/get_peserta_detail.php (dipakai admin), TAPI khusus
 * versi peserta: SENGAJA TIDAK menyertakan "pembahasan" (rincian
 * jawaban benar/salah per soal) untuk Tes Diagnostik maupun Final
 * Tryout -- konsisten dengan keputusan yang sama di get_diagnostik.php/
 * get_tryout.php (showPembahasan:false) supaya kunci jawaban tidak
 * pernah bocor ke peserta, baik lewat layar hasil maupun laporan ini.
 * Halaman ini murni rekap skor/status/tanggal, bukan layar review
 * jawaban.
 *
 * Bisa diakses kapan saja (tidak disyaratkan progres 100%) -- tombol
 * "Lihat Laporan Lengkap" di dashboard memang baru muncul begitu 100%,
 * tapi endpoint ini sendiri aman dipanggil di progres berapa pun
 * (bab yang belum dikerjakan otomatis tampil kosong/belum ada data).
 *
 * Cara panggil: GET api/get_laporan.php?user_id=5
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

// --- Tes Diagnostik (TANPA pembahasan, lihat catatan di atas) ---
$diagnostik = null;
$stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, created_at FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$dh = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($dh) {
    $skor_diagnostik = (int) $dh['skor'];
    $diagnostik = [
        "jumlah_benar" => (int) $dh['jumlah_benar'],
        "jumlah_soal" => (int) $dh['jumlah_soal'],
        "skor" => $skor_diagnostik,
        "klasifikasi" => cn_klasifikasi_paul_elder($skor_diagnostik),
        "selesai_pada" => str_replace(' ', 'T', $dh['created_at'])
    ];
}

// --- Final Tryout (percobaan terakhir + jumlah percobaan, TANPA
//     pembahasan) -- sama pola "percobaan terakhir" dengan get_tryout.php ---
$tryout = null;
$tryout_jumlah_percobaan = 0;
$stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, created_at FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $tryout_jumlah_percobaan++;
    if ($tryout === null) {
        $skor_tryout = (int) $row['skor'];
        $tryout = [
            "jumlah_benar" => (int) $row['jumlah_benar'],
            "jumlah_soal" => (int) $row['jumlah_soal'],
            "skor" => $skor_tryout,
            "klasifikasi" => cn_klasifikasi_tryout($skor_tryout),
            "lulus" => $skor_tryout >= TRYOUT_PASSING_SCORE,
            "selesai_pada" => str_replace(' ', 'T', $row['created_at'])
        ];
    }
}
$stmt->close();
if ($tryout !== null) {
    $tryout['jumlah_percobaan'] = $tryout_jumlah_percobaan;
}

// --- Tiap Bab: progres + skor percobaan terakhir kuisnya ---
$bab_result = $conn->query("SELECT id, nomor, judul FROM bab ORDER BY nomor ASC");
$bab_list = [];
while ($b = $bab_result->fetch_assoc()) {
    $bab_id = (int) $b['id'];

    $stmt = $conn->prepare("SELECT materi_dibaca, lulus FROM progres WHERE user_id = ? AND bab_id = ? LIMIT 1");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $progres_row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $skor_terakhir = null;
    $jumlah_percobaan = 0;
    $rw_stmt = $conn->prepare("SELECT skor, created_at FROM hasil_kuis WHERE user_id = ? AND bab_id = ? ORDER BY id DESC");
    $rw_stmt->bind_param("ii", $user_id, $bab_id);
    $rw_stmt->execute();
    $rw_res = $rw_stmt->get_result();
    while ($rw_row = $rw_res->fetch_assoc()) {
        $jumlah_percobaan++;
        if ($skor_terakhir === null) {
            $skor_terakhir = (int) $rw_row['skor'];
        }
    }
    $rw_stmt->close();

    $bab_list[] = [
        "id" => $bab_id,
        "nomor" => (int) $b['nomor'],
        "judul" => $b['judul'],
        "materi_dibaca" => $progres_row ? (bool) $progres_row['materi_dibaca'] : false,
        "lulus" => $progres_row ? (bool) $progres_row['lulus'] : false,
        "jumlah_percobaan" => $jumlah_percobaan,
        "skor_terakhir" => $skor_terakhir
    ];
}

echo json_encode([
    "status" => "success",
    "data" => [
        "nama" => $user_row['name'],
        "email" => $user_row['email'],
        "terdaftar_pada" => str_replace(' ', 'T', $user_row['created_at']),
        "diagnostik" => $diagnostik,
        "bab" => $bab_list,
        "tryout" => $tryout
    ]
]);

$conn->close();
?>
