<?php
/**
 * admin/upload_video.php
 * -----------------------------------------------------
 * Unggah file video materi untuk satu bab (mode "Upload File Video" --
 * alternatif dari mode "Link YouTube" yang pakai bab.video_url).
 * Cuma 1 file video aktif per bab, jadi mirip pola upload_ppt.php yang
 * lama: file lama (kalau ada) otomatis diganti/dihapus.
 * Ini form-data (bukan JSON) karena mengirim file.
 *
 * Cara panggil: POST multipart/form-data
 *   - field "bab_id"  : id bab tujuan
 *   - field "file"    : file .mp4 / .webm / .mov (maks 100MB)
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

$bab_id = isset($_POST['bab_id']) ? (int) $_POST['bab_id'] : 0;

if ($bab_id <= 0) {
    echo json_encode(["status" => "error", "message" => "bab_id wajib diisi"]);
    $conn->close();
    exit;
}

$cek = $conn->prepare("SELECT id, video_file FROM bab WHERE id = ? LIMIT 1");
$cek->bind_param("i", $bab_id);
$cek->execute();
$res = $cek->get_result();
if ($res->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Bab dengan id tersebut tidak ditemukan"]);
    $cek->close();
    $conn->close();
    exit;
}
$bab_lama = $res->fetch_assoc();
$cek->close();

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $kode_error = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    $pesan = ($kode_error === UPLOAD_ERR_INI_SIZE || $kode_error === UPLOAD_ERR_FORM_SIZE)
        ? "Ukuran file melebihi batas maksimum"
        : "File tidak ditemukan atau gagal diunggah";
    echo json_encode(["status" => "error", "message" => $pesan]);
    $conn->close();
    exit;
}

// Catatan: batas ini cuma dicek di kode PHP-nya. Hosting (php.ini)
// biasanya juga punya upload_max_filesize/post_max_size sendiri yang
// bisa lebih kecil -- kalau upload video besar tetap gagal padahal di
// bawah 100MB, itu batas dari hosting yang perlu dinaikkan juga.
$max_size = 100 * 1024 * 1024; // 100 MB
if ($_FILES['file']['size'] > $max_size) {
    echo json_encode(["status" => "error", "message" => "Ukuran file maksimal 100MB"]);
    $conn->close();
    exit;
}

$nama_asli = basename($_FILES['file']['name']);
$ekstensi = strtolower(pathinfo($nama_asli, PATHINFO_EXTENSION));
$ekstensi_diizinkan = ['mp4', 'webm', 'mov'];

if (!in_array($ekstensi, $ekstensi_diizinkan, true)) {
    echo json_encode(["status" => "error", "message" => "Tipe file tidak didukung. Gunakan .mp4, .webm, atau .mov"]);
    $conn->close();
    exit;
}

$folder_upload = __DIR__ . '/../../uploads/video/';
if (!is_dir($folder_upload)) {
    mkdir($folder_upload, 0755, true);
}

$nama_file_baru = 'bab_' . $bab_id . '_' . time() . '.' . $ekstensi;
$path_tujuan = $folder_upload . $nama_file_baru;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $path_tujuan)) {
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan file ke server"]);
    $conn->close();
    exit;
}

// Upload video menggantikan mode link -- video_url ikut dikosongkan.
$stmt = $conn->prepare("UPDATE bab SET video_file = ?, video_file_nama_asli = ?, video_url = NULL WHERE id = ?");
$stmt->bind_param("ssi", $nama_file_baru, $nama_asli, $bab_id);

if ($stmt->execute()) {
    if (!empty($bab_lama['video_file'])) {
        $path_lama = $folder_upload . $bab_lama['video_file'];
        if (is_file($path_lama)) {
            unlink($path_lama);
        }
    }

    echo json_encode([
        "status" => "success",
        "message" => "Video berhasil diunggah",
        "data" => [
            "video_file" => $nama_file_baru,
            "video_file_nama_asli" => $nama_asli,
            "url" => "uploads/video/" . $nama_file_baru
        ]
    ]);
} else {
    unlink($path_tujuan);
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
