<?php
/**
 * admin/reset_peserta_progres.php
 * -----------------------------------------------------
 * Reset progres/hasil seorang peserta supaya bisa mengulang dari awal
 * (mis. ada kendala teknis saat mengerjakan). Menghapus baris terkait
 * di database -- TIDAK BISA DIURUNGKAN, makanya konfirmasi wajib
 * dilakukan di sisi Panel Admin sebelum memanggil endpoint ini.
 *
 * Body JSON:
 * { "user_id": 5, "target": "diagnostik" | "tryout" | "bab:<bab_id>" | "semua" }
 *
 * - "diagnostik" : hapus hasil + waktu mulai Tes Diagnostik peserta ini
 * - "tryout"     : hapus hasil + waktu mulai Final Tryout peserta ini
 * - "bab:<id>"   : hapus progres (dibaca/lulus), semua riwayat kuis, &
 *                  waktu mulai kuis peserta ini KHUSUS bab tsb (bab
 *                  sesudahnya otomatis terkunci lagi kalau syaratnya
 *                  bab ini lulus -- bukan bug, cara kerja normal)
 * - "semua"      : hapus SEMUA hal di atas untuk peserta ini (reset
 *                  total, seperti akun baru daftar)
 *
 * Semua target di atas SELALU ikut menghapus respons Form Umpan Balik
 * peserta ini kalau ada (lihat cn_hapus_umpan_balik() di bawah) --
 * keempatnya membuat cn_sudah_selesai_semua_rangkaian() di api/config.php
 * jadi false lagi, jadi peserta wajib mengisi ulang Form Umpan Balik
 * setelah berhasil menyelesaikan rangkaiannya lagi (tabel "umpan_balik"
 * cuma boleh 1 baris per peserta -- kalau baris lama dibiarkan, submit
 * yang baru akan selalu ditolak).
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

$user_id = isset($data['user_id']) ? (int) $data['user_id'] : 0;
$target = $data['target'] ?? '';

if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$ada = $stmt->get_result()->num_rows > 0;
$stmt->close();
if (!$ada) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

function cn_hapus_diagnostik(mysqli $conn, int $user_id): void
{
    $stmt = $conn->prepare("DELETE FROM diagnostik_hasil WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM diagnostik_waktu WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
}

function cn_hapus_tryout(mysqli $conn, int $user_id): void
{
    $stmt = $conn->prepare("DELETE FROM tryout_hasil WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM tryout_waktu WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
}

function cn_hapus_bab(mysqli $conn, int $user_id, int $bab_id): void
{
    $stmt = $conn->prepare("DELETE FROM progres WHERE user_id = ? AND bab_id = ?");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM hasil_kuis WHERE user_id = ? AND bab_id = ?");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM kuis_waktu WHERE user_id = ? AND bab_id = ?");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $stmt->close();
}

// Dipanggil di SEMUA jenis reset di bawah (diagnostik/per-bab/tryout/semua)
// -- keempatnya sama-sama membuat cn_sudah_selesai_semua_rangkaian() di
// api/config.php jadi false lagi (syarat Tes Diagnostik selesai + SEMUA bab
// lulus + Final Tryout lulus jadi tidak terpenuhi), jadi peserta otomatis
// wajib mengulang rangkaian itu dari bagian yang direset sebelum bisa akses
// Form Umpan Balik/sertifikat lagi. Respons umpan balik LAMA (kalau ada)
// wajib ikut dihapus di sini -- tabel "umpan_balik" punya UNIQUE KEY
// "user_id" (lihat submit_umpan_balik.php), jadi kalau baris lama
// dibiarkan, peserta yang sudah berhasil menyelesaikan ulang rangkaiannya
// tetap tidak akan bisa mengisi umpan balik yang baru (submit-nya selalu
// ditolak "sudah pernah mengisi").
function cn_hapus_umpan_balik(mysqli $conn, int $user_id): void
{
    $stmt = $conn->prepare("DELETE FROM umpan_balik WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
}

if ($target === 'diagnostik') {
    cn_hapus_diagnostik($conn, $user_id);
    cn_hapus_umpan_balik($conn, $user_id);
    $pesan = "Tes Diagnostik peserta ini berhasil direset. Peserta bisa mengerjakan ulang dari awal. Respons Umpan Balik lama (jika ada) ikut dihapus karena peserta wajib mengisi ulang setelah menyelesaikan rangkaian lagi.";
} elseif ($target === 'tryout') {
    cn_hapus_tryout($conn, $user_id);
    cn_hapus_umpan_balik($conn, $user_id);
    $pesan = "Final Tryout peserta ini berhasil direset. Peserta bisa mengerjakan ulang dari awal. Respons Umpan Balik lama (jika ada) ikut dihapus karena peserta wajib mengisi ulang setelah lulus tryout lagi.";
} elseif (strpos($target, 'bab:') === 0) {
    $bab_id = (int) substr($target, 4);
    if ($bab_id <= 0) {
        echo json_encode(["status" => "error", "message" => "Target bab tidak valid"]);
        $conn->close();
        exit;
    }
    cn_hapus_bab($conn, $user_id, $bab_id);
    cn_hapus_umpan_balik($conn, $user_id);
    $pesan = "Progres bab ini berhasil direset. Peserta akan dianggap belum membaca materi & belum mengerjakan kuisnya. Respons Umpan Balik lama (jika ada) ikut dihapus karena peserta wajib mengisi ulang setelah semua bab lulus lagi.";
} elseif ($target === 'semua') {
    cn_hapus_diagnostik($conn, $user_id);
    cn_hapus_tryout($conn, $user_id);
    $stmt = $conn->prepare("DELETE FROM progres WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM hasil_kuis WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM kuis_waktu WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    cn_hapus_umpan_balik($conn, $user_id);
    $pesan = "Seluruh progres peserta ini berhasil direset total, seperti baru mendaftar. Respons Umpan Balik lama (jika ada) ikut dihapus.";
} else {
    echo json_encode(["status" => "error", "message" => "Target reset tidak valid"]);
    $conn->close();
    exit;
}

echo json_encode(["status" => "success", "message" => $pesan]);

$conn->close();
?>