<?php
/**
 * admin/get_umpan_balik_list.php
 * -----------------------------------------------------
 * Dipakai halaman admin (menu "Umpan Balik") untuk menampilkan tabel
 * daftar SEMUA respons Form Umpan Balik yang sudah masuk (nama peserta +
 * tanggal isi), PLUS rekap/rata-rata skor tiap indikator Bagian II
 * (Efektivitas Materi Bab 1-5) & Bagian III (Desain Media/Visual/Maskot)
 * supaya admin tidak perlu buka satu-satu buat lihat gambaran umum.
 *
 * Cara panggil: GET api/admin/get_umpan_balik_list.php
 * (tidak butuh parameter -- selalu semua respons, sama seperti
 * get_peserta_monitor.php)
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

$sql = "SELECT ub.id, ub.user_id, u.name AS nama, u.email,
               ub.bab1_skor, ub.bab2_skor, ub.bab3_skor, ub.bab4_skor, ub.bab5_skor,
               ub.maskot_skor, ub.desain_skor, ub.studi_kasus_skor, ub.lembar_kerja_skor,
               ub.kepercayaan_verifikasi, ub.nps, ub.created_at
        FROM umpan_balik ub
        JOIN users u ON u.id = ub.user_id
        ORDER BY ub.created_at DESC";
$res = $conn->query($sql);

$list = [];
$jumlah = 0;
$jumlahBab = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
$jumlahDesain = ["maskot" => 0, "desain" => 0, "studi_kasus" => 0, "lembar_kerja" => 0];
$jumlahKepercayaan = 0;
$jumlahNps = 0;

while ($row = $res->fetch_assoc()) {
    $list[] = [
        "id" => (int) $row['id'],
        "user_id" => (int) $row['user_id'],
        "nama" => $row['nama'],
        "email" => $row['email'],
        "nps" => (int) $row['nps'],
        "created_at" => $row['created_at']
    ];

    $jumlah++;
    $jumlahBab[1] += (int) $row['bab1_skor'];
    $jumlahBab[2] += (int) $row['bab2_skor'];
    $jumlahBab[3] += (int) $row['bab3_skor'];
    $jumlahBab[4] += (int) $row['bab4_skor'];
    $jumlahBab[5] += (int) $row['bab5_skor'];
    $jumlahDesain["maskot"] += (int) $row['maskot_skor'];
    $jumlahDesain["desain"] += (int) $row['desain_skor'];
    $jumlahDesain["studi_kasus"] += (int) $row['studi_kasus_skor'];
    $jumlahDesain["lembar_kerja"] += (int) $row['lembar_kerja_skor'];
    $jumlahKepercayaan += (int) $row['kepercayaan_verifikasi'];
    $jumlahNps += (int) $row['nps'];
}

// rata2 dibulatkan 1 desimal (skalanya cuma 1-5/1-10, dua desimal kesannya
// terlalu presisi buat data yang begini) -- null kalau belum ada respons
// sama sekali (bukan 0 -- 0 bisa disalahartikan sebagai skor rata2 asli).
function cn_ub_rata($jumlah, $n)
{
    return $n > 0 ? round($jumlah / $n, 1) : null;
}

$rekap = [
    "jumlah_respons" => $jumlah,
    "rata_bab" => [
        "bab1" => cn_ub_rata($jumlahBab[1], $jumlah),
        "bab2" => cn_ub_rata($jumlahBab[2], $jumlah),
        "bab3" => cn_ub_rata($jumlahBab[3], $jumlah),
        "bab4" => cn_ub_rata($jumlahBab[4], $jumlah),
        "bab5" => cn_ub_rata($jumlahBab[5], $jumlah),
    ],
    "rata_desain" => [
        "maskot" => cn_ub_rata($jumlahDesain["maskot"], $jumlah),
        "desain" => cn_ub_rata($jumlahDesain["desain"], $jumlah),
        "studi_kasus" => cn_ub_rata($jumlahDesain["studi_kasus"], $jumlah),
        "lembar_kerja" => cn_ub_rata($jumlahDesain["lembar_kerja"], $jumlah),
    ],
    "rata_kepercayaan_verifikasi" => cn_ub_rata($jumlahKepercayaan, $jumlah),
    "rata_nps" => cn_ub_rata($jumlahNps, $jumlah),
];

echo json_encode([
    "status" => "success",
    "data" => [
        "list" => $list,
        "rekap" => $rekap
    ]
]);

$conn->close();
?>
