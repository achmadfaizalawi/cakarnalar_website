<?php
/**
 * submit_kuis.php
 * -----------------------------------------------------
 * Terima jawaban kuis peserta, dinilai otomatis di server
 * (bukan di frontend, supaya tidak bisa dimanipulasi), simpan
 * riwayatnya, lalu update status lulus/tidak bab tersebut.
 *
 * Body JSON:
 * {
 *   "user_id": 5,
 *   "bab_id": 1,
 *   "jawaban": { "12": "a", "13": "c", "14": "b" }   // soal_id => pilihan
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
$bab_id = isset($data['bab_id']) ? (int) $data['bab_id'] : 0;
$jawaban_peserta = isset($data['jawaban']) && is_array($data['jawaban']) ? $data['jawaban'] : [];

if ($user_id <= 0 || $bab_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id dan bab_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, nomor, ada_kuis, nilai_minimal FROM bab WHERE id = ? LIMIT 1");
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

// --- Ambil kunci jawaban + poin + penjelasan dari server (BUKAN dari input peserta) ---
$stmt = $conn->prepare("SELECT id, pertanyaan, poin, penjelasan FROM quiz_soal WHERE bab_id = ?");
$stmt->bind_param("i", $bab_id);
$stmt->execute();
$result = $stmt->get_result();

$soal_rows = [];
$id_list = [];
while ($row = $result->fetch_assoc()) {
    $row['id'] = (int) $row['id'];
    $row['poin'] = $row['poin'] !== null ? (float) $row['poin'] : null;
    $row['pilihan'] = [];
    $id_list[] = $row['id'];
    $soal_rows[$row['id']] = $row;
}
$stmt->close();

if (count($soal_rows) === 0) {
    echo json_encode(["status" => "error", "message" => "Bab ini belum memiliki soal kuis"]);
    $conn->close();
    exit;
}

// Ambil pilihan jawaban dinamis (termasuk is_benar, ini kode server jadi aman)
$ids = implode(',', array_map('intval', $id_list));
$pilihanResult = $conn->query("SELECT id, soal_id, teks, is_benar FROM quiz_soal_pilihan WHERE soal_id IN ($ids)");
while ($p = $pilihanResult->fetch_assoc()) {
    $soal_rows[(int) $p['soal_id']]['pilihan'][] = [
        "id" => (int) $p['id'],
        "teks" => $p['teks'],
        "is_benar" => (bool) $p['is_benar']
    ];
}
$soal_rows = array_values($soal_rows);

// Kunci jawaban_peserta dikirim sbg soal_id string dari JSON -> normalisasi jadi int-keyed
// (nilainya = id pilihan yang dipilih peserta, bukan huruf a/b/c/d lagi)
$jawaban_ternormalisasi = [];
foreach ($jawaban_peserta as $k => $v) {
    $jawaban_ternormalisasi[(int) $k] = $v;
}

$hasil_hitung = cn_hitung_skor_soal_dinamis($soal_rows, $jawaban_ternormalisasi);
$jumlah_soal = count($soal_rows);
$jumlah_benar = $hasil_hitung['jumlah_benar'];
$skor = (int) round($hasil_hitung['skor']);

// --- Nilai minimal PER BAB (opsional) ---
// Kosong (NULL, default) -> kuis cuma syarat "wajib dikerjakan": submit
// dengan skor berapapun langsung dianggap lulus.
// Diisi admin -> peserta harus dapat skor >= nilai_minimal itu.
$nilai_minimal = $bab['nilai_minimal'] !== null ? (int) $bab['nilai_minimal'] : null;
$lulus = ($nilai_minimal === null || $skor >= $nilai_minimal) ? 1 : 0;

// --- Simpan riwayat hasil kuis, termasuk rincian per-soal (detail_json) --
//     supaya pembahasannya bisa dibuka lagi kapan saja (bukan cuma sekali
//     muncul pas submit ini) -- pola yang sama dipakai Tes Diagnostik lewat
//     kolom diagnostik_hasil.detail_json. ---
$detail_json = json_encode($hasil_hitung['detail']);
$stmt = $conn->prepare("INSERT INTO hasil_kuis (user_id, bab_id, jumlah_benar, jumlah_soal, skor, detail_json) VALUES (?,?,?,?,?,?)");
$stmt->bind_param("iiiiis", $user_id, $bab_id, $jumlah_benar, $jumlah_soal, $skor, $detail_json);
$stmt->execute();
$stmt->close();

// --- Update progres: sekali LULUS, status lulus tidak turun lagi walau
//     peserta mengulang kuis dan dapat skor lebih rendah ---
$stmt = $conn->prepare("
    INSERT INTO progres (user_id, bab_id, materi_dibaca, lulus)
    VALUES (?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE lulus = GREATEST(lulus, VALUES(lulus)), materi_dibaca = 1
");
$stmt->bind_param("iii", $user_id, $bab_id, $lulus);
$stmt->execute();
$stmt->close();

// Percobaan kuis ini (kalau bab-nya punya batas waktu) sudah selesai --
// hapus catatan "waktu mulai"-nya supaya kalau peserta belum lulus dan
// mengulang lagi, timer-nya dihitung ulang dari awal (durasi penuh),
// bukan melanjutkan sisa waktu percobaan yang baru saja disubmit ini.
cn_hapus_waktu_kuis($conn, $user_id, $bab_id);

// --- Riwayat SEMUA percobaan (termasuk yang baru saja disubmit ini),
//     dikirim balik supaya layar hasil (tampilkanHasilKuisBab di
//     js/quiz.js) bisa langsung menampilkan dropdown "Riwayat Percobaan"
//     tanpa perlu fetch ulang -- sama seperti yang dikirim get_soal.php
//     untuk layar riwayat sebelum "Coba Lagi". ---
$riwayat = [];
$rw_stmt = $conn->prepare("SELECT jumlah_benar, jumlah_soal, skor, created_at FROM hasil_kuis WHERE user_id = ? AND bab_id = ? ORDER BY id DESC");
$rw_stmt->bind_param("ii", $user_id, $bab_id);
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

// --- Kalau lulus, cek apakah ada bab selanjutnya (nomor + 1) supaya layar
//     hasil (tampilkanHasilKuisBab di js/quiz.js) bisa langsung menampilkan
//     tombol "Lanjut ke Bab Berikutnya" -- bab itu otomatis sudah terbuka
//     begitu bab ini lulus (lihat cn_bab_locked: syaratnya cuma bab
//     sebelumnya lulus), jadi tidak perlu cek locked lagi di sini. ---
$bab_selanjutnya = null;
if ($lulus) {
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
}

echo json_encode([
    "status" => "success",
    "message" => $lulus ? "Selamat, kamu lulus bab ini!" : "Belum lulus, coba pelajari lagi materinya ya.",
    "data" => [
        "jumlah_benar" => $jumlah_benar,
        "jumlah_soal" => $jumlah_soal,
        "skor" => $skor,
        "lulus" => (bool) $lulus,
        "nilai_minimal" => $nilai_minimal,
        "pembahasan" => $hasil_hitung['detail'],
        "riwayat" => $riwayat,
        "jumlah_percobaan" => count($riwayat),
        "bab_selanjutnya" => $bab_selanjutnya
    ]
]);

$conn->close();
?>