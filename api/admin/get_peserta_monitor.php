<?php
/**
 * admin/get_peserta_monitor.php
 * -----------------------------------------------------
 * Ringkasan progres SEMUA peserta untuk halaman "Monitor Peserta":
 * status + skor Tes Diagnostik & Final Tryout (termasuk yang SEDANG
 * dikerjakan/waktu habis, bukan cuma "selesai"/"belum"), progres
 * Kelola Materi (jumlah bab dibaca/lulus dari total bab), dan daftar
 * bab kuis yang sedang aktif dikerjakan (kalau ada).
 *
 * Status yang mungkin untuk Tes Diagnostik/Final Tryout:
 * - "belum"       : belum pernah mulai sama sekali
 * - "sedang"      : sudah mulai, belum submit, MASIH dalam batas waktu
 *                   (atau soal ini memang tanpa batas waktu)
 * - "waktu_habis" : sudah mulai, belum submit, batas waktu SUDAH lewat
 * - "selesai"     : Tes Diagnostik = sudah submit (single-attempt).
 *                   Final Tryout = PERCOBAAN TERAKHIR skornya sudah
 *                   mencapai TRYOUT_PASSING_SCORE (final, tidak bisa
 *                   diulang lagi) -- BUKAN sekadar "pernah submit",
 *                   karena Final Tryout sekarang boleh dicoba berkali-kali.
 * - "belum_lulus" : KHUSUS Final Tryout (multi-attempt) -- peserta SUDAH
 *                   pernah submit minimal 1x, skor percobaan TERAKHIR
 *                   belum mencapai TRYOUT_PASSING_SCORE, dan sedang TIDAK
 *                   ada percobaan baru yang aktif (kalau sedang ada, jadi
 *                   "sedang"/"waktu_habis" seperti biasa). Dibedakan dari
 *                   "belum" ("belum pernah mulai sama sekali") supaya
 *                   admin bisa lihat mana peserta yang sudah pernah coba
 *                   tapi belum lulus vs yang belum coba sama sekali.
 *
 * Cara panggil: GET api/admin/get_peserta_monitor.php
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

// --- Batas waktu Tes Diagnostik/Final Tryout yang diatur admin (sama
//     yang dipakai kartu "Batas Waktu Pengerjaan" di Kelola Soal). ---
$durasi_diagnostik = cn_get_durasi_tes($conn, 'diagnostik');
$durasi_tryout = cn_get_durasi_tes($conn, 'tryout');

// --- Total bab (buat hitung "X/Total bab") ---
$total_bab = (int) $conn->query("SELECT COUNT(*) AS n FROM bab")->fetch_assoc()['n'];

// --- Data utama tiap peserta: hasil + waktu mulai Tes Diagnostik/Final
//     Tryout, dengan TIMESTAMPDIFF dihitung di MySQL (pakai NOW() milik
//     server DB) supaya tidak salah gara-gara zona waktu PHP vs MySQL
//     beda pengaturan. ---
// Final Tryout SENGAJA TIDAK di-LEFT JOIN langsung di sini (beda dengan
// dh/dw punya diagnostik yang masih single-attempt, jadi aman) -- karena
// tryout_hasil sekarang bisa punya BANYAK baris per user (multi-attempt),
// LEFT JOIN langsung bikin baris peserta DUPLIKAT (satu baris per
// percobaan). Skor/status Final Tryout (percobaan TERAKHIR) diambil lewat
// query terpisah di bawah, sama pola dengan "Skor kuis TERAKHIR" untuk
// hasil_kuis.
$sql = "
    SELECT
        u.id, u.name, u.email, u.created_at,
        dh.skor AS diagnostik_skor, dh.jumlah_benar AS diagnostik_benar, dh.jumlah_soal AS diagnostik_total, dh.created_at AS diagnostik_selesai_pada,
        dw.mulai_pada AS diagnostik_mulai,
        TIMESTAMPDIFF(MINUTE, dw.mulai_pada, NOW()) AS diagnostik_menit_berjalan,
        tw.mulai_pada AS tryout_mulai,
        TIMESTAMPDIFF(MINUTE, tw.mulai_pada, NOW()) AS tryout_menit_berjalan
    FROM users u
    LEFT JOIN diagnostik_hasil dh ON dh.user_id = u.id
    LEFT JOIN diagnostik_waktu dw ON dw.user_id = u.id
    LEFT JOIN tryout_waktu tw ON tw.user_id = u.id
    WHERE u.role = 'peserta'
    ORDER BY u.name ASC
";
$result = $conn->query($sql);

$peserta_list = [];
$peserta_by_id = [];

function cn_status_tes(bool $selesai, ?string $mulai, ?int $menit_berjalan, ?int $durasi_menit): string
{
    if ($selesai) return 'selesai';
    if ($mulai === null) return 'belum';
    if ($durasi_menit === null) return 'sedang';
    return ($menit_berjalan !== null && $menit_berjalan > $durasi_menit) ? 'waktu_habis' : 'sedang';
}

while ($row = $result->fetch_assoc()) {
    $diagnostik_selesai = $row['diagnostik_skor'] !== null;

    // Status Final Tryout dari baris ini HANYA berdasarkan tryout_waktu
    // (ada/tidaknya percobaan yang SEDANG aktif) -- skor & status "selesai"
    // (final, skor percobaan terakhir >= TRYOUT_PASSING_SCORE) DIISI/DITIMPA
    // belakangan lewat query terpisah di bawah (lihat blok "Skor Final
    // Tryout TERAKHIR"), karena butuh percobaan TERAKHIR yang tidak bisa
    // didapat dari LEFT JOIN langsung (multi-attempt).
    $tryout_status_awal = cn_status_tes(false, $row['tryout_mulai'], $row['tryout_menit_berjalan'] !== null ? (int) $row['tryout_menit_berjalan'] : null, $durasi_tryout);

    $item = [
        "id" => (int) $row['id'],
        "name" => $row['name'],
        "email" => $row['email'],
        "terdaftar_pada" => str_replace(' ', 'T', $row['created_at']),
        "diagnostik" => [
            "status" => cn_status_tes($diagnostik_selesai, $row['diagnostik_mulai'], $row['diagnostik_menit_berjalan'] !== null ? (int) $row['diagnostik_menit_berjalan'] : null, $durasi_diagnostik),
            "skor" => $diagnostik_selesai ? (int) $row['diagnostik_skor'] : null,
            "jumlah_benar" => $diagnostik_selesai ? (int) $row['diagnostik_benar'] : null,
            "jumlah_soal" => $diagnostik_selesai ? (int) $row['diagnostik_total'] : null,
            "selesai_pada" => $row['diagnostik_selesai_pada'] !== null ? str_replace(' ', 'T', $row['diagnostik_selesai_pada']) : null,
            "mulai_pada" => $row['diagnostik_mulai'] !== null ? str_replace(' ', 'T', $row['diagnostik_mulai']) : null
        ],
        "tryout" => [
            "status" => $tryout_status_awal,
            "skor" => null,
            "jumlah_benar" => null,
            "jumlah_soal" => null,
            "selesai_pada" => null,
            "mulai_pada" => $row['tryout_mulai'] !== null ? str_replace(' ', 'T', $row['tryout_mulai']) : null,
            "jumlah_percobaan" => 0 // diisi di bawah lewat query terpisah (jumlah SEMUA percobaan, bukan cuma yang final)
        ],
        "materi" => [
            "total_bab" => $total_bab,
            "bab_dibaca" => 0,
            "bab_lulus" => 0
        ],
        "kuis_sedang_dikerjakan" => [], // diisi di bawah, kalau ada
        "kuis_bab" => [] // {bab_id: skor_terakhir (PERCOBAAN TERAKHIR)}, diisi di bawah
    ];
    $peserta_list[] = $item;
    $peserta_by_id[$item['id']] = count($peserta_list) - 1;
}

// --- Progres Kelola Materi (dibaca/lulus) per peserta, digabung di PHP
//     supaya tidak perlu query per-peserta (N+1). ---
if (count($peserta_list) > 0) {
    $progres_result = $conn->query("SELECT user_id, materi_dibaca, lulus FROM progres");
    while ($p = $progres_result->fetch_assoc()) {
        $uid = (int) $p['user_id'];
        if (!isset($peserta_by_id[$uid])) continue;
        $idx = $peserta_by_id[$uid];
        if ((int) $p['materi_dibaca'] === 1) $peserta_list[$idx]['materi']['bab_dibaca']++;
        if ((int) $p['lulus'] === 1) $peserta_list[$idx]['materi']['bab_lulus']++;
    }

    // --- Bab kuis yang SEDANG dikerjakan (kuis_waktu -- baris di sini
    //     otomatis terhapus begitu peserta submit, lihat
    //     cn_hapus_waktu_kuis() di submit_kuis.php, jadi keberadaannya
    //     berarti memang sedang berlangsung). ---
    $kuis_result = $conn->query("
        SELECT kw.user_id, b.nomor, b.judul, b.durasi_kuis_menit,
            TIMESTAMPDIFF(MINUTE, kw.mulai_pada, NOW()) AS menit_berjalan
        FROM kuis_waktu kw
        JOIN bab b ON b.id = kw.bab_id
    ");
    while ($k = $kuis_result->fetch_assoc()) {
        $uid = (int) $k['user_id'];
        if (!isset($peserta_by_id[$uid])) continue;
        $idx = $peserta_by_id[$uid];
        $durasi = $k['durasi_kuis_menit'] !== null ? (int) $k['durasi_kuis_menit'] : null;
        $menit_berjalan = $k['menit_berjalan'] !== null ? (int) $k['menit_berjalan'] : null;
        $peserta_list[$idx]['kuis_sedang_dikerjakan'][] = [
            "bab_nomor" => (int) $k['nomor'],
            "bab_judul" => $k['judul'],
            "status" => ($durasi !== null && $menit_berjalan !== null && $menit_berjalan > $durasi) ? 'waktu_habis' : 'sedang'
        ];
    }

    // --- Skor kuis TERAKHIR tiap peserta per bab (dipakai dialog "Semua
    //     Nilai Peserta" dari kartu "Total Peserta" di Monitor Peserta) --
    //     "terakhir" bukan "tertinggi": peserta boleh mengulang kuis
    //     berkali-kali, MAX(id) = percobaan paling baru, SAMA seperti
    //     kolom "Skor Terakhir" di api/get_bab.php & modal Detail Peserta. ---
    $kuis_skor_result = $conn->query("
        SELECT hk1.user_id, hk1.bab_id, hk1.skor
        FROM hasil_kuis hk1
        INNER JOIN (
            SELECT user_id, bab_id, MAX(id) AS max_id
            FROM hasil_kuis
            GROUP BY user_id, bab_id
        ) hk2 ON hk1.user_id = hk2.user_id AND hk1.bab_id = hk2.bab_id AND hk1.id = hk2.max_id
    ");
    while ($s = $kuis_skor_result->fetch_assoc()) {
        $uid = (int) $s['user_id'];
        if (!isset($peserta_by_id[$uid])) continue;
        $idx = $peserta_by_id[$uid];
        $peserta_list[$idx]['kuis_bab'][(int) $s['bab_id']] = (int) $s['skor'];
    }

    // --- Final Tryout: percobaan TERAKHIR tiap peserta (SAMA pola dengan
    //     "Skor kuis TERAKHIR" di atas -- MAX(id) per user_id, bukan
    //     LIMIT 1 tanpa ORDER BY yang bisa dapat baris ACAK). Ini yang
    //     dipakai buat skor & status "selesai" (final) Final Tryout,
    //     menggantikan LEFT JOIN langsung yang tadinya bikin baris
    //     peserta DUPLIKAT karena tryout_hasil sekarang multi-attempt. ---
    $tryout_skor_result = $conn->query("
        SELECT th1.user_id, th1.skor, th1.jumlah_benar, th1.jumlah_soal, th1.created_at
        FROM tryout_hasil th1
        INNER JOIN (
            SELECT user_id, MAX(id) AS max_id
            FROM tryout_hasil
            GROUP BY user_id
        ) th2 ON th1.user_id = th2.user_id AND th1.id = th2.max_id
    ");
    while ($t = $tryout_skor_result->fetch_assoc()) {
        $uid = (int) $t['user_id'];
        if (!isset($peserta_by_id[$uid])) continue;
        $idx = $peserta_by_id[$uid];
        $skor_terakhir = (int) $t['skor'];
        $lulus = $skor_terakhir >= TRYOUT_PASSING_SCORE;

        $peserta_list[$idx]['tryout']['skor'] = $skor_terakhir;
        $peserta_list[$idx]['tryout']['jumlah_benar'] = (int) $t['jumlah_benar'];
        $peserta_list[$idx]['tryout']['jumlah_soal'] = (int) $t['jumlah_soal'];
        $peserta_list[$idx]['tryout']['selesai_pada'] = str_replace(' ', 'T', $t['created_at']);
        if ($lulus) {
            // Percobaan terakhir sudah final -> timpa status jadi "selesai".
            $peserta_list[$idx]['tryout']['status'] = 'selesai';
        } elseif ($peserta_list[$idx]['tryout']['status'] === 'belum') {
            // BELUM lulus, TAPI sudah pernah coba sebelumnya (baris ini
            // hanya ada kalau tryout_hasil punya baris buat user ini) --
            // jangan biarkan status "belum" (artinya "belum pernah mulai
            // sama sekali"), itu MENYESATKAN admin (peserta sudah coba,
            // cuma belum lulus). Ditimpa jadi status baru "belum_lulus".
            // Kalau statusnya sudah "sedang"/"waktu_habis" (lagi ada
            // percobaan BARU yang aktif, dari tryout_waktu), status itu
            // TETAP dipakai apa adanya -- lebih spesifik/berguna buat
            // admin daripada "belum_lulus" (peserta sedang aktif
            // mengulang, bukan cuma "belum lulus" pasif).
            $peserta_list[$idx]['tryout']['status'] = 'belum_lulus';
        }
    }

    // --- Jumlah SEMUA percobaan Final Tryout tiap peserta (dipakai admin
    //     buat lihat "sudah coba berapa kali" walau belum lulus). ---
    $tryout_count_result = $conn->query("SELECT user_id, COUNT(*) AS jumlah FROM tryout_hasil GROUP BY user_id");
    while ($c = $tryout_count_result->fetch_assoc()) {
        $uid = (int) $c['user_id'];
        if (!isset($peserta_by_id[$uid])) continue;
        $idx = $peserta_by_id[$uid];
        $peserta_list[$idx]['tryout']['jumlah_percobaan'] = (int) $c['jumlah'];
    }
}

echo json_encode([
    "status" => "success",
    "data" => [
        "total_bab" => $total_bab,
        "peserta" => $peserta_list
    ]
]);

$conn->close();
?>