<?php
/**
 * admin/get_pengaturan_tes.php
 * -----------------------------------------------------
 * Ambil pengaturan batas waktu (menit) dan petunjuk pengerjaan untuk
 * Tes Diagnostik atau Final Tryout. durasi_menit = null berarti TANPA
 * batas waktu; petunjuk_pengerjaan = "" berarti tidak ada petunjuk.
 *
 * Cara panggil: GET api/admin/get_pengaturan_tes.php?jenis=diagnostik
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

$jenis = $_GET['jenis'] ?? '';

if (!in_array($jenis, ['diagnostik', 'tryout'], true)) {
    echo json_encode(["status" => "error", "message" => "Jenis tidak valid. Gunakan: diagnostik atau tryout"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT durasi_menit, petunjuk_pengerjaan FROM pengaturan_tes WHERE jenis = ? LIMIT 1");
$stmt->bind_param("s", $jenis);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

echo json_encode([
    "status" => "success",
    "data" => [
        "jenis" => $jenis,
        "durasi_menit" => ($row && $row['durasi_menit'] !== null) ? (int) $row['durasi_menit'] : null,
        "petunjuk_pengerjaan" => ($row && $row['petunjuk_pengerjaan'] !== null) ? $row['petunjuk_pengerjaan'] : ''
    ]
]);

$conn->close();
?>