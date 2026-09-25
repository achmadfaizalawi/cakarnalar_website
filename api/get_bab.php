<?php
/**
 * get_bab.php
 * -----------------------------------------------------
 * Dipanggil oleh dashboard.html setelah peserta login.
 * Mengembalikan:
 *  - status Tes Diagnostik (sudah/belum, skor)
 *  - daftar 6 bab beserta status kunci (locked) & kelulusan tiap bab
 *  - status Final Tryout (terbuka/belum, sudah/belum, skor)
 *
 * Cara panggil: GET api/get_bab.php?user_id=1
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

// =================================================================
// 1) STATUS TES DIAGNOSTIK
// =================================================================
$diagnostik_selesai = false;
$diagnostik_skor = null;

$stmt = $conn->prepare("SELECT skor FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $diagnostik_selesai = true;
    $diagnostik_skor = (int) $row['skor'];
}
$stmt->close();

// Penanda PERMANEN (bukan localStorage) kalau peserta sudah pernah masuk
// & mulai mengerjakan Tes Diagnostik (baris diagnostik_waktu, dicatat di
// api/get_diagnostik.php begitu soal ditampilkan) -- dipakai dashboard.js
// supaya tombol "Lanjutkan Tes" tetap akurat walau localStorage peserta
// hilang, dan supaya begitu admin me-reset Tes Diagnostik peserta ini
// (baris diagnostik_waktu ikut terhapus, lihat cn_hapus_diagnostik() di
// api/admin/reset_peserta_progres.php) tombolnya balik lagi jadi "Mulai
// Tes Diagnostik" -- tidak perlu dicek kalau sudah selesai.
$diagnostik_sedang_dikerjakan = false;
if (!$diagnostik_selesai) {
    $stmt = $conn->prepare("SELECT 1 FROM diagnostik_waktu WHERE user_id = ? LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $diagnostik_sedang_dikerjakan = $stmt->get_result()->num_rows > 0;
    $stmt->close();
}

// =================================================================
// 2) DAFTAR BAB + STATUS PROGRES/LULUS TIAP PESERTA
// =================================================================
$bab_list = [];
$sql = "
    SELECT b.id, b.nomor, b.judul, b.ringkasan, b.ada_kuis,
           p.materi_dibaca, p.lulus,
           h.skor AS skor_terakhir
    FROM bab b
    LEFT JOIN progres p ON p.bab_id = b.id AND p.user_id = ?
    LEFT JOIN (
        SELECT hk1.bab_id, hk1.skor
        FROM hasil_kuis hk1
        INNER JOIN (
            SELECT bab_id, MAX(id) AS max_id
            FROM hasil_kuis
            WHERE user_id = ?
            GROUP BY bab_id
        ) hk2 ON hk1.bab_id = hk2.bab_id AND hk1.id = hk2.max_id
    ) h ON h.bab_id = b.id
    ORDER BY b.nomor ASC
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $user_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

$bab_sebelumnya_lulus = true; // Bab 1 mengikuti status Tes Diagnostik, bukan bab sebelumnya
$semua_bab_lulus = true;

while ($row = $res->fetch_assoc()) {
    $lulus = (bool) $row['lulus'];

    if ((int) $row['nomor'] === 1) {
        // Bab 1 terkunci sampai Tes Diagnostik selesai
        $locked = !$diagnostik_selesai;
    } else {
        // Bab N terkunci sampai Bab (N-1) lulus
        $locked = !$bab_sebelumnya_lulus;
    }

    if (!$lulus) {
        $semua_bab_lulus = false;
    }

    $bab_list[] = [
        "id" => (int) $row['id'],
        "nomor" => (int) $row['nomor'],
        "judul" => $row['judul'],
        "ringkasan" => $row['ringkasan'],
        "ada_kuis" => (bool) $row['ada_kuis'],
        "materi_dibaca" => (bool) $row['materi_dibaca'],
        "lulus" => $lulus,
        "skor_terakhir" => $row['skor_terakhir'] !== null ? (int) $row['skor_terakhir'] : null,
        "locked" => $locked
    ];

    $bab_sebelumnya_lulus = $lulus;
}
$stmt->close();

// =================================================================
// 3) STATUS FINAL TRYOUT
// -----------------------------------------------------
// Final Tryout BOLEH diulang selama skornya belum mencapai
// TRYOUT_PASSING_SCORE (51, lihat api/config.php) -- jadi "selesai" di
// sini berarti "skor PERCOBAAN TERAKHIR sudah final (>=51)", BUKAN lagi
// "ada baris tryout_hasil apapun" seperti sebelumnya (waktu masih
// sekali kerja). jumlah_percobaan dikirim balik supaya dashboard.js
// bisa tahu peserta sudah pernah mengerjakan sebelumnya (skip dialog
// konfirmasi "Mulai Final Tryout Sekarang?" kalau sudah pernah).
// =================================================================
$tryout_selesai = false;
$tryout_skor = null;
$tryout_jumlah_percobaan = 0;

$stmt = $conn->prepare("SELECT skor FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $tryout_skor = (int) $row['skor'];
    $tryout_selesai = $tryout_skor >= TRYOUT_PASSING_SCORE;
}
$stmt->close();

$stmt = $conn->prepare("SELECT COUNT(*) AS c FROM tryout_hasil WHERE user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$tryout_jumlah_percobaan = (int) $stmt->get_result()->fetch_assoc()['c'];
$stmt->close();

// Final Tryout hanya terbuka jika SEMUA bab (dan minimal ada 1 bab) sudah lulus
$tryout_unlocked = $semua_bab_lulus && count($bab_list) > 0;

// =================================================================
// RESPON
// =================================================================
echo json_encode([
    "status" => "success",
    "data" => [
        "diagnostik" => [
            "selesai" => $diagnostik_selesai,
            "skor" => $diagnostik_skor,
            "sedang_dikerjakan" => $diagnostik_sedang_dikerjakan
        ],
        "bab" => $bab_list,
        "tryout" => [
            "terbuka" => $tryout_unlocked,
            "selesai" => $tryout_selesai,
            "skor" => $tryout_skor,
            "jumlah_percobaan" => $tryout_jumlah_percobaan,
            // Dikirim supaya dashboard.js bisa menyebut batas minimalnya di
            // teks kartu TANPA hardcode angka di frontend (satu sumber
            // kebenaran tetap TRYOUT_PASSING_SCORE di api/config.php).
            "passing_score" => TRYOUT_PASSING_SCORE
        ]
    ]
]);

$conn->close();
?>