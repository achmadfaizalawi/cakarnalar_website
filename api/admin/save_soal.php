<?php
/**
 * admin/save_soal.php
 * -----------------------------------------------------
 * Tambah ATAU ubah satu soal (kuis / diagnostik / tryout).
 * - Jika "id" dikirim dan ada di database -> UPDATE.
 * - Jika "id" kosong/tidak dikirim -> INSERT (soal baru).
 *
 * Ketiga jenis soal (kuis / diagnostik / tryout) SEKARANG sama-sama
 * pakai pilihan jawaban DINAMIS -- boleh berapapun jumlahnya (minimal
 * 2), dan yang ditandai benar salah satu saja (dulu Tes Diagnostik &
 * Final Tryout baku 4 opsi A-D, disamakan dengan Kuis per Bab lewat
 * migrasi FASE 9 di schema.sql):
 * {
 *   "jenis": "kuis" | "diagnostik" | "tryout",
 *   "id": 12,              // opsional, kosongkan untuk soal baru
 *   "bab_id": 1,           // WAJIB untuk jenis "kuis" saja
 *   "pertanyaan": "...",
 *   "pilihan": [
 *     { "teks": "Fakta objektif", "benar": true },
 *     { "teks": "Asumsi", "benar": false },
 *     { "teks": "Opini emosional", "benar": false }
 *   ],
 *   "poin": 3.33,          // opsional
 *   "penjelasan": "...",   // opsional
 *   "urutan": 1            // opsional
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

$table_map = [
    'kuis' => 'quiz_soal',
    'diagnostik' => 'diagnostik_soal',
    'tryout' => 'tryout_soal'
];
$pilihan_table_map = [
    'kuis' => 'quiz_soal_pilihan',
    'diagnostik' => 'diagnostik_soal_pilihan',
    'tryout' => 'tryout_soal_pilihan'
];

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    $data = [];
}

$jenis = $data['jenis'] ?? '';
if (!isset($table_map[$jenis])) {
    echo json_encode(["status" => "error", "message" => "Jenis soal tidak valid. Gunakan: kuis, diagnostik, atau tryout"]);
    $conn->close();
    exit;
}
$table = $table_map[$jenis];
$pilihan_table = $pilihan_table_map[$jenis];

$id = isset($data['id']) && $data['id'] !== '' ? (int) $data['id'] : null;
$pertanyaan = trim($data['pertanyaan'] ?? '');
$urutan = isset($data['urutan']) && $data['urutan'] !== '' ? (int) $data['urutan'] : null;
$poin = isset($data['poin']) && $data['poin'] !== '' && $data['poin'] !== null ? (float) $data['poin'] : null;
$penjelasan = isset($data['penjelasan']) && trim($data['penjelasan']) !== '' ? trim($data['penjelasan']) : null;

if ($pertanyaan === '') {
    echo json_encode(["status" => "error", "message" => "Pertanyaan wajib diisi"]);
    $conn->close();
    exit;
}

// bab_id cuma relevan (dan wajib) untuk jenis "kuis" -- diagnostik/tryout
// bukan per-bab.
$bab_id = null;
if ($jenis === 'kuis') {
    $bab_id = isset($data['bab_id']) ? (int) $data['bab_id'] : 0;
    if ($bab_id <= 0) {
        echo json_encode(["status" => "error", "message" => "bab_id wajib diisi untuk jenis kuis"]);
        $conn->close();
        exit;
    }
    $cek = $conn->prepare("SELECT id FROM bab WHERE id = ? LIMIT 1");
    $cek->bind_param("i", $bab_id);
    $cek->execute();
    if ($cek->get_result()->num_rows === 0) {
        echo json_encode(["status" => "error", "message" => "Bab dengan id tersebut tidak ditemukan"]);
        $cek->close();
        $conn->close();
        exit;
    }
    $cek->close();
}

$pilihan_input = isset($data['pilihan']) && is_array($data['pilihan']) ? $data['pilihan'] : [];
$pilihan_bersih = [];
$jumlah_benar = 0;
foreach ($pilihan_input as $p) {
    $teks = trim($p['teks'] ?? '');
    if ($teks === '') {
        continue;
    }
    $benar = !empty($p['benar']);
    if ($benar) {
        $jumlah_benar++;
    }
    $pilihan_bersih[] = ["teks" => $teks, "benar" => $benar];
}

if (count($pilihan_bersih) < 2) {
    echo json_encode(["status" => "error", "message" => "Minimal 2 pilihan jawaban wajib diisi"]);
    $conn->close();
    exit;
}
if ($jumlah_benar !== 1) {
    echo json_encode(["status" => "error", "message" => "Tandai TEPAT SATU pilihan sebagai jawaban benar"]);
    $conn->close();
    exit;
}

if ($urutan === null) {
    if ($jenis === 'kuis') {
        $q = $conn->prepare("SELECT COALESCE(MAX(urutan), 0) + 1 AS next_urutan FROM quiz_soal WHERE bab_id = ?");
        $q->bind_param("i", $bab_id);
    } else {
        $q = $conn->prepare("SELECT COALESCE(MAX(urutan), 0) + 1 AS next_urutan FROM $table");
    }
    $q->execute();
    $urutan = (int) $q->get_result()->fetch_assoc()['next_urutan'];
    $q->close();
}

$conn->begin_transaction();
try {
    if ($id) {
        $cek = $conn->prepare("SELECT id FROM $table WHERE id = ? LIMIT 1");
        $cek->bind_param("i", $id);
        $cek->execute();
        if ($cek->get_result()->num_rows === 0) {
            throw new Exception("Soal dengan id tersebut tidak ditemukan");
        }
        $cek->close();

        if ($jenis === 'kuis') {
            $stmt = $conn->prepare("UPDATE quiz_soal SET bab_id=?, pertanyaan=?, poin=?, penjelasan=?, urutan=? WHERE id=?");
            $stmt->bind_param("isdsii", $bab_id, $pertanyaan, $poin, $penjelasan, $urutan, $id);
        } else {
            $stmt = $conn->prepare("UPDATE $table SET pertanyaan=?, poin=?, penjelasan=?, urutan=? WHERE id=?");
            $stmt->bind_param("sdsii", $pertanyaan, $poin, $penjelasan, $urutan, $id);
        }
        $stmt->execute();
        $stmt->close();

        $del = $conn->prepare("DELETE FROM $pilihan_table WHERE soal_id = ?");
        $del->bind_param("i", $id);
        $del->execute();
        $del->close();

        $soal_id = $id;
        $msg = "Soal berhasil diperbarui";
    } else {
        if ($jenis === 'kuis') {
            $stmt = $conn->prepare("INSERT INTO quiz_soal (bab_id, pertanyaan, poin, penjelasan, urutan) VALUES (?,?,?,?,?)");
            $stmt->bind_param("isdsi", $bab_id, $pertanyaan, $poin, $penjelasan, $urutan);
        } else {
            $stmt = $conn->prepare("INSERT INTO $table (pertanyaan, poin, penjelasan, urutan) VALUES (?,?,?,?)");
            $stmt->bind_param("sdsi", $pertanyaan, $poin, $penjelasan, $urutan);
        }
        $stmt->execute();
        $soal_id = $conn->insert_id;
        $stmt->close();

        $msg = "Soal baru berhasil ditambahkan";
    }

    $insPilihan = $conn->prepare("INSERT INTO $pilihan_table (soal_id, teks, is_benar, urutan) VALUES (?,?,?,?)");
    $urutanPilihan = 1;
    foreach ($pilihan_bersih as $p) {
        $isBenar = $p['benar'] ? 1 : 0;
        $insPilihan->bind_param("isii", $soal_id, $p['teks'], $isBenar, $urutanPilihan);
        $insPilihan->execute();
        $urutanPilihan++;
    }
    $insPilihan->close();

    $conn->commit();
    echo json_encode(["status" => "success", "message" => $msg, "id" => $soal_id]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}

$conn->close();
?>
