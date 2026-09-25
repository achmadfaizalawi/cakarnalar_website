<?php
/**
 * submit_umpan_balik.php
 * -----------------------------------------------------
 * Terima jawaban Form Umpan Balik & Evaluasi Dampak Program (dari PDF
 * "Instrumen Evaluasi & Umpan Balik Program Cakar Nalar"). Cuma bisa
 * dikirim SEKALI per peserta (tabel umpan_balik punya UNIQUE KEY
 * user_id, sama pola dengan diagnostik_hasil/tryout_hasil) -- kalau
 * sudah pernah, sertifikat.html/umpan_balik.html seharusnya sudah tidak
 * lagi menampilkan form ini sama sekali (lihat get_umpan_balik.php),
 * tapi endpoint ini TETAP menolak percobaan kirim ulang di sisi server
 * (jangan percaya klien).
 *
 * Server SENGAJA memvalidasi ULANG syarat kelayakan (harus sudah
 * selesai semua rangkaian program, lihat
 * cn_sudah_selesai_semua_rangkaian() di api/config.php) -- supaya
 * peserta tidak bisa mengirim form ini lebih dulu sebelum benar-benar
 * berhak, cuma dengan memanggil endpoint ini langsung.
 *
 * Body JSON -- SEMUA field WAJIB diisi kecuali yang ditandai (opsional)
 * di komentar masing-masing constant di bawah:
 * {
 *   "user_id": 5,
 *   "kategori_peserta": "siswa_remaja",
 *   "jenis_kelamin": "laki_laki",
 *   "domisili": "Bandung",
 *   "durasi_medsos": "1_3_jam",
 *   "platform_medsos": ["whatsapp", "tiktok"],
 *   "hoaks_frekuensi": "sering",
 *   "pernah_tertipu": "pernah",
 *   "bab1_skor": 5, "bab2_skor": 4, "bab3_skor": 5, "bab4_skor": 4, "bab5_skor": 5,
 *   "maskot_skor": 5, "desain_skor": 4, "studi_kasus_skor": 5, "lembar_kerja_skor": 4,
 *   "kepercayaan_verifikasi": 4,
 *   "tingkat_sebelum": "unreflective", "tingkat_sesudah": "practicing",
 *   "tindakan_nyata": ["stop_think", "cek_fakta_silang"],
 *   "format_media": ["aplikasi_interaktif"],
 *   "fitur_baru": ["bot_whatsapp", "bank_soal_sertifikat"],
 *   "nps": 9,
 *   "materi_bermanfaat": "...",
 *   "kritik_saran": "...",
 *   "pesan_kesan": "..."
 * }
 * (Semua field WAJIB diisi, TERMASUK 3 field teks bebas di atas -- tidak
 * ada lagi yang opsional, lihat validasi materi_bermanfaat/kritik_saran/
 * pesan_kesan di bawah.)
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

// Daftar pilihan valid (whitelist) tiap field single/multi-select --
// HARUS SAMA PERSIS dengan opsi yang dirender di umpan_balik.html/
// js/umpan_balik.js (value atribut input). Diubah di SATU tempat kalau
// suatu saat opsinya berubah, jangan lupa samakan juga di frontend.
const CN_UB_KATEGORI_PESERTA = ['siswa_remaja', 'mahasiswa_pemuda', 'umum_dewasa', 'pendidik_orang_tua'];
const CN_UB_JENIS_KELAMIN = ['laki_laki', 'perempuan'];
const CN_UB_DURASI_MEDSOS = ['kurang_1_jam', '1_3_jam', '3_5_jam', 'lebih_5_jam'];
const CN_UB_PLATFORM_MEDSOS = ['whatsapp', 'tiktok', 'instagram', 'youtube', 'x_twitter', 'facebook'];
const CN_UB_HOAKS_FREKUENSI = ['hampir_setiap_hari', 'sering', 'kadang_kadang', 'jarang'];
const CN_UB_PERNAH_TERTIPU = ['pernah', 'tidak_pernah', 'tidak_tahu'];
// Cuma 3 pilihan (BUKAN 4) -- SENGAJA DISAMAKAN dengan rubrik klasifikasi
// Final Tryout yang sudah ada ($rubrik_tryout di api/get_sertifikat.php &
// daftarRangeSkorTryout di js/quiz.js): "Practicing" & "Master Thinker"
// digabung jadi SATU kategori "practicing_master" (bukan 2 kategori
// terpisah) supaya istilah yang dilihat peserta di form ini KONSISTEN
// dengan istilah yang mereka lihat di hasil Tryout/sertifikat mereka
// sendiri, bukan skala yang berbeda sendiri.
const CN_UB_TINGKAT_BERPIKIR = ['unreflective', 'challenged', 'practicing_master'];
const CN_UB_TINDAKAN_NYATA = ['stop_think', 'cek_fakta_silang', 'tegur_japri', 'hindari_ad_hominem', 'jadi_agen_edukasi'];
const CN_UB_FORMAT_MEDIA = ['aplikasi_interaktif', 'video_pendek', 'podcast_audio', 'modul_cetak', 'pelatihan_luring'];
const CN_UB_FITUR_BARU = ['bot_whatsapp', 'bank_soal_sertifikat', 'forum_komunitas', 'panduan_etika'];

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$user_id = isset($data['user_id']) ? (int) $data['user_id'] : 0;
if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$user_ada = $stmt->get_result()->num_rows > 0;
$stmt->close();
if (!$user_ada) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

if (!cn_sudah_selesai_semua_rangkaian($conn, $user_id)) {
    echo json_encode([
        "status" => "error",
        "message" => "Form ini baru bisa diisi setelah seluruh rangkaian Program Cakar Nalar (Tes Diagnostik, semua Bab, dan Final Tryout) selesai dan lulus."
    ]);
    $conn->close();
    exit;
}

// --- Cegah pengisian ganda ---
$stmt = $conn->prepare("SELECT id FROM umpan_balik WHERE user_id = ? LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
if ($stmt->get_result()->num_rows > 0) {
    echo json_encode(["status" => "error", "message" => "Kamu sudah pernah mengisi Form Umpan Balik ini sebelumnya."]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

/**
 * Helper-helper validasi kecil, semua mengembalikan pesan error
 * (string) kalau tidak valid, atau null kalau valid -- dikumpulkan ke
 * $error, baru yang PERTAMA ditemukan dikirim balik ke peserta (bukan
 * gagal diam-diam / cuma sebagian tersimpan).
 */
function cn_ub_pilihan(array $data, string $key, array $whitelist, string $label): ?string
{
    $val = $data[$key] ?? null;
    if (!is_string($val) || !in_array($val, $whitelist, true)) {
        return "$label tidak valid atau belum dipilih.";
    }
    return null;
}

function cn_ub_multi_pilihan(array $data, string $key, array $whitelist, string $label, int $min, ?int $max): ?string
{
    $val = $data[$key] ?? null;
    if (!is_array($val)) {
        return "$label tidak valid.";
    }
    $val = array_values(array_unique($val));
    if (count($val) < $min) {
        return "$label wajib dipilih minimal $min.";
    }
    if ($max !== null && count($val) > $max) {
        return "$label maksimal dipilih $max.";
    }
    foreach ($val as $v) {
        if (!is_string($v) || !in_array($v, $whitelist, true)) {
            return "$label mengandung pilihan yang tidak valid.";
        }
    }
    return null;
}

function cn_ub_skala(array $data, string $key, int $min, int $max, string $label): ?string
{
    $val = $data[$key] ?? null;
    if (!is_int($val) && !(is_string($val) && ctype_digit($val))) {
        return "$label wajib diisi angka.";
    }
    $val = (int) $val;
    if ($val < $min || $val > $max) {
        return "$label harus antara $min - $max.";
    }
    return null;
}

$error = null;
$error = $error ?? cn_ub_pilihan($data, 'kategori_peserta', CN_UB_KATEGORI_PESERTA, 'Kategori Peserta');
$error = $error ?? cn_ub_pilihan($data, 'jenis_kelamin', CN_UB_JENIS_KELAMIN, 'Jenis Kelamin');
$error = $error ?? (trim((string) ($data['domisili'] ?? '')) === '' ? 'Domisili wajib diisi.' : null);
$error = $error ?? cn_ub_pilihan($data, 'durasi_medsos', CN_UB_DURASI_MEDSOS, 'Durasi Penggunaan Media Sosial');
$error = $error ?? cn_ub_multi_pilihan($data, 'platform_medsos', CN_UB_PLATFORM_MEDSOS, 'Platform Media Utama', 1, null);
$error = $error ?? cn_ub_pilihan($data, 'hoaks_frekuensi', CN_UB_HOAKS_FREKUENSI, 'Frekuensi Menerima Hoaks');
$error = $error ?? cn_ub_pilihan($data, 'pernah_tertipu', CN_UB_PERNAH_TERTIPU, 'Pengalaman Tertipu Hoaks/Phishing');

foreach (['bab1_skor', 'bab2_skor', 'bab3_skor', 'bab4_skor', 'bab5_skor'] as $i => $key) {
    $error = $error ?? cn_ub_skala($data, $key, 1, 5, 'Penilaian Bab ' . ($i + 1));
}
foreach (['maskot_skor' => 'Penilaian Maskot Pendamping', 'desain_skor' => 'Penilaian Daya Tarik Desain', 'studi_kasus_skor' => 'Penilaian Kesesuaian Studi Kasus', 'lembar_kerja_skor' => 'Penilaian Kegunaan Lembar Kerja'] as $key => $label) {
    $error = $error ?? cn_ub_skala($data, $key, 1, 5, $label);
}

$error = $error ?? cn_ub_skala($data, 'kepercayaan_verifikasi', 1, 5, 'Tingkat Kepercayaan Diri Verifikasi Berita');
$error = $error ?? cn_ub_pilihan($data, 'tingkat_sebelum', CN_UB_TINGKAT_BERPIKIR, 'Tingkatan Berpikir Kritis SEBELUM');
$error = $error ?? cn_ub_pilihan($data, 'tingkat_sesudah', CN_UB_TINGKAT_BERPIKIR, 'Tingkatan Berpikir Kritis SESUDAH');
$error = $error ?? cn_ub_multi_pilihan($data, 'tindakan_nyata', CN_UB_TINDAKAN_NYATA, 'Tindakan Nyata', 1, null);
$error = $error ?? cn_ub_multi_pilihan($data, 'format_media', CN_UB_FORMAT_MEDIA, 'Format Media Pembelajaran', 1, null);
$error = $error ?? cn_ub_multi_pilihan($data, 'fitur_baru', CN_UB_FITUR_BARU, 'Fitur Baru', 1, 2);
$error = $error ?? cn_ub_skala($data, 'nps', 1, 10, 'Skor Rekomendasi (NPS)');

// Field teks bebas -- SEKARANG WAJIB semua (tidak ada lagi yang opsional),
// jadi ikut divalidasi "tidak boleh kosong" di sini, SEBELUM $error dicek
// di bawah -- supaya kalau kosong, pesannya ikut ditolak dengan pesan yang
// jelas, bukan diam-diam disimpan sebagai NULL seperti sebelumnya.
$materi_bermanfaat = trim((string) ($data['materi_bermanfaat'] ?? ''));
$kritik_saran = trim((string) ($data['kritik_saran'] ?? ''));
$pesan_kesan = trim((string) ($data['pesan_kesan'] ?? ''));
$error = $error ?? ($materi_bermanfaat === '' ? 'Materi Paling Bermanfaat wajib diisi.' : null);
$error = $error ?? ($kritik_saran === '' ? 'Kritik & Saran wajib diisi.' : null);
$error = $error ?? ($pesan_kesan === '' ? 'Pesan & Kesan wajib diisi.' : null);

if ($error !== null) {
    echo json_encode(["status" => "error", "message" => $error]);
    $conn->close();
    exit;
}

$domisili = trim((string) $data['domisili']);
$platform_medsos_json = json_encode(array_values(array_unique($data['platform_medsos'])));
$tindakan_nyata_json = json_encode(array_values(array_unique($data['tindakan_nyata'])));
$format_media_json = json_encode(array_values(array_unique($data['format_media'])));
$fitur_baru_json = json_encode(array_values(array_unique($data['fitur_baru'])));

$stmt = $conn->prepare("
    INSERT INTO umpan_balik (
        user_id, kategori_peserta, jenis_kelamin, domisili, durasi_medsos, platform_medsos,
        hoaks_frekuensi, pernah_tertipu,
        bab1_skor, bab2_skor, bab3_skor, bab4_skor, bab5_skor,
        maskot_skor, desain_skor, studi_kasus_skor, lembar_kerja_skor,
        kepercayaan_verifikasi, tingkat_sebelum, tingkat_sesudah, tindakan_nyata,
        format_media, fitur_baru, nps,
        materi_bermanfaat, kritik_saran, pesan_kesan
    ) VALUES (?,?,?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?)
");
$stmt->bind_param(
    "isssssssiiiiiiiiiisssssisss",
    $user_id,
    $data['kategori_peserta'],
    $data['jenis_kelamin'],
    $domisili,
    $data['durasi_medsos'],
    $platform_medsos_json,
    $data['hoaks_frekuensi'],
    $data['pernah_tertipu'],
    $data['bab1_skor'],
    $data['bab2_skor'],
    $data['bab3_skor'],
    $data['bab4_skor'],
    $data['bab5_skor'],
    $data['maskot_skor'],
    $data['desain_skor'],
    $data['studi_kasus_skor'],
    $data['lembar_kerja_skor'],
    $data['kepercayaan_verifikasi'],
    $data['tingkat_sebelum'],
    $data['tingkat_sesudah'],
    $tindakan_nyata_json,
    $format_media_json,
    $fitur_baru_json,
    $data['nps'],
    $materi_bermanfaat,
    $kritik_saran,
    $pesan_kesan
);

if ($stmt->execute()) {
    echo json_encode([
        "status" => "success",
        "message" => "Terima kasih! Umpan balikmu berhasil tersimpan. Sertifikat sekarang bisa diunduh."
    ]);
} else {
    // Kemungkinan besar karena UNIQUE KEY (race condition: submit dobel bersamaan)
    echo json_encode(["status" => "error", "message" => "Kamu sudah pernah mengisi Form Umpan Balik ini sebelumnya."]);
}

$stmt->close();
$conn->close();
?>