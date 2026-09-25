<?php
/**
 * admin/delete_soal.php
 * -----------------------------------------------------
 * Hapus satu soal (kuis / diagnostik / tryout) berdasarkan id.
 *
 * Body JSON: { "jenis": "kuis" | "diagnostik" | "tryout", "id": 12 }
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

$table_map = [
    'kuis' => 'quiz_soal',
    'diagnostik' => 'diagnostik_soal',
    'tryout' => 'tryout_soal'
];

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$jenis = $data['jenis'] ?? '';
$id = isset($data['id']) ? (int) $data['id'] : 0;

if (!isset($table_map[$jenis])) {
    echo json_encode(["status" => "error", "message" => "Jenis soal tidak valid. Gunakan: kuis, diagnostik, atau tryout"]);
    $conn->close();
    exit;
}
if ($id <= 0) {
    echo json_encode(["status" => "error", "message" => "id soal wajib diisi"]);
    $conn->close();
    exit;
}

$table = $table_map[$jenis];

$stmt = $conn->prepare("DELETE FROM $table WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {
    if ($stmt->affected_rows > 0) {
        echo json_encode(["status" => "success", "message" => "Soal berhasil dihapus"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Soal dengan id tersebut tidak ditemukan"]);
    }
} else {
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
