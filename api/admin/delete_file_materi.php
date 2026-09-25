<?php
/**
 * admin/delete_file_materi.php
 * -----------------------------------------------------
 * Hapus SATU file materi (baris di tabel bab_file_materi) berdasarkan
 * id filenya sendiri -- beda dengan versi lama (delete_ppt.php) yang
 * menghapus berdasarkan bab_id karena dulu cuma ada 1 file per bab.
 *
 * Body JSON: { "file_id": 1 }
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

$file_id = isset($data['file_id']) ? (int) $data['file_id'] : 0;

if ($file_id <= 0) {
    echo json_encode(["status" => "error", "message" => "file_id wajib diisi"]);
    $conn->close();
    exit;
}

$cek = $conn->prepare("SELECT nama_file FROM bab_file_materi WHERE id = ? LIMIT 1");
$cek->bind_param("i", $file_id);
$cek->execute();
$res = $cek->get_result();
if ($res->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "File materi dengan id tersebut tidak ditemukan"]);
    $cek->close();
    $conn->close();
    exit;
}
$file = $res->fetch_assoc();
$cek->close();

$stmt = $conn->prepare("DELETE FROM bab_file_materi WHERE id = ?");
$stmt->bind_param("i", $file_id);

if ($stmt->execute()) {
    $path = __DIR__ . '/../../uploads/ppt/' . $file['nama_file'];
    if (is_file($path)) {
        unlink($path);
    }
    echo json_encode(["status" => "success", "message" => "File dihapus"]);
} else {
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
