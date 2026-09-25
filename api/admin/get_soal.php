<?php
/**
 * admin/get_soal.php
 * -----------------------------------------------------
 * Dipakai halaman admin untuk menampilkan daftar soal yang bisa
 * ditambah/diubah/dihapus. Mengembalikan juga pilihan.benar per opsi
 * (karena ini panel admin, bukan tampilan peserta).
 *
 * Ketiga jenis soal (kuis / diagnostik / tryout) sekarang sama-sama
 * pakai pilihan jawaban dinamis (tabel *_soal_pilihan terpisah) --
 * lihat FASE 9 di schema.sql untuk migrasi dari format lama (A-D baku).
 *
 * Cara panggil:
 *   GET api/admin/get_soal.php?jenis=kuis&bab_id=1
 *   GET api/admin/get_soal.php?jenis=diagnostik
 *   GET api/admin/get_soal.php?jenis=tryout
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

// Whitelist nama tabel berdasarkan jenis soal (mencegah SQL injection lewat nama tabel)
$table_map = [
    'kuis' => 'quiz_soal',
    'diagnostik' => 'diagnostik_soal',
    'tryout' => 'tryout_soal'
];
$pilihan_table_map = [
    'kuis' => 'quiz_soal_pilihan',
    'diagnostik' => 'diagnostik_soal_pilihan',
    'tryout' => 'tryout_soal_pilihan'
];

$jenis = $_GET['jenis'] ?? '';

if (!isset($table_map[$jenis])) {
    echo json_encode(["status" => "error", "message" => "Jenis soal tidak valid. Gunakan: kuis, diagnostik, atau tryout"]);
    $conn->close();
    exit;
}

$table = $table_map[$jenis];
$pilihan_table = $pilihan_table_map[$jenis];

if ($jenis === 'kuis') {
    $bab_id = isset($_GET['bab_id']) ? (int) $_GET['bab_id'] : 0;
    if ($bab_id <= 0) {
        echo json_encode(["status" => "error", "message" => "bab_id wajib diisi untuk jenis kuis"]);
        $conn->close();
        exit;
    }
    $stmt = $conn->prepare("SELECT id, bab_id, pertanyaan, poin, penjelasan, urutan FROM quiz_soal WHERE bab_id = ? ORDER BY urutan ASC, id ASC");
    $stmt->bind_param("i", $bab_id);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $stmt = $conn->prepare("SELECT id, pertanyaan, poin, penjelasan, urutan FROM $table ORDER BY urutan ASC, id ASC");
    $stmt->execute();
    $result = $stmt->get_result();
}

$soal_rows = [];
while ($row = $result->fetch_assoc()) {
    $row['id'] = (int) $row['id'];
    if (isset($row['bab_id'])) {
        $row['bab_id'] = (int) $row['bab_id'];
    }
    $row['urutan'] = (int) $row['urutan'];
    $row['poin'] = $row['poin'] !== null ? (float) $row['poin'] : null;
    $row['pilihan'] = [];
    $soal_rows[$row['id']] = $row;
}
$stmt->close();

if (count($soal_rows) > 0) {
    $ids = implode(',', array_map('intval', array_keys($soal_rows)));
    $pilihanResult = $conn->query("SELECT id, soal_id, teks, is_benar, urutan FROM $pilihan_table WHERE soal_id IN ($ids) ORDER BY urutan ASC, id ASC");
    while ($p = $pilihanResult->fetch_assoc()) {
        $soal_rows[(int) $p['soal_id']]['pilihan'][] = [
            "id" => (int) $p['id'],
            "teks" => $p['teks'],
            "benar" => (bool) $p['is_benar']
        ];
    }
}

$soal_list = array_values($soal_rows);

echo json_encode([
    "status" => "success",
    "jenis" => $jenis,
    "data" => $soal_list
]);

$conn->close();
?>
