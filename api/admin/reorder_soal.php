<?php
/**
 * admin/reorder_soal.php
 * -----------------------------------------------------
 * Simpan urutan tampil baru untuk soal Tes Diagnostik / Final Tryout
 * hasil drag & drop di halaman "Kelola Soal" (lihat js/admin.js) --
 * versi generik dari admin/reorder_soal_kuis.php (yang khusus soal
 * Kuis per Bab / quiz_soal), karena diagnostik_soal & tryout_soal
 * bukan per-bab (tidak ada bab_id), cukup diisolasi lewat nama
 * tabelnya sendiri.
 *
 * Body JSON: {
 *   "jenis": "diagnostik" | "tryout",
 *   "urutan": [12, 9, 14, 8, 11]   // id soal, sudah dalam urutan baru
 * }
 *
 * urutan[0] jadi soal.urutan = 1, urutan[1] jadi 2, dst -- semua id yang
 * dikirim WAJIB ada di tabel jenis itu (dicek sebelum disimpan) supaya
 * payload nyasar/dipalsukan tidak bisa mengubah urutan soal di tabel lain.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

// Whitelist nama tabel berdasarkan jenis soal (mencegah SQL injection lewat
// nama tabel) -- sengaja TIDAK menyertakan "kuis" di sini, itu tetap lewat
// admin/reorder_soal_kuis.php sendiri (soalnya butuh validasi tambahan per
// bab_id yang tidak berlaku untuk diagnostik/tryout).
$table_map = [
    'diagnostik' => 'diagnostik_soal',
    'tryout' => 'tryout_soal'
];

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$jenis = $data['jenis'] ?? '';
$urutanIds = isset($data['urutan']) && is_array($data['urutan']) ? array_values($data['urutan']) : [];

if (!isset($table_map[$jenis])) {
    echo json_encode(["status" => "error", "message" => "Jenis soal tidak valid. Gunakan: diagnostik atau tryout"]);
    $conn->close();
    exit;
}
if (count($urutanIds) === 0) {
    echo json_encode(["status" => "error", "message" => "Daftar urutan tidak boleh kosong"]);
    $conn->close();
    exit;
}

$table = $table_map[$jenis];

// Pastikan semua id yang dikirim benar-benar ada di tabel jenis ini --
// mencegah payload nyasar/dipalsukan mengubah urutan soal jenis lain.
$idsClean = array_map('intval', $urutanIds);
$placeholders = implode(',', array_fill(0, count($idsClean), '?'));
$types = str_repeat('i', count($idsClean));

$checkSql = "SELECT COUNT(*) AS jumlah FROM $table WHERE id IN ($placeholders)";
$check = $conn->prepare($checkSql);
$check->bind_param($types, ...$idsClean);
$check->execute();
$jumlahCocok = (int) $check->get_result()->fetch_assoc()['jumlah'];
$check->close();

if ($jumlahCocok !== count($idsClean)) {
    echo json_encode(["status" => "error", "message" => "Ada id soal yang tidak sesuai dengan jenis ini"]);
    $conn->close();
    exit;
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("UPDATE $table SET urutan = ? WHERE id = ?");
    foreach ($idsClean as $index => $soalId) {
        $urutanBaru = $index + 1;
        $stmt->bind_param('ii', $urutanBaru, $soalId);
        $stmt->execute();
    }
    $stmt->close();
    $conn->commit();
    echo json_encode(["status" => "success", "message" => "Urutan soal berhasil disimpan"]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan urutan: " . $e->getMessage()]);
}

$conn->close();
?>
