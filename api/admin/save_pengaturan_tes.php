<?php
/**
 * admin/save_pengaturan_tes.php
 * -----------------------------------------------------
 * Ubah batas waktu (menit) dan/atau petunjuk pengerjaan Tes
 * Diagnostik / Final Tryout. Kirim durasi_menit = null (atau
 * kosongkan) untuk menghapus batas waktu (tanpa batas waktu,
 * perilaku default/lama). Kirim petunjuk_pengerjaan = "" (atau
 * kosongkan) untuk menghapus petunjuk.
 *
 * Kedua field ini INDEPENDEN satu sama lain -- field yang tidak
 * disertakan di body JSON TIDAK ikut diubah (nilai lama tetap
 * dipertahankan), supaya menyimpan salah satu (mis. lewat tombol
 * Simpan di kartu "Petunjuk Pengerjaan") tidak menghapus nilai
 * satunya (mis. batas waktu yang sudah diset di kartu lain).
 *
 * Body JSON:
 * { "jenis": "diagnostik" | "tryout", "durasi_menit": 60, "petunjuk_pengerjaan": "..." }
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

$jenis = $data['jenis'] ?? '';
if (!in_array($jenis, ['diagnostik', 'tryout'], true)) {
    echo json_encode(["status" => "error", "message" => "Jenis tidak valid. Gunakan: diagnostik atau tryout"]);
    $conn->close();
    exit;
}

// Ambil nilai yang sudah tersimpan dulu, supaya field yang TIDAK
// disertakan di body request ini tetap dipertahankan (lihat catatan
// di komentar atas file).
$stmtSel = $conn->prepare("SELECT durasi_menit, petunjuk_pengerjaan FROM pengaturan_tes WHERE jenis = ? LIMIT 1");
$stmtSel->bind_param("s", $jenis);
$stmtSel->execute();
$current = $stmtSel->get_result()->fetch_assoc();
$stmtSel->close();

$durasi_menit = $current['durasi_menit'] ?? null;
if (array_key_exists('durasi_menit', $data)) {
    if ($data['durasi_menit'] !== '' && $data['durasi_menit'] !== null) {
        $durasi_menit = (int) $data['durasi_menit'];
        if ($durasi_menit <= 0) {
            echo json_encode(["status" => "error", "message" => "Durasi harus lebih dari 0 menit (atau kosongkan untuk tanpa batas waktu)"]);
            $conn->close();
            exit;
        }
    } else {
        $durasi_menit = null;
    }
}

$petunjuk_pengerjaan = $current['petunjuk_pengerjaan'] ?? null;
if (array_key_exists('petunjuk_pengerjaan', $data)) {
    $petunjuk_pengerjaan = ($data['petunjuk_pengerjaan'] !== '' && $data['petunjuk_pengerjaan'] !== null)
        ? (string) $data['petunjuk_pengerjaan']
        : null;
}

$stmt = $conn->prepare("
    INSERT INTO pengaturan_tes (jenis, durasi_menit, petunjuk_pengerjaan) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE durasi_menit = VALUES(durasi_menit), petunjuk_pengerjaan = VALUES(petunjuk_pengerjaan)
");
$stmt->bind_param("sis", $jenis, $durasi_menit, $petunjuk_pengerjaan);

if ($stmt->execute()) {
    $pesan = [];
    if (array_key_exists('durasi_menit', $data)) {
        $pesan[] = $durasi_menit !== null
            ? "Batas waktu berhasil diset ke {$durasi_menit} menit"
            : "Batas waktu dihapus, pengerjaan sekarang tanpa batas waktu";
    }
    if (array_key_exists('petunjuk_pengerjaan', $data)) {
        $pesan[] = $petunjuk_pengerjaan !== null
            ? "Petunjuk pengerjaan berhasil disimpan"
            : "Petunjuk pengerjaan dihapus";
    }
    if (!$pesan) {
        $pesan[] = "Tidak ada perubahan";
    }
    echo json_encode([
        "status" => "success",
        "message" => implode('. ', $pesan),
        "data" => [
            "jenis" => $jenis,
            "durasi_menit" => $durasi_menit,
            "petunjuk_pengerjaan" => $petunjuk_pengerjaan ?? ''
        ]
    ]);
} else {
    echo json_encode(["status" => "error", "message" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>