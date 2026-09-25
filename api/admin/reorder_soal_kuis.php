<?php
/**
 * admin/reorder_soal_kuis.php
 * -----------------------------------------------------
 * Simpan urutan tampil baru untuk soal Kuis per Bab (quiz_soal) hasil
 * drag & drop di modal "Kelola Soal Kuis" (lihat js/admin.js).
 *
 * Body JSON: {
 *   "bab_id": 1,
 *   "urutan": [12, 9, 14, 8, 11]   // id quiz_soal, sudah dalam urutan baru
 * }
 *
 * urutan[0] jadi soal.urutan = 1, urutan[1] jadi 2, dst -- semua id yang
 * dikirim WAJIB milik bab_id yang sama (dicek sebelum disimpan) supaya
 * drag & drop di satu bab tidak bisa kepakai untuk mengubah urutan soal
 * bab lain.
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

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$bab_id = isset($data['bab_id']) ? (int) $data['bab_id'] : 0;
$urutanIds = isset($data['urutan']) && is_array($data['urutan']) ? array_values($data['urutan']) : [];

if ($bab_id <= 0) {
    echo json_encode(["status" => "error", "message" => "bab_id wajib diisi"]);
    $conn->close();
    exit;
}
if (count($urutanIds) === 0) {
    echo json_encode(["status" => "error", "message" => "Daftar urutan tidak boleh kosong"]);
    $conn->close();
    exit;
}

// Pastikan semua id yang dikirim benar-benar milik bab ini -- mencegah
// payload nyasar/dipalsukan mengubah urutan soal bab lain.
$idsClean = array_map('intval', $urutanIds);
$placeholders = implode(',', array_fill(0, count($idsClean), '?'));
$types = str_repeat('i', count($idsClean));

$checkSql = "SELECT COUNT(*) AS jumlah FROM quiz_soal WHERE bab_id = ? AND id IN ($placeholders)";
$check = $conn->prepare($checkSql);
$checkParams = array_merge([$bab_id], $idsClean);
$check->bind_param('i' . $types, ...$checkParams);
$check->execute();
$jumlahCocok = (int) $check->get_result()->fetch_assoc()['jumlah'];
$check->close();

if ($jumlahCocok !== count($idsClean)) {
    echo json_encode(["status" => "error", "message" => "Ada id soal yang tidak sesuai dengan bab ini"]);
    $conn->close();
    exit;
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("UPDATE quiz_soal SET urutan = ? WHERE id = ? AND bab_id = ?");
    foreach ($idsClean as $index => $soalId) {
        $urutanBaru = $index + 1;
        $stmt->bind_param('iii', $urutanBaru, $soalId, $bab_id);
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
