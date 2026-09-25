<?php
/**
 * admin/delete_bab.php
 * -----------------------------------------------------
 * Hapus satu bab. Lewat ON DELETE CASCADE di skema database, ini
 * otomatis ikut menghapus:
 *   - seluruh soal Kuis per Bab milik bab ini (quiz_soal)
 *   - progres baca materi & status lulus semua peserta untuk bab ini (progres)
 *   - riwayat hasil kuis semua peserta untuk bab ini (hasil_kuis)
 *   - baris file materi milik bab ini di tabel bab_file_materi
 * File-file materi & video (kalau ada) juga ikut dihapus dari server
 * (CASCADE cuma menghapus baris tabelnya, bukan file fisiknya).
 *
 * Body JSON: { "id": 1 }
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

$id = isset($data['id']) ? (int) $data['id'] : 0;

if ($id <= 0) {
    echo json_encode(["status" => "error", "message" => "id bab wajib diisi"]);
    $conn->close();
    exit;
}

$cek = $conn->prepare("SELECT video_file FROM bab WHERE id = ? LIMIT 1");
$cek->bind_param("i", $id);
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

// Kumpulkan dulu nama file materi (bisa lebih dari satu) SEBELUM
// bab-nya dihapus -- begitu DELETE FROM bab dieksekusi, baris-baris di
// bab_file_materi ikut lenyap lewat ON DELETE CASCADE, jadi tidak bisa
// lagi diambil sesudahnya.
$file_materi_names = [];
$fm_res = $conn->query("SELECT nama_file FROM bab_file_materi WHERE bab_id = " . (int) $id);
while ($fm_row = $fm_res->fetch_assoc()) {
    $file_materi_names[] = $fm_row['nama_file'];
}

$stmt = $conn->prepare("DELETE FROM bab WHERE id = ?");
$stmt->bind_param("i", $id);

if ($stmt->execute()) {
    foreach ($file_materi_names as $nama_file) {
        $path = __DIR__ . '/../../uploads/ppt/' . $nama_file;
        if (is_file($path)) {
            unlink($path);
        }
    }
    if (!empty($bab['video_file'])) {
        $path_video = __DIR__ . '/../../uploads/video/' . $bab['video_file'];
        if (is_file($path_video)) {
            unlink($path_video);
        }
    }
    echo json_encode(["status" => "success", "message" => "Bab berhasil dihapus"]);
} else {
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>