<?php
/**
 * get_materi.php
 * -----------------------------------------------------
 * Ambil materi satu bab untuk PESERTA (teks materi, video link/upload,
 * daftar file materi PPT/PPTX/PDF -- bisa lebih dari satu).
 * Otomatis menandai progres.materi_dibaca = 1 saat berhasil dibuka.
 *
 * Cara panggil: GET api/get_materi.php?bab_id=1&user_id=5
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

$bab_id = isset($_GET['bab_id']) ? (int) $_GET['bab_id'] : 0;
$user_id = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;

if ($bab_id <= 0 || $user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "bab_id dan user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, nomor, judul, ringkasan, konten_materi, video_url, video_file, video_file_nama_asli, ada_kuis, nilai_minimal, durasi_kuis_menit FROM bab WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $bab_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["status" => "error", "message" => "Bab tidak ditemukan"]);
    $stmt->close();
    $conn->close();
    exit;
}

$bab = $result->fetch_assoc();
$stmt->close();

if (cn_bab_locked($conn, $user_id, (int) $bab['nomor'])) {
    echo json_encode(["status" => "error", "message" => "Bab ini masih terkunci"]);
    $conn->close();
    exit;
}

// --- Tandai materi sudah dibaca (insert kalau belum ada baris progres) ---
// Kalau bab ini TIDAK punya kuis (ada_kuis = 0), tidak ada yang perlu
// dikerjakan lagi untuk melanjutkan ke bab berikutnya -- peserta otomatis
// dianggap LULUS begitu materinya dibuka. Kalau ADA kuis, perilaku lama
// tetap dipakai: lulus hanya diset lewat submit_kuis.php.
$ada_kuis = (bool) $bab['ada_kuis'];

if ($ada_kuis) {
    $stmt = $conn->prepare("
        INSERT INTO progres (user_id, bab_id, materi_dibaca, lulus)
        VALUES (?, ?, 1, 0)
        ON DUPLICATE KEY UPDATE materi_dibaca = 1
    ");
    $stmt->bind_param("ii", $user_id, $bab_id);
} else {
    $stmt = $conn->prepare("
        INSERT INTO progres (user_id, bab_id, materi_dibaca, lulus)
        VALUES (?, ?, 1, 1)
        ON DUPLICATE KEY UPDATE materi_dibaca = 1, lulus = 1
    ");
    $stmt->bind_param("ii", $user_id, $bab_id);
}
$stmt->execute();
$stmt->close();

// Sudah pernah mengerjakan (submit) kuis bab ini sebelumnya? Dipakai
// materi.js (lihat sudahMulaiKuisBab()) supaya dialog konfirmasi "Mulai
// Kuis Sekarang?" tidak muncul lagi buat peserta yang sudah pernah
// mencoba -- sebelumnya itu cuma dicek dari localStorage (yang KEHAPUS
// begitu peserta submit, lihat clearQuizProgress() di js/quiz.js), jadi
// begitu peserta submit lalu langsung "Kembali ke Dashboard" (bukan klik
// "Coba Lagi" dulu), penanda localStorage-nya ikut hilang dan dialog
// konfirmasi itu muncul lagi padahal sudah berkali-kali mengerjakan.
// Query dari tabel hasil_kuis (sumber data server, tidak ikut kehapus)
// supaya tandanya PERMANEN, bukan cuma sementara di localStorage.
$sudah_pernah_kuis = false;
if ($ada_kuis) {
    $pk_stmt = $conn->prepare("SELECT 1 FROM hasil_kuis WHERE user_id = ? AND bab_id = ? LIMIT 1");
    $pk_stmt->bind_param("ii", $user_id, $bab_id);
    $pk_stmt->execute();
    $sudah_pernah_kuis = $pk_stmt->get_result()->num_rows > 0;
    $pk_stmt->close();
}

// Bab selanjutnya (nomor + 1), kalau ada -- dipakai materi.js supaya
// tulisan CTA "... supaya bab berikutnya terbuka." cuma muncul kalau
// memang ADA bab sesudah bab ini (lihat pola yang sama di get_soal.php
// untuk Kuis per Bab).
$bab_selanjutnya = null;
$nomor_berikutnya = (int) $bab['nomor'] + 1;
$nb_stmt = $conn->prepare("SELECT id FROM bab WHERE nomor = ? LIMIT 1");
$nb_stmt->bind_param("i", $nomor_berikutnya);
$nb_stmt->execute();
$nb_row = $nb_stmt->get_result()->fetch_assoc();
$nb_stmt->close();
if ($nb_row) {
    $bab_selanjutnya = ["id" => (int) $nb_row['id']];
}

// Daftar file materi (bisa lebih dari satu) bab ini.
$file_materi = [];
$fm_stmt = $conn->prepare("SELECT nama_file, nama_asli FROM bab_file_materi WHERE bab_id = ? ORDER BY urutan ASC, id ASC");
$fm_stmt->bind_param("i", $bab_id);
$fm_stmt->execute();
$fm_res = $fm_stmt->get_result();
while ($fm_row = $fm_res->fetch_assoc()) {
    $file_materi[] = [
        "nama_asli" => $fm_row['nama_asli'],
        "url" => "uploads/ppt/" . $fm_row['nama_file']
    ];
}
$fm_stmt->close();

echo json_encode([
    "status" => "success",
    "data" => [
        "id" => (int) $bab['id'],
        "nomor" => (int) $bab['nomor'],
        "judul" => $bab['judul'],
        "ringkasan" => $bab['ringkasan'],
        "konten_materi" => $bab['konten_materi'],
        "video_url" => $bab['video_url'],
        "video_file_url" => $bab['video_file'] ? 'uploads/video/' . $bab['video_file'] : null,
        "ada_kuis" => $ada_kuis,
        "sudah_pernah_kuis" => $sudah_pernah_kuis,
        "nilai_minimal" => $bab['nilai_minimal'] !== null ? (int) $bab['nilai_minimal'] : null,
        "durasi_kuis_menit" => $bab['durasi_kuis_menit'] !== null ? (int) $bab['durasi_kuis_menit'] : null,
        "bab_selanjutnya" => $bab_selanjutnya,
        "file_materi" => $file_materi
    ]
]);

$conn->close();
?>