<?php
/**
 * admin/save_bab.php
 * -----------------------------------------------------
 * Tambah bab BARU atau ubah bab yang sudah ada (nomor urut, judul,
 * ringkasan, teks materi, link video). Jumlah bab TIDAK lagi tetap --
 * admin bebas menambah sebanyak yang dibutuhkan lewat endpoint ini.
 * Untuk file materi (bisa lebih dari satu) & video hasil upload,
 * dipisah lewat api/admin/upload_file_materi.php & upload_video.php
 * karena itu upload file (multipart), bukan JSON biasa -- dan hanya
 * bisa dipakai setelah bab-nya tersimpan (punya id).
 *
 * Body JSON:
 * {
 *   "id": 1,                     // kosongkan/0 untuk membuat bab BARU
 *   "nomor": 7,                  // wajib, urutan tampil & unik
 *   "judul": "...",
 *   "ringkasan": "...",
 *   "konten_materi": "...",      // opsional, teks materi bacaan
 *   "video_url": "https://...",  // opsional, boleh dikosongkan
 *   "ada_kuis": true,            // opsional, default true (Kuis per Bab
 *                                // wajib dikerjakan sebelum lanjut bab
 *                                // berikutnya). Kalau false, peserta
 *                                // otomatis lulus begitu materi dibaca.
 *   "nilai_minimal": 70,         // opsional, kosongkan/null untuk TANPA
 *                                // syarat skor (asal kuisnya dikerjakan
 *                                // langsung lulus). Kalau diisi, peserta
 *                                // wajib dapat skor >= nilai ini.
 *   "petunjuk_kuis": "..."       // opsional, petunjuk pengerjaan kuis bab
 *                                // ini, ditampilkan di atas soal di kuis.html
 * }
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
$nomor = isset($data['nomor']) ? (int) $data['nomor'] : 0;
$judul = trim($data['judul'] ?? '');
$ringkasan = trim($data['ringkasan'] ?? '');
$konten_materi = $data['konten_materi'] ?? '';
$petunjuk_kuis = $data['petunjuk_kuis'] ?? '';
$video_url = trim($data['video_url'] ?? '');
$ada_kuis = array_key_exists('ada_kuis', $data) ? ($data['ada_kuis'] ? 1 : 0) : 1;
$nilai_minimal_raw = $data['nilai_minimal'] ?? null;
$nilai_minimal = ($nilai_minimal_raw !== null && $nilai_minimal_raw !== '') ? (int) $nilai_minimal_raw : null;
if ($nilai_minimal !== null && ($nilai_minimal < 0 || $nilai_minimal > 100)) {
    echo json_encode(["status" => "error", "message" => "Nilai minimal harus di antara 0-100"]);
    $conn->close();
    exit;
}

// Batas waktu pengerjaan Kuis per Bab (opsional) -- NULL berarti tanpa
// batas waktu, sama seperti pola "nilai_minimal" & pengaturan_tes.durasi_menit
// di atas. Kalau diisi, wajib bilangan bulat positif (menit).
$durasi_kuis_menit_raw = $data['durasi_kuis_menit'] ?? null;
$durasi_kuis_menit = ($durasi_kuis_menit_raw !== null && $durasi_kuis_menit_raw !== '') ? (int) $durasi_kuis_menit_raw : null;
if ($durasi_kuis_menit !== null && $durasi_kuis_menit <= 0) {
    echo json_encode(["status" => "error", "message" => "Durasi kuis harus lebih dari 0 menit"]);
    $conn->close();
    exit;
}

if ($nomor <= 0) {
    echo json_encode(["status" => "error", "message" => "Nomor urut wajib diisi (angka lebih dari 0)"]);
    $conn->close();
    exit;
}
if ($judul === '' || $ringkasan === '') {
    echo json_encode(["status" => "error", "message" => "Judul dan ringkasan wajib diisi"]);
    $conn->close();
    exit;
}

$video_url_param = $video_url === '' ? null : $video_url;

// Nomor urut harus unik -- cek dulu, tidak termasuk baris milik sendiri
// (supaya nyimpen ulang bab yang sama dengan nomor tidak berubah tidak
// ikut ditolak).
$cekNomor = $conn->prepare("SELECT id FROM bab WHERE nomor = ? AND id != ? LIMIT 1");
$cekNomor->bind_param("ii", $nomor, $id);
$cekNomor->execute();
if ($cekNomor->get_result()->num_rows > 0) {
    echo json_encode(["status" => "error", "message" => "Nomor urut $nomor sudah dipakai bab lain. Pakai nomor lain."]);
    $cekNomor->close();
    $conn->close();
    exit;
}
$cekNomor->close();

if ($id > 0) {
    // ----- UBAH bab yang sudah ada -----
    $cek = $conn->prepare("SELECT id FROM bab WHERE id = ? LIMIT 1");
    $cek->bind_param("i", $id);
    $cek->execute();
    if ($cek->get_result()->num_rows === 0) {
        echo json_encode(["status" => "error", "message" => "Bab dengan id tersebut tidak ditemukan"]);
        $cek->close();
        $conn->close();
        exit;
    }
    $cek->close();

    $stmt = $conn->prepare("UPDATE bab SET nomor=?, judul=?, ringkasan=?, konten_materi=?, video_url=?, ada_kuis=?, nilai_minimal=?, petunjuk_kuis=?, durasi_kuis_menit=? WHERE id=?");
    $stmt->bind_param("issssiisii", $nomor, $judul, $ringkasan, $konten_materi, $video_url_param, $ada_kuis, $nilai_minimal, $petunjuk_kuis, $durasi_kuis_menit, $id);

    if ($stmt->execute()) {
        // Durasi kuis bab ini bisa saja baru diubah (dinyalakan/dimatikan/
        // diganti angkanya) -- hapus semua catatan "waktu mulai" kuis
        // peserta yang MUNGKIN masih berjalan untuk bab ini, supaya timer
        // siapapun yang sedang mengerjakan otomatis dihitung ulang dari
        // awal memakai durasi yang baru saja disimpan, bukan durasi lama.
        $hapusWaktu = $conn->prepare("DELETE FROM kuis_waktu WHERE bab_id = ?");
        $hapusWaktu->bind_param("i", $id);
        $hapusWaktu->execute();
        $hapusWaktu->close();

        echo json_encode(["status" => "success", "message" => "Materi berhasil diperbarui", "data" => ["id" => $id]]);
    } else {
        echo json_encode(["status" => "error", "message" => $stmt->error]);
    }
    $stmt->close();
} else {
    // ----- TAMBAH bab baru -----
    $stmt = $conn->prepare("INSERT INTO bab (nomor, judul, ringkasan, konten_materi, video_url, ada_kuis, nilai_minimal, petunjuk_kuis, durasi_kuis_menit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("issssiisi", $nomor, $judul, $ringkasan, $konten_materi, $video_url_param, $ada_kuis, $nilai_minimal, $petunjuk_kuis, $durasi_kuis_menit);

    if ($stmt->execute()) {
        echo json_encode([
            "status" => "success",
            "message" => "Materi baru berhasil ditambahkan",
            "data" => ["id" => $conn->insert_id]
        ]);
    } else {
        echo json_encode(["status" => "error", "message" => $stmt->error]);
    }
    $stmt->close();
}

$conn->close();
?>