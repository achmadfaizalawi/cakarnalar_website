<?php
/**
 * config.php
 * -----------------------------------------------------
 * Koneksi database bersama untuk seluruh endpoint API Cakar Nalar.
 * Di-include di baris pertama tiap file API (setelah header()).
 *
 * Isi 4 baris di bawah sesuai database MySQL yang kamu buat
 * di cPanel Rumahweb (menu "MySQL Databases").
 */

$db_host = "localhost";
$db_user = "ganti_dengan_username_db";
$db_pass = "ganti_dengan_password_db";
$db_name = "ganti_dengan_nama_db";

// PHP 8.1+ secara default melempar exception saat koneksi gagal.
// Baris ini mengembalikannya ke perilaku lama ($conn->connect_error).
mysqli_report(MYSQLI_REPORT_OFF);

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode([
        "status" => "error",
        "message" => "Koneksi database gagal: " . $conn->connect_error
    ]));
}

$conn->set_charset("utf8mb4");
$conn->query("SET time_zone = '+07:00'");

// Nilai minimum skor kuis (0-100) agar bab dianggap LULUS.
define('PASSING_SCORE', 70);

// Nilai minimum skor Final Tryout (0-100) supaya dianggap LULUS --
// di bawah ini peserta WAJIB mengulang (lihat cn_klasifikasi_tryout()
// & get_tryout.php/submit_tryout.php). Beda dengan Tes Diagnostik yang
// cuma sekali kerja tanpa nilai minimal sama sekali.
define('TRYOUT_PASSING_SCORE', 51);

/**
 * Cek apakah sebuah bab (berdasarkan NOMOR urutnya, bukan id) masih
 * terkunci untuk peserta tertentu.
 * - Bab nomor 1 terkunci sampai Tes Diagnostik selesai dikerjakan.
 * - Bab nomor N (N>1) terkunci sampai Bab (N-1) berstatus lulus.
 */
function cn_bab_locked(mysqli $conn, int $user_id, int $nomor): bool
{
    if ($nomor <= 1) {
        $stmt = $conn->prepare("SELECT id FROM diagnostik_hasil WHERE user_id = ? LIMIT 1");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $sudah_diagnostik = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return !$sudah_diagnostik;
    }

    $prev = $nomor - 1;
    $stmt = $conn->prepare("
        SELECT p.lulus
        FROM bab b
        LEFT JOIN progres p ON p.bab_id = b.id AND p.user_id = ?
        WHERE b.nomor = ?
        LIMIT 1
    ");
    $stmt->bind_param("ii", $user_id, $prev);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return !($row && (int) $row['lulus'] === 1);
}

/**
 * Cek apakah Final Tryout sudah terbuka untuk peserta tertentu
 * (baru terbuka jika SEMUA bab yang ada berstatus lulus).
 */
function cn_tryout_unlocked(mysqli $conn, int $user_id): bool
{
    $total_bab = (int) $conn->query("SELECT COUNT(*) AS c FROM bab")->fetch_assoc()['c'];
    if ($total_bab === 0) {
        return false;
    }

    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM progres WHERE user_id = ? AND lulus = 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $lulus_count = (int) $stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();

    return $lulus_count >= $total_bab;
}

/**
 * Validasi nama pengguna (dipakai saat daftar & edit profil).
 * - Wajib diisi (tidak boleh kosong setelah di-trim)
 * - Maksimal 30 karakter
 * Return: pesan error (string) kalau tidak valid, atau null kalau valid.
 */
function cn_validasi_nama(string $name): ?string
{
    $name = trim($name);
    if ($name === '') {
        return "Nama wajib diisi";
    }
    if (mb_strlen($name) > 30) {
        return "Nama maksimal 30 karakter";
    }
    return null;
}

/**
 * Validasi kekuatan kata sandi (dipakai saat daftar & edit profil), supaya
 * peserta tidak asal isi kata sandi yang terlalu lemah.
 * - Minimal 8 karakter, maksimal 30 karakter
 * - Wajib mengandung minimal 1 huruf dan 1 angka
 * Return: pesan error (string) kalau tidak valid, atau null kalau valid.
 */
function cn_validasi_kata_sandi(string $password): ?string
{
    if (strlen($password) < 8) {
        return "Kata sandi minimal 8 karakter";
    }
    if (strlen($password) > 30) {
        return "Kata sandi maksimal 30 karakter";
    }
    if (!preg_match('/[A-Za-z]/', $password)) {
        return "Kata sandi harus mengandung minimal 1 huruf";
    }
    if (!preg_match('/[0-9]/', $password)) {
        return "Kata sandi harus mengandung minimal 1 angka";
    }
    return null;
}

/**
 * Validasi format email (dipakai saat daftar & edit profil). Selain cek
 * dasar via FILTER_VALIDATE_EMAIL, akhiran domainnya (TLD) juga dicek
 * terhadap daftar TLD umum -- supaya salah ketik semacam
 * "nama@gmail.comdsdsds" tidak lolos begitu saja (FILTER_VALIDATE_EMAIL
 * sendiri menganggap itu valid karena "comdsdsds" tetap huruf semua).
 */
function cn_validasi_format_email(string $email): bool
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $tld_umum = [
        'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'co',
        'io', 'dev', 'app', 'xyz', 'online', 'site', 'tech', 'store', 'shop', 'blog', 'cloud',
        'me', 'tv', 'cc', 'id', 'sg', 'my', 'ph', 'th', 'vn', 'in', 'us', 'uk', 'au', 'ca', 'de',
        'fr', 'nl', 'jp', 'cn', 'kr', 'br', 'ru', 'es', 'it', 'asia'
    ];
    $sld_id_umum = ['co', 'ac', 'sch', 'go', 'mil', 'net', 'or', 'web', 'my', 'biz', 'desa'];

    $domain = strtolower(substr((string) strrchr($email, '@'), 1));
    $labels = explode('.', $domain);
    $tld = end($labels);

    if (!in_array($tld, $tld_umum, true)) {
        return false;
    }
    if ($tld === 'id' && count($labels) >= 3) {
        $sld = $labels[count($labels) - 2];
        if (!in_array($sld, $sld_id_umum, true)) {
            return false;
        }
    }
    return true;
}

/**
 * Klasifikasi hasil Tes Diagnostik berdasarkan tahapan berpikir kritis
 * Paul & Elder, sesuai rentang skor pada instrumen resmi:
 * - 0-40   : Unreflective Thinker
 * - 41-70  : Challenged / Beginning Thinker
 * - 71-100 : Practicing hingga Master Thinker
 */
function cn_klasifikasi_paul_elder(int $skor): array
{
    if ($skor <= 40) {
        return [
            "label" => "Unreflective Thinker",
            "deskripsi" => "Rentan tinggi terhadap hoaks dan bias emosional. Wajib mengikuti modul secara penuh.",
            "warna" => "merah"
        ];
    }
    if ($skor <= 70) {
        return [
            "label" => "Challenged / Beginning Thinker",
            "deskripsi" => "Mulai sadar namun masih mudah terkecoh sesat pikir (logical fallacy).",
            "warna" => "kuning"
        ];
    }
    return [
        "label" => "Practicing hingga Master Thinker",
        "deskripsi" => "Memiliki nalar kritis matang dan siap menjadi agen perubahan digital.",
        "warna" => "hijau"
    ];
}

/**
 * cn_klasifikasi_tryout()
 * -----------------------------------------------------
 * Rubrik klasifikasi KHUSUS Final Tryout (Paul & Elder Critical
 * Thinking Stages) -- SENGAJA rentang skornya berbeda dari Tes
 * Diagnostik (cn_klasifikasi_paul_elder() di atas, 0-40/41-70/71-100):
 * Final Tryout memakai 0-50/51-75/76-100, SELARAS dengan
 * TRYOUT_PASSING_SCORE (51) -- skor 0-50 (Unreflective Thinker) WAJIB
 * mengulang Final Tryout, sedangkan 51 ke atas sudah final (lihat
 * get_tryout.php/submit_tryout.php).
 */
function cn_klasifikasi_tryout(int $skor): array
{
    if ($skor <= 50) {
        return [
            "label" => "Unreflective Thinker",
            "deskripsi" => "Peserta masih rentan terhadap disinformasi, mudah terpengaruh bias emosional, dan belum sepenuhnya menguasai verifikasi logika dasar. Peserta pada kategori ini disarankan untuk mereview ulang materi modul secara komprehensif.",
            "warna" => "merah"
        ];
    }
    if ($skor <= 75) {
        return [
            "label" => "Challenged / Beginning Thinker",
            "deskripsi" => "Peserta sudah mulai mengenali anomali informasi dan cacat logika, namun masih sering terkecoh oleh sesat pikir (logical fallacy) tingkat lanjut atau jebakan pengecoh skenario kompleks.",
            "warna" => "kuning"
        ];
    }
    return [
        "label" => "Practicing hingga Master Thinker",
        "deskripsi" => "Peserta memiliki nalar kritis yang matang, menguasai verifikasi multi-kriteria secara presisi, kebal terhadap manipulasi ruang gema, dan sangat layak dinobatkan sebagai agen perubahan digital yang cakap.",
        "warna" => "hijau"
    ];
}

/**
 * Cek apakah peserta SUDAH BENAR-BENAR menyelesaikan SELURUH rangkaian
 * program (Tes Diagnostik selesai + SEMUA bab lulus + Final Tryout
 * lulus) -- SAMA PERSIS syarat 1-3 yang dicek manual di
 * api/get_sertifikat.php (endpoint itu SENGAJA tidak diubah untuk
 * memakai helper ini, sudah stabil & butuh $tryout_row penuh, bukan
 * cuma boolean lulus/tidak). Dipakai bareng oleh
 * api/get_umpan_balik.php & api/submit_umpan_balik.php supaya peserta
 * tidak bisa mengakses/mengirim Form Umpan Balik sebelum benar-benar
 * berhak (sama prinsip "jangan percaya klien" dengan endpoint
 * sertifikat).
 */
function cn_sudah_selesai_semua_rangkaian(mysqli $conn, int $user_id): bool
{
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM diagnostik_hasil WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $diagnostik_selesai = ((int) $stmt->get_result()->fetch_assoc()['c']) > 0;
    $stmt->close();

    $total_bab = (int) $conn->query("SELECT COUNT(*) AS c FROM bab")->fetch_assoc()['c'];
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM progres WHERE user_id = ? AND lulus = 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $bab_lulus_count = (int) $stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    $semua_bab_lulus = $total_bab > 0 && $bab_lulus_count >= $total_bab;

    $stmt = $conn->prepare("SELECT skor FROM tryout_hasil WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $tryout_row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $tryout_lulus = $tryout_row && ((int) $tryout_row['skor']) >= TRYOUT_PASSING_SCORE;

    return $diagnostik_selesai && $semua_bab_lulus && $tryout_lulus;
}

/**
 * Ambil durasi batas waktu (menit) untuk 'diagnostik' atau 'tryout'
 * yang diatur admin lewat panel. Return null = tanpa batas waktu.
 */
function cn_get_durasi_tes(mysqli $conn, string $jenis): ?int
{
    $stmt = $conn->prepare("SELECT durasi_menit FROM pengaturan_tes WHERE jenis = ? LIMIT 1");
    $stmt->bind_param("s", $jenis);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return ($row && $row['durasi_menit'] !== null) ? (int) $row['durasi_menit'] : null;
}

/**
 * Ambil petunjuk pengerjaan (opsional) untuk 'diagnostik' atau
 * 'tryout' yang diatur admin lewat panel. Return null = tidak ada
 * petunjuk (jangan ditampilkan ke peserta).
 */
function cn_get_petunjuk_tes(mysqli $conn, string $jenis): ?string
{
    $stmt = $conn->prepare("SELECT petunjuk_pengerjaan FROM pengaturan_tes WHERE jenis = ? LIMIT 1");
    $stmt->bind_param("s", $jenis);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return ($row && $row['petunjuk_pengerjaan'] !== null && $row['petunjuk_pengerjaan'] !== '')
        ? $row['petunjuk_pengerjaan']
        : null;
}

/**
 * Catat/ambil waktu MULAI pengerjaan seorang peserta untuk tabel
 * waktu tertentu ('diagnostik_waktu' / 'tryout_waktu'). Kalau belum
 * pernah mulai, catat NOW() sebagai waktu mulai. Kalau sudah pernah
 * (mis. peserta refresh halaman), kembalikan waktu mulai yang SAMA
 * -- supaya timer tidak reset.
 *
 * $table_waktu HARUS salah satu dari whitelist di bawah (bukan dari
 * input pengguna) supaya aman dari SQL injection nama tabel.
 */
function cn_mulai_atau_ambil_waktu(mysqli $conn, string $table_waktu, int $user_id): string
{
    if (!in_array($table_waktu, ['diagnostik_waktu', 'tryout_waktu'], true)) {
        throw new InvalidArgumentException('Tabel waktu tidak valid');
    }

    $stmt = $conn->prepare("SELECT mulai_pada FROM $table_waktu WHERE user_id = ? LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        return $row['mulai_pada'];
    }

    $stmt = $conn->prepare("INSERT INTO $table_waktu (user_id, mulai_pada) VALUES (?, NOW())");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("SELECT mulai_pada FROM $table_waktu WHERE user_id = ? LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row['mulai_pada'];
}

/**
 * Versi cn_mulai_atau_ambil_waktu() di atas KHUSUS untuk Kuis per Bab
 * (tabel "kuis_waktu", primary key gabungan user_id+bab_id -- beda
 * dengan diagnostik_waktu/tryout_waktu yang cuma sekali per peserta,
 * Kuis per Bab bisa diulang per bab jadi butuh kunci per-bab juga).
 * Perilakunya sama: kalau belum pernah mulai, catat NOW(); kalau sudah,
 * kembalikan waktu mulai yang SAMA (supaya refresh halaman tidak reset
 * timer). Baris ini dihapus lagi lewat cn_hapus_waktu_kuis() begitu
 * peserta submit jawaban (lulus ataupun tidak) -- supaya percobaan
 * BERIKUTNYA (kalau kuisnya diulang karena belum lulus) dapat durasi
 * penuh dari awal lagi, bukan melanjutkan sisa waktu percobaan lama.
 */
function cn_mulai_atau_ambil_waktu_kuis(mysqli $conn, int $user_id, int $bab_id): string
{
    $stmt = $conn->prepare("SELECT mulai_pada FROM kuis_waktu WHERE user_id = ? AND bab_id = ? LIMIT 1");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        return $row['mulai_pada'];
    }

    $stmt = $conn->prepare("INSERT INTO kuis_waktu (user_id, bab_id, mulai_pada) VALUES (?, ?, NOW())");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("SELECT mulai_pada FROM kuis_waktu WHERE user_id = ? AND bab_id = ? LIMIT 1");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row['mulai_pada'];
}

/**
 * Hapus catatan "waktu mulai" Kuis per Bab seorang peserta (dipanggil
 * dari submit_kuis.php setelah jawabannya dinilai, lulus ataupun
 * tidak) -- lihat catatan di cn_mulai_atau_ambil_waktu_kuis() di atas.
 */
function cn_hapus_waktu_kuis(mysqli $conn, int $user_id, int $bab_id): void
{
    $stmt = $conn->prepare("DELETE FROM kuis_waktu WHERE user_id = ? AND bab_id = ?");
    $stmt->bind_param("ii", $user_id, $bab_id);
    $stmt->execute();
    $stmt->close();
}

/**
 * Hapus catatan "waktu mulai" Final Tryout seorang peserta (dipanggil
 * dari submit_tryout.php setelah jawabannya dinilai, lulus ataupun
 * tidak) -- sama seperti cn_hapus_waktu_kuis() di atas untuk Kuis per
 * Bab, supaya kalau peserta belum lulus (skor <= 50, WAJIB mengulang)
 * dan mencoba lagi, timernya dihitung ulang dari awal (durasi penuh),
 * bukan melanjutkan sisa waktu percobaan yang baru saja disubmit.
 */
function cn_hapus_waktu_tryout(mysqli $conn, int $user_id): void
{
    $stmt = $conn->prepare("DELETE FROM tryout_waktu WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
}

/**
 * cn_hitung_skor_soal_dinamis()
 * -----------------------------------------------------
 * Hitung skor dari kumpulan soal + jawaban peserta, dengan dukungan
 * poin custom per soal (diinput admin lewat panel Kelola Soal), untuk
 * soal yang pilihan jawabannya dinamis (jumlah opsi bebas, disimpan di
 * tabel {jenis}_soal_pilihan) -- dipakai oleh Kuis per Bab, Tes
 * Diagnostik, dan Final Tryout (sejak FASE 9 di schema.sql). Jawaban
 * peserta di sini berupa ID pilihan yang dipilih (bukan huruf a/b/c/d).
 *
 * Aturan skor:
 * - Kalau SEMUA soal punya poin custom (tidak null) -> skor = jumlah
 *   poin dari soal yang dijawab benar (mengikuti bobot instrumen resmi,
 *   mis. 3,33/soal). Total poin idealnya didesain admin supaya = 100,
 *   tapi sistem tidak memaksakan itu (dijumlah apa adanya).
 * - Kalau ADA soal yang poin-nya kosong (belum diisi admin) -> jatuh
 *   ke skema lama: skor rata = round(jumlah_benar / total_soal * 100),
 *   supaya soal lama yang belum dikasih poin custom tetap adil dinilai.
 *
 * $soal_rows: array tiap soal berisi id, pertanyaan, poin, penjelasan,
 *             dan "pilihan" => [ [id, teks, is_benar], ... ]
 * $jawaban:   [ soal_id => pilihan_id_yang_dipilih ]
 *
 * Return: ["skor"=>float, "jumlah_benar"=>int, "detail"=>array per-soal
 *          untuk ditampilkan sebagai pembahasan setelah submit]
 */
function cn_hitung_skor_soal_dinamis(array $soal_rows, array $jawaban): array
{
    $total = count($soal_rows);
    $pakai_poin_custom = $total > 0;
    foreach ($soal_rows as $soal) {
        if ($soal['poin'] === null) {
            $pakai_poin_custom = false;
            break;
        }
    }

    $jumlah_benar = 0;
    $skor = 0;
    $detail = [];

    foreach ($soal_rows as $soal) {
        $dipilih_id = isset($jawaban[$soal['id']]) ? (int) $jawaban[$soal['id']] : 0;

        $pilihan_benar = null;
        $pilihan_dipilih = null;
        foreach ($soal['pilihan'] as $p) {
            if ($p['is_benar']) {
                $pilihan_benar = $p;
            }
            if ($p['id'] === $dipilih_id) {
                $pilihan_dipilih = $p;
            }
        }

        $benar = $dipilih_id > 0 && $pilihan_dipilih !== null && !empty($pilihan_dipilih['is_benar']);

        if ($benar) {
            $jumlah_benar++;
            $skor += $pakai_poin_custom ? (float) $soal['poin'] : (100 / $total);
        }

        $detail[] = [
            "id" => (int) $soal['id'],
            "pertanyaan" => $soal['pertanyaan'],
            "pilihan" => array_map(function ($p) {
                return ["id" => (int) $p['id'], "teks" => $p['teks']];
            }, $soal['pilihan']),
            "jawaban_user" => $dipilih_id > 0 ? $dipilih_id : null,
            "jawaban_benar" => $pilihan_benar ? (int) $pilihan_benar['id'] : null,
            "benar" => $benar,
            "penjelasan" => $soal['penjelasan'] ?? null
        ];
    }

    return [
        "skor" => round($skor, 2),
        "jumlah_benar" => $jumlah_benar,
        "detail" => $detail
    ];
}