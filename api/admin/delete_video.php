<?php
/**
 * admin/delete_video.php
 * -----------------------------------------------------
 * Hapus file video yang terpasang pada satu bab (mode "Upload File
 * Video"), tanpa perlu menggantinya dengan file baru.
 *
 * Body JSON: { "bab_id": 1 }
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

if ($bab_id <= 0) {
    echo json_encode(["status" => "error", "message" => "bab_id wajib diisi"]);
    $conn->close();
    exit;
}

$cek = $conn->prepare("SELECT video_file FROM bab WHERE id = ? LIMIT 1");
$cek->bind_param("i", $bab_id);
$cek->execute();
$res = $cek->get_result();
if ($res->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Bab dengan id tersebut tidak ditemukan"]);
    $cek->close();
    $conn->close();
    exit;
}
$bab = $res->fetch_assoc();
$cek->close();

if (empty($bab['video_file'])) {
    echo json_encode(["status" => "error", "message" => "Bab ini belum memiliki file video"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("UPDATE bab SET video_file = NULL, video_file_nama_asli = NULL WHERE id = ?");
$stmt->bind_param("i", $bab_id);

if ($stmt->execute()) {
    $path = __DIR__ . '/../../uploads/video/' . $bab['video_file'];
    if (is_file($path)) {
        unlink($path);
    }
    echo json_encode(["status" => "success", "message" => "Video dihapus"]);
} else {
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
