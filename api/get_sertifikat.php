<?php
/**
 * get_sertifikat.php
 * -----------------------------------------------------
 * Data buat halaman sertifikat.html (nama peserta, skor & klasifikasi
 * Final Tryout, tanggal selesai, nomor sertifikat) -- HANYA berhasil
 * kalau peserta ini SUDAH BENAR-BENAR menyelesaikan SELURUH rangkaian
 * program (Tes Diagnostik + 6 Bab lulus + Final Tryout lulus), SAMA
 * PERSIS syarat "100%" yang dipakai renderProgress() di js/dashboard.js
 * -- endpoint ini SENGAJA mengecek ulang ke database sendiri (bukan
 * percaya begitu saja ke query string/localStorage), supaya peserta
 * tidak bisa "mengakali" dapat sertifikat cuma dengan membuka
 * sertifikat.html langsung sebelum semua syarat itu benar-benar
 * terpenuhi di server.
 *
 * Nomor sertifikat SENGAJA tidak disimpan di tabel baru -- diturunkan
 * (deterministik) dari tanggal Final Tryout dinyatakan lulus + id akun
 * peserta, jadi selalu sama tiap kali endpoint ini dipanggil ulang oleh
 * peserta yang sama, tanpa perlu migrasi skema database.
 *
 * Cara panggil: GET api/get_sertifikat.php?user_id=5
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

$user_id = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
if ($user_id <= 0) {
    echo json_encode(["status" => "error", "message" => "user_id wajib diisi"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, name FROM users WHERE id = ? AND role = 'peserta' LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$user_row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user_row) {
    echo json_encode(["status" => "error", "message" => "Peserta tidak ditemukan"]);
    $conn->close();
    exit;
}

// --- Syarat 1: Tes Diagnostik sudah dikerjakan ---
$stmt = $conn->prepare("SELECT COUNT(*) AS c FROM diagnostik_hasil WHERE user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$diagnostik_selesai = ((int) $stmt->get_result()->fetch_assoc()['c']) > 0;
$stmt->close();

// --- Syarat 2: SEMUA bab berstatus lulus ---
$total_bab = (int) $conn->query("SELECT COUNT(*) AS c FROM bab")->fetch_assoc()['c'];
$stmt = $conn->prepare("SELECT COUNT(*) AS c FROM progres WHERE user_id = ? AND lulus = 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$bab_lulus_count = (int) $stmt->get_result()->fetch_assoc()['c'];
$stmt->close();
$semua_bab_lulus = $total_bab > 0 && $bab_lulus_count >= $total_bab;

// --- Syarat 3: Final Tryout sudah lulus (percobaan TERAKHIR, sama pola
//     dengan get_tryout.php) ---
$stmt = $conn->prepare("SELECT skor, created_at FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$tryout_row = $stmt->get_result()->fetch_assoc();
$stmt->close();
$tryout_lulus = $tryout_row && ((int) $tryout_row['skor']) >= TRYOUT_PASSING_SCORE;

if (!$diagnostik_selesai || !$semua_bab_lulus || !$tryout_lulus) {
    echo json_encode([
        "status" => "error",
        "message" => "Sertifikat baru bisa diunduh setelah seluruh rangkaian Program Cakar Nalar (Tes Diagnostik, semua Bab, dan Final Tryout) selesai dan lulus."
    ]);
    $conn->close();
    exit;
}

// --- Syarat 4: Form Umpan Balik SUDAH pernah diisi (WAJIB 1x, lihat
//     api/submit_umpan_balik.php -- UNIQUE KEY user_id di tabel
//     umpan_balik yang benar-benar mencegah lebih dari sekali). Status
//     respons SENGAJA "perlu_umpan_balik" (bukan "error" polos seperti
//     syarat 1-3 di atas) supaya js/sertifikat.js bisa membedakan &
//     langsung ARAHKAN peserta ke umpan_balik.html, bukan cuma
//     menampilkan pesan error yang jalan buntu. Begitu sudah pernah
//     mengisi, endpoint ini SETERUSNYA selalu lolos syarat ini (boleh
//     unduh sertifikat berkali-kali, TIDAK disuruh isi ulang). ---
$stmt = $conn->prepare("SELECT COUNT(*) AS c FROM umpan_balik WHERE user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$sudah_isi_umpan_balik = ((int) $stmt->get_result()->fetch_assoc()['c']) > 0;
$stmt->close();

if (!$sudah_isi_umpan_balik) {
    echo json_encode([
        "status" => "perlu_umpan_balik",
        "message" => "Isi dulu Form Umpan Balik (cukup sekali) sebelum bisa melihat & mengunduh sertifikat."
    ]);
    $conn->close();
    exit;
}

/**
 * cn_sertifikat_italicize()
 * -----------------------------------------------------
 * Bungkus HANYA kata/frasa Bahasa Inggris yang benar-benar ada di teks
 * rubrik klasifikasi (label & deskripsi) dengan <em> -- supaya kata
 * Bahasa Indonesia yang kebetulan nyempil di tengah label campuran
 * (mis. "hingga" di "Practicing hingga Master Thinker") TIDAK ikut
 * miring, dan supaya istilah Inggris yang nyempil di tengah deskripsi
 * (mis. "(logical fallacy)") TETAP miring walau bukan bagian dari
 * label. Daftar di bawah SENGAJA berupa frasa tetap (bukan deteksi
 * bahasa otomatis) karena teks sumbernya sendiri konstan/tidak
 * berubah-ubah (lihat $rubrik_tryout) -- urutan panjang-ke-pendek
 * supaya frasa yang lebih panjang selalu kena duluan, sebelum frasa
 * pendek yang jadi bagian darinya sempat ke-replace lebih dulu.
 */
function cn_sertifikat_italicize(string $text): string
{
    $frasa_inggris = [
        'Challenged / Beginning Thinker',
        'Unreflective Thinker',
        'Master Thinker',
        'Practicing',
        'logical fallacy',
    ];
    foreach ($frasa_inggris as $frasa) {
        $text = str_replace($frasa, '<em>' . $frasa . '</em>', $text);
    }
    return $text;
}

$skor_tryout = (int) $tryout_row['skor'];
$tanggal_selesai = $tryout_row['created_at']; // format "Y-m-d H:i:s"
$klasifikasi = cn_klasifikasi_tryout($skor_tryout);
$klasifikasi['label_html'] = cn_sertifikat_italicize($klasifikasi['label']);

// Nomor sertifikat deterministik: CN-<YYYYMMDD selesai>-<user_id 4 digit>
$nomor_sertifikat = 'CN-' . date('Ymd', strtotime($tanggal_selesai)) . '-' . str_pad((string) $user_id, 4, '0', STR_PAD_LEFT);

/**
 * Rubrik LENGKAP (3 kategori) buat halaman ke-2 sertifikat -- supaya
 * yang lihat sertifikatnya (bukan cuma peserta sendiri) tahu maksud
 * label klasifikasi di halaman pertama itu apa. Teksnya SENGAJA
 * ditulis ulang di sini (bukan panggil cn_klasifikasi_tryout() 3x
 * dengan skor dummy), SAMA PERSIS dengan cn_klasifikasi_tryout() di
 * atas dan daftarRangeSkorTryout di js/quiz.js (tampilkanHasilTryout)
 * -- kalau salah satu diubah, dua yang lain WAJIB ikut disamakan.
 */
$rubrik_tryout = [
    [
        "min" => 0,
        "max" => 50,
        "warna" => "merah",
        "label" => "Unreflective Thinker",
        "deskripsi" => "Peserta masih rentan terhadap disinformasi, mudah terpengaruh bias emosional, dan belum sepenuhnya menguasai verifikasi logika dasar. Peserta pada kategori ini disarankan untuk mereview ulang materi modul secara komprehensif."
    ],
    [
        "min" => 51,
        "max" => 75,
        "warna" => "kuning",
        "label" => "Challenged / Beginning Thinker",
        "deskripsi" => "Peserta sudah mulai mengenali anomali informasi dan cacat logika, namun masih sering terkecoh oleh sesat pikir (logical fallacy) tingkat lanjut atau jebakan pengecoh skenario kompleks."
    ],
    [
        "min" => 76,
        "max" => 100,
        "warna" => "hijau",
        "label" => "Practicing hingga Master Thinker",
        "deskripsi" => "Peserta memiliki nalar kritis yang matang, menguasai verifikasi multi-kriteria secara presisi, kebal terhadap manipulasi ruang gema, dan sangat layak dinobatkan sebagai agen perubahan digital yang cakap."
    ]
];

foreach ($rubrik_tryout as &$range) {
    $range['label_html'] = cn_sertifikat_italicize($range['label']);
    $range['deskripsi_html'] = cn_sertifikat_italicize($range['deskripsi']);
}
unset($range);

/**
 * Daftar materi (judul + skor tiap Bab) buat halaman ke-3 sertifikat --
 * supaya siapapun yang lihat sertifikatnya tahu apa saja yang
 * dipelajari peserta & skor kuisnya, bukan cuma skor/klasifikasi Final
 * Tryout-nya saja. SENGAJA TIDAK ikut kirim status lulus (beda dengan
 * tabel "Materi & Kuis per Bab" di laporan.html) -- di sertifikat ini
 * semua bab PASTI sudah lulus (lihat syarat 2 di atas), jadi kolom
 * status jadi berulang/tidak menambah informasi baru buat pembaca
 * sertifikat.
 */
// Skor per bab (skor_terakhir) -- SAMA POLA dengan query bab di
// api/get_bab.php: skor dari percobaan hasil_kuis TERAKHIR peserta ini
// per bab (bukan skor tertinggi), supaya konsisten dengan angka "Skor: X"
// yang sudah ditampilkan di kartu bab pada dashboard.
$bab_stmt = $conn->prepare("
    SELECT b.nomor, b.judul, h.skor AS skor_terakhir
    FROM bab b
    LEFT JOIN (
        SELECT hk1.bab_id, hk1.skor
        FROM hasil_kuis hk1
        INNER JOIN (
            SELECT bab_id, MAX(id) AS max_id
            FROM hasil_kuis
            WHERE user_id = ?
            GROUP BY bab_id
        ) hk2 ON hk1.bab_id = hk2.bab_id AND hk1.id = hk2.max_id
    ) h ON h.bab_id = b.id
    ORDER BY b.nomor ASC
");
$bab_stmt->bind_param("i", $user_id);
$bab_stmt->execute();
$bab_result = $bab_stmt->get_result();
$daftar_materi = [];
while ($b = $bab_result->fetch_assoc()) {
    $daftar_materi[] = [
        "nomor" => (int) $b['nomor'],
        "judul" => $b['judul'],
        "skor" => $b['skor_terakhir'] !== null ? (int) $b['skor_terakhir'] : null
    ];
}
$bab_stmt->close();

echo json_encode([
    "status" => "success",
    "data" => [
        "nama" => $user_row['name'],
        "skor_tryout" => $skor_tryout,
        "klasifikasi" => $klasifikasi,
        "tanggal_selesai" => str_replace(' ', 'T', $tanggal_selesai),
        "nomor_sertifikat" => $nomor_sertifikat,
        "rubrik" => $rubrik_tryout,
        "materi" => $daftar_materi
    ]
]);

$conn->close();
?>