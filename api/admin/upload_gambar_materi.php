<?php
/**
 * admin/upload_gambar_materi.php
 * -----------------------------------------------------
 * Unggah SATU gambar untuk disisipkan langsung ke dalam teks materi
 * (editor rich text di Panel Admin, tombol "Sisip Gambar") -- beda
 * dengan upload_file_materi.php (itu untuk file PPT/PPTX/PDF yang
 * ditautkan terpisah di bawah materi, bukan disisipkan ke tengah teks).
 *
 * Tidak ada baris database untuk gambar ini -- begitu diunggah, URL-nya
 * langsung ditulis sebagai tag <img> di dalam konten_materi (HTML) yang
 * disimpan lewat save_bab.php, sama seperti bold/italic/daftar dkk yang
 * juga cuma markup di dalam teks itu, bukan baris terpisah.
 *
 * Cara panggil: POST multipart/form-data
 *   - field "file" : gambar .jpg/.jpeg/.png/.gif/.webp (maks 5MB)
 *
 * Balikan sukses: {"status":"success","data":{"url":"uploads/materi-gambar/xxx.jpg"}}
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

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $kode_error = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    $pesan = ($kode_error === UPLOAD_ERR_INI_SIZE || $kode_error === UPLOAD_ERR_FORM_SIZE)
        ? "Ukuran gambar melebihi batas maksimum"
        : "File tidak ditemukan atau gagal diunggah";
    echo json_encode(["status" => "error", "message" => $pesan]);
    $conn->close();
    exit;
}

$max_size = 5 * 1024 * 1024; // 5 MB -- gambar disisipkan di tengah teks, cukup dibatasi lebih kecil dari file materi (PPT/PDF)
if ($_FILES['file']['size'] > $max_size) {
    echo json_encode(["status" => "error", "message" => "Ukuran gambar maksimal 5MB"]);
    $conn->close();
    exit;
}

$nama_asli = basename($_FILES['file']['name']);
$ekstensi = strtolower(pathinfo($nama_asli, PATHINFO_EXTENSION));
$ekstensi_diizinkan = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

if (!in_array($ekstensi, $ekstensi_diizinkan, true)) {
    echo json_encode(["status" => "error", "message" => "Tipe file tidak didukung. Gunakan .jpg, .png, .gif, atau .webp"]);
    $conn->close();
    exit;
}

// Verifikasi isi filenya BENAR gambar (bukan cuma nama file yang
// diakali jadi berekstensi gambar) -- getimagesize() gagal (false)
// kalau bukan gambar asli.
if (@getimagesize($_FILES['file']['tmp_name']) === false) {
    echo json_encode(["status" => "error", "message" => "File yang diunggah bukan gambar yang valid"]);
    $conn->close();
    exit;
}

$folder_upload = __DIR__ . '/../../uploads/materi-gambar/';
if (!is_dir($folder_upload)) {
    mkdir($folder_upload, 0755, true);
}

// Nama file acak sepenuhnya (bukan berdasar bab_id) -- gambar ini bisa
// disisipkan berkali-kali di teks yang sama sebelum bab-nya disimpan
// (belum tentu sudah punya id kalau bab baru), jadi tidak dikaitkan ke
// bab_id sama sekali di sini.
$nama_file_baru = 'materi_' . time() . '_' . random_int(100000, 999999) . '.' . $ekstensi;
$path_tujuan = $folder_upload . $nama_file_baru;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $path_tujuan)) {
    echo json_encode(["status" => "error", "message" => "Gagal menyimpan gambar ke server"]);
    $conn->close();
    exit;
}

echo json_encode([
    "status" => "success",
    "message" => "Gambar berhasil diunggah",
    "data" => [
        "url" => "uploads/materi-gambar/" . $nama_file_baru
    ]
]);

$conn->close();
?>
