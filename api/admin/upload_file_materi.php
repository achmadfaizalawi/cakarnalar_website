<?php
/**
 * admin/upload_file_materi.php
 * -----------------------------------------------------
 * Unggah SATU file PPT/PPTX/PDF materi untuk satu bab -- bisa dipanggil
 * berkali-kali untuk bab yang sama karena satu bab sekarang boleh
 * punya LEBIH DARI SATU file materi (tabel bab_file_materi), beda
 * dengan versi lama yang cuma menyimpan 1 file lewat kolom
 * bab.file_ppt (sudah dihapus, lihat migrasi di schema.sql).
 * Ini form-data (bukan JSON) karena mengirim file.
 *
 * Cara panggil: POST multipart/form-data
 *   - field "bab_id"  : id bab tujuan
 *   - field "file"    : file .ppt / .pptx / .pdf (maks 20MB)
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

$cek = $conn->prepare("SELECT id FROM bab WHERE id = ? LIMIT 1");
$cek->bind_param("i", $bab_id);
$cek->execute();
$res = $cek->get_result();
if ($res->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Bab dengan id tersebut tidak ditemukan"]);
    $cek->close();
    $conn->close();
    exit;
}
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

$max_size = 20 * 1024 * 1024; // 20 MB
if ($_FILES['file']['size'] > $max_size) {
    echo json_encode(["status" => "error", "message" => "Ukuran file maksimal 20MB"]);
    $conn->close();
    exit;
}

$nama_asli = basename($_FILES['file']['name']);
$ekstensi = strtolower(pathinfo($nama_asli, PATHINFO_EXTENSION));
$ekstensi_diizinkan = ['ppt', 'pptx', 'pdf'];

if (!in_array($ekstensi, $ekstensi_diizinkan, true)) {
    echo json_encode(["status" => "error", "message" => "Tipe file tidak didukung. Gunakan .ppt, .pptx, atau .pdf"]);
    $conn->close();
    exit;
}

$folder_upload = __DIR__ . '/../../uploads/ppt/';
if (!is_dir($folder_upload)) {
    mkdir($folder_upload, 0755, true);
}

// Nama file unik: bab_{id}_{waktu}_{acak}.{ekstensi} -- tambahan angka
// acak supaya tidak bentrok kalau admin sempat mengunggah lebih dari
// satu file materi dalam detik yang sama (dulu cuma "bab_{id}_{waktu}"
// karena maksimal 1 file per bab, sekarang bisa banyak).
$nama_file_baru = 'bab_' . $bab_id . '_' . time() . '_' . random_int(1000, 9999) . '.' . $ekstensi;
$path_tujuan = $folder_upload . $nama_file_baru;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $path_tujuan)) {
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan file ke server"]);
    $conn->close();
    exit;
}

$urutan_res = $conn->query("SELECT COALESCE(MAX(urutan), -1) + 1 AS urutan_baru FROM bab_file_materi WHERE bab_id = " . (int) $bab_id);
$urutan_baru = (int) $urutan_res->fetch_assoc()['urutan_baru'];

$stmt = $conn->prepare("INSERT INTO bab_file_materi (bab_id, nama_file, nama_asli, urutan) VALUES (?, ?, ?, ?)");
$stmt->bind_param("issi", $bab_id, $nama_file_baru, $nama_asli, $urutan_baru);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "message" => "File materi berhasil diunggah",
        "data" => [
            "id" => $stmt->insert_id,
            "nama_file" => $nama_file_baru,
            "nama_asli" => $nama_asli,
            "url" => "uploads/ppt/" . $nama_file_baru
        ]
    ]);
} else {
    // Gagal simpan ke DB -> file yang baru diupload jadi yatim, hapus lagi
    unlink($path_tujuan);
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
