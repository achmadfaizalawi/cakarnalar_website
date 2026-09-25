<?php
/**
 * submit_diagnostik.php
 * -----------------------------------------------------
 * Terima & nilai jawaban Tes Diagnostik. Hanya bisa dikirim SEKALI
 * per peserta (tabel diagnostik_hasil punya UNIQUE KEY user_id).
 *
 * Pilihan jawaban dinamis (lihat FASE 9 di schema.sql) -- jawaban
 * peserta berupa ID pilihan yang dipilih (bukan huruf a/b/c/d lagi),
 * dinilai lewat cn_hitung_skor_soal_dinamis() (sama fungsi yang
 * dipakai Kuis per Bab).
 *
 * Body JSON:
 * {
 *   "user_id": 5,
 *   "jawaban": { "3": 12, "4": 7 }   // soal_id => id pilihan yang dipilih
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

// --- Cegah pengerjaan ganda ---
$stmt = $conn->prepare("SELECT id FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
if ($stmt->get_result()->num_rows > 0) {
    echo json_encode(["status" => "error", "message" => "Kamu sudah pernah mengerjakan Tes Diagnostik"]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

// --- Ambil kunci jawaban + poin + penjelasan dari server ---
$result = $conn->query("SELECT id, pertanyaan, poin, penjelasan FROM diagnostik_soal");

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
    echo json_encode(["status" => "error", "message" => "Soal Tes Diagnostik belum tersedia"]);
    $conn->close();
    exit;
}

// Ambil pilihan jawaban dinamis (termasuk is_benar, ini kode server jadi aman)
$ids = implode(',', array_map('intval', $id_list));
$pilihanResult = $conn->query("SELECT id, soal_id, teks, is_benar FROM diagnostik_soal_pilihan WHERE soal_id IN ($ids)");
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

// Simpan rincian pembahasan sebagai JSON supaya peserta bisa buka lagi
// kapan saja lewat get_diagnostik.php, bukan cuma sekali pas submit ini.
$detail_json = json_encode($hasil_hitung['detail']);

$stmt = $conn->prepare("INSERT INTO diagnostik_hasil (user_id, jumlah_benar, jumlah_soal, skor, detail_json) VALUES (?,?,?,?,?)");
$stmt->bind_param("iiiis", $user_id, $jumlah_benar, $jumlah_soal, $skor, $detail_json);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "message" => "Tes Diagnostik selesai. Bab 1 sekarang terbuka!",
        "data" => [
            "jumlah_benar" => $jumlah_benar,
            "jumlah_soal" => $jumlah_soal,
            "skor" => $skor,
            "pembahasan" => $hasil_hitung['detail'],
            "klasifikasi" => cn_klasifikasi_paul_elder($skor)
        ]
    ]);
} else {
    // Kemungkinan besar karena UNIQUE KEY (race condition: submit dobel bersamaan)
    echo json_encode(["status" => "error", "message" => "Kamu sudah pernah mengerjakan Tes Diagnostik"]);
}

$stmt->close();
$conn->close();
?>