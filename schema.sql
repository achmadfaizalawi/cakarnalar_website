-- ============================================================
-- CAKAR NALAR — Skema Database
-- Import lewat phpMyAdmin ke database yang sudah kamu buat
-- di cPanel (mis. namacpanel_cakarnalar)
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- ---------- Tabel Pengguna ----------
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('peserta','admin') NOT NULL DEFAULT 'peserta',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Bab ----------
-- judul & ringkasan VARCHAR(300)/(500) (bukan 150/255) supaya ada ruang
-- untuk tag HTML pendek dari editor rich text (bold/italic/underline)
-- di Panel Admin tanpa kepotong.
CREATE TABLE bab (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nomor INT UNSIGNED NOT NULL UNIQUE,
  judul VARCHAR(300) NOT NULL,
  ringkasan VARCHAR(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Soal Kuis ----------
CREATE TABLE quiz_soal (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bab_id INT UNSIGNED NOT NULL,
  pertanyaan TEXT NOT NULL,
  pilihan_a VARCHAR(255) NOT NULL,
  pilihan_b VARCHAR(255) NOT NULL,
  pilihan_c VARCHAR(255) NOT NULL,
  pilihan_d VARCHAR(255) NOT NULL,
  jawaban_benar CHAR(1) NOT NULL,
  urutan INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (bab_id) REFERENCES bab(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Progres Materi ----------
CREATE TABLE progres (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  bab_id INT UNSIGNED NOT NULL,
  materi_dibaca TINYINT(1) NOT NULL DEFAULT 0,
  lulus TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY user_bab (user_id, bab_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bab_id) REFERENCES bab(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Riwayat Hasil Kuis ----------
CREATE TABLE hasil_kuis (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  bab_id INT UNSIGNED NOT NULL,
  jumlah_benar INT UNSIGNED NOT NULL,
  jumlah_soal INT UNSIGNED NOT NULL,
  skor INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bab_id) REFERENCES bab(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FASE 2: TES DIAGNOSTIK & FINAL TRYOUT
-- Asesmen terpisah dari kuis per-bab (quiz_soal / hasil_kuis di atas).
-- - Tes Diagnostik: dikerjakan SEBELUM Bab 1 dibuka, mengukur baseline
--   kemampuan nalar & kerentanan terhadap disinformasi peserta.
-- - Final Tryout: dikerjakan SETELAH Bab 1-6 lulus semua, sebagai
--   penutup program yang mengukur peningkatan sejak tes diagnostik.
-- ============================================================

-- ---------- Tabel Soal Tes Diagnostik ----------
CREATE TABLE diagnostik_soal (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pertanyaan TEXT NOT NULL,
  pilihan_a VARCHAR(255) NOT NULL,
  pilihan_b VARCHAR(255) NOT NULL,
  pilihan_c VARCHAR(255) NOT NULL,
  pilihan_d VARCHAR(255) NOT NULL,
  jawaban_benar CHAR(1) NOT NULL,
  urutan INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Hasil Tes Diagnostik ----------
CREATE TABLE diagnostik_hasil (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  jumlah_benar INT UNSIGNED NOT NULL,
  jumlah_soal INT UNSIGNED NOT NULL,
  skor INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY user_diagnostik (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Soal Final Tryout ----------
CREATE TABLE tryout_soal (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pertanyaan TEXT NOT NULL,
  pilihan_a VARCHAR(255) NOT NULL,
  pilihan_b VARCHAR(255) NOT NULL,
  pilihan_c VARCHAR(255) NOT NULL,
  pilihan_d VARCHAR(255) NOT NULL,
  jawaban_benar CHAR(1) NOT NULL,
  urutan INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tabel Hasil Final Tryout ----------
CREATE TABLE tryout_hasil (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  jumlah_benar INT UNSIGNED NOT NULL,
  jumlah_soal INT UNSIGNED NOT NULL,
  skor INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY user_tryout (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FASE 3: MATERI PEMBELAJARAN DINAMIS PER BAB
-- Superuser (admin) bisa mengubah teks materi, link video
-- pembelajaran, dan mengunggah file PPT untuk tiap bab lewat
-- halaman admin — kontennya TIDAK di-hardcode di frontend.
-- ============================================================
ALTER TABLE bab
  ADD COLUMN konten_materi LONGTEXT NULL AFTER ringkasan,
  ADD COLUMN video_url VARCHAR(500) NULL AFTER konten_materi,
  ADD COLUMN file_ppt VARCHAR(255) NULL AFTER video_url,
  ADD COLUMN file_ppt_nama_asli VARCHAR(255) NULL AFTER file_ppt;

-- ============================================================
-- FASE 4: POIN PER SOAL & PENJELASAN JAWABAN
-- Superuser bisa mengatur bobot poin per soal (tidak selalu rata,
-- mengikuti pola instrumen resmi seperti "3,33 poin/soal") dan
-- menulis penjelasan/pembahasan yang ditampilkan ke peserta
-- SETELAH mereka submit jawaban (bukan sebelumnya, supaya tidak
-- membocorkan kunci jawaban).
-- Kalau "poin" dikosongkan admin untuk sebagian/semua soal,
-- sistem otomatis jatuh ke skema lama (skor rata: 100/jumlah_soal
-- per soal benar) -- lihat cn_hitung_skor_soal() di config.php.
-- ============================================================
ALTER TABLE quiz_soal
  ADD COLUMN poin DECIMAL(5,2) NULL AFTER jawaban_benar,
  ADD COLUMN penjelasan TEXT NULL AFTER poin;

ALTER TABLE diagnostik_soal
  ADD COLUMN poin DECIMAL(5,2) NULL AFTER jawaban_benar,
  ADD COLUMN penjelasan TEXT NULL AFTER poin;

ALTER TABLE tryout_soal
  ADD COLUMN poin DECIMAL(5,2) NULL AFTER jawaban_benar,
  ADD COLUMN penjelasan TEXT NULL AFTER poin;

-- ============================================================
-- FASE 5: SIMPAN PEMBAHASAN JAWABAN SECARA PERMANEN
-- Supaya peserta bisa buka lagi pembahasan Tes Diagnostik / Final
-- Tryout kapan saja (tidak cuma sekali muncul pas submit), rincian
-- per-soal (jawaban peserta, kunci, benar/salah, penjelasan admin)
-- disimpan sebagai JSON di kolom ini saat submit.
-- ============================================================
ALTER TABLE diagnostik_hasil
  ADD COLUMN detail_json LONGTEXT NULL AFTER skor;

ALTER TABLE tryout_hasil
  ADD COLUMN detail_json LONGTEXT NULL AFTER skor;

-- ============================================================
-- FASE 6: BATAS WAKTU PENGERJAAN (TIMER) UNTUK TES DIAGNOSTIK &
-- FINAL TRYOUT
-- Superuser bisa mengatur berapa menit waktu pengerjaan lewat
-- panel admin. Kosongkan (NULL) berarti TANPA batas waktu (perilaku
-- lama, tidak berubah).
-- Waktu MULAI dicatat di server (bukan cuma di browser peserta)
-- begitu peserta pertama kali membuka soalnya, supaya:
-- - Timer tetap jalan walau halaman di-refresh/ditutup lalu dibuka
--   lagi (tidak reset).
-- - Peserta tidak bisa "curang" reset timer lewat localStorage.
-- ============================================================
CREATE TABLE pengaturan_tes (
  jenis ENUM('diagnostik','tryout') PRIMARY KEY,
  durasi_menit INT UNSIGNED NULL
);

INSERT INTO pengaturan_tes (jenis, durasi_menit) VALUES
  ('diagnostik', NULL),
  ('tryout', NULL);

CREATE TABLE diagnostik_waktu (
  user_id INT UNSIGNED PRIMARY KEY,
  mulai_pada DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tryout_waktu (
  user_id INT UNSIGNED PRIMARY KEY,
  mulai_pada DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FASE 7: KUIS PER BAB OPSIONAL
-- Sebelumnya "Kuis per Bab" dikelola terpisah lewat menu Kelola
-- Soal. Sekarang dipindah jadi bagian dari Kelola Materi Bab:
-- tiap bab punya toggle "ada_kuis" (default AKTIF, supaya bab-bab
-- lama yang sudah ada soal kuisnya tidak tiba-tiba jadi tanpa
-- kuis). Kalau admin mematikannya, peserta otomatis dianggap
-- LULUS bab tersebut begitu selesai membaca materinya (tidak
-- perlu mengerjakan kuis sama sekali) -- lihat get_materi.php.
-- ============================================================
ALTER TABLE bab
  ADD COLUMN ada_kuis TINYINT(1) NOT NULL DEFAULT 1 AFTER video_url;

-- ============================================================
-- FASE 8: NILAI MINIMAL PER BAB & OPSI JAWABAN DINAMIS (KUIS PER BAB)
-- - nilai_minimal (opsional, NULL = kosong): kalau admin mengisinya,
--   peserta wajib dapat skor >= nilai_minimal dari kuis bab itu supaya
--   bab berikutnya terbuka (kalau kurang, harus mengulang kuisnya).
--   Kalau DIKOSONGKAN (default/perilaku baru), kuis cuma jadi syarat
--   "wajib dikerjakan" -- begitu peserta submit jawaban (skor
--   berapapun, termasuk 0) langsung dianggap lulus. Ini KHUSUS
--   Kuis per Bab -- Tes Diagnostik & Final Tryout tidak berubah,
--   tetap memakai PASSING_SCORE = 70 dari config.php.
-- - Pilihan jawaban kuis per bab yang sebelumnya baku 4 opsi (A-D)
--   diubah jadi dinamis (admin bisa tambah/hapus opsi sebanyak
--   apapun, minimal 2, lalu tandai salah satu sebagai jawaban benar)
--   lewat tabel baru quiz_soal_pilihan. Data pilihan_a..d +
--   jawaban_benar yang lama di quiz_soal dipindahkan OTOMATIS ke
--   tabel ini oleh migrasi di bawah, supaya soal yang sudah pernah
--   diinput admin tidak hilang, baru kolom lamanya dihapus.
--   HANYA quiz_soal (Kuis per Bab) yang berubah strukturnya --
--   diagnostik_soal & tryout_soal TETAP memakai format A-D lama.
--   (Catatan: ketentuan ini diubah lagi di FASE 9 di bawah -- Tes
--   Diagnostik & Final Tryout menyusul pakai pilihan dinamis juga.)
-- ============================================================
ALTER TABLE bab
  ADD COLUMN nilai_minimal INT UNSIGNED NULL DEFAULT NULL AFTER ada_kuis;

CREATE TABLE quiz_soal_pilihan (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  soal_id INT UNSIGNED NOT NULL,
  teks VARCHAR(500) NOT NULL,
  is_benar TINYINT(1) NOT NULL DEFAULT 0,
  urutan INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (soal_id) REFERENCES quiz_soal(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrasi otomatis dari struktur A-D lama ke tabel pilihan dinamis.
INSERT INTO quiz_soal_pilihan (soal_id, teks, is_benar, urutan)
SELECT id, pilihan_a, IF(LOWER(jawaban_benar) = 'a', 1, 0), 1 FROM quiz_soal
UNION ALL
SELECT id, pilihan_b, IF(LOWER(jawaban_benar) = 'b', 1, 0), 2 FROM quiz_soal
UNION ALL
SELECT id, pilihan_c, IF(LOWER(jawaban_benar) = 'c', 1, 0), 3 FROM quiz_soal
UNION ALL
SELECT id, pilihan_d, IF(LOWER(jawaban_benar) = 'd', 1, 0), 4 FROM quiz_soal;

ALTER TABLE quiz_soal
  DROP COLUMN pilihan_a,
  DROP COLUMN pilihan_b,
  DROP COLUMN pilihan_c,
  DROP COLUMN pilihan_d,
  DROP COLUMN jawaban_benar;

-- Pilihan jawaban Tes Diagnostik & Final Tryout sekarang bisa diisi
-- lewat editor rich text (bold/italic/underline/dll di Panel Admin),
-- jadi isinya bisa mengandung tag HTML pendek (mis. "<b>...</b>").
-- VARCHAR(255) diperlebar jadi VARCHAR(500) (sama seperti kolom teks di
-- quiz_soal_pilihan) supaya tidak kepotong.
ALTER TABLE diagnostik_soal
  MODIFY COLUMN pilihan_a VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_b VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_c VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_d VARCHAR(500) NOT NULL;

ALTER TABLE tryout_soal
  MODIFY COLUMN pilihan_a VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_b VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_c VARCHAR(500) NOT NULL,
  MODIFY COLUMN pilihan_d VARCHAR(500) NOT NULL;

-- Petunjuk pengerjaan Kuis per Bab (opsional) -- ditampilkan di atas
-- daftar soal saat peserta mengerjakan kuis.html, diisi admin lewat
-- modal "Kelola Soal Kuis".
ALTER TABLE bab
  ADD COLUMN petunjuk_kuis LONGTEXT NULL AFTER nilai_minimal;

-- Judul Bab & Ringkasan Singkat sekarang bisa diisi lewat editor rich
-- text (bold/italic di Panel Admin) juga, jadi isinya bisa mengandung
-- tag HTML pendek. VARCHAR(150)/(255) diperlebar jadi VARCHAR(300)/(500)
-- supaya tidak kepotong.
ALTER TABLE bab
  MODIFY COLUMN judul VARCHAR(300) NOT NULL,
  MODIFY COLUMN ringkasan VARCHAR(500) NOT NULL;

-- ---------- File Materi per Bab sekarang bisa LEBIH DARI SATU ----------
-- Sebelumnya cuma 1 file (kolom bab.file_ppt/file_ppt_nama_asli).
-- Sekarang dipindah ke tabel tersendiri supaya satu bab bisa punya
-- banyak file materi (PPT/PPTX/PDF) sekaligus.
CREATE TABLE bab_file_materi (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bab_id INT UNSIGNED NOT NULL,
  nama_file VARCHAR(255) NOT NULL,
  nama_asli VARCHAR(255) NOT NULL,
  urutan INT UNSIGNED NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bab_id) REFERENCES bab(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pindahkan file PPT lama (kalau ada) ke tabel barunya, baru kolom
-- lamanya dibuang dari tabel bab.
INSERT INTO bab_file_materi (bab_id, nama_file, nama_asli, urutan)
SELECT id, file_ppt, COALESCE(NULLIF(file_ppt_nama_asli, ''), file_ppt), 0
FROM bab
WHERE file_ppt IS NOT NULL AND file_ppt <> '';

ALTER TABLE bab
  DROP COLUMN file_ppt,
  DROP COLUMN file_ppt_nama_asli;

-- ---------- Video Bab: pilihan upload file sendiri (bukan cuma link) ----------
-- video_url tetap dipakai untuk mode "Link YouTube". video_file dipakai
-- untuk mode "Upload File Video" -- cuma salah satu yang aktif per bab
-- (diatur dari Panel Admin), video_file_nama_asli buat nama tampilan.
ALTER TABLE bab
  ADD COLUMN video_file VARCHAR(255) NULL AFTER video_url,
  ADD COLUMN video_file_nama_asli VARCHAR(255) NULL AFTER video_file;

-- ---------- Kuis per Bab: pilihan batas waktu pengerjaan (opsional) ----------
-- NULL (default) = tanpa batas waktu. Diisi admin -> kuis bab ini punya
-- batas waktu pengerjaan (menit), auto-submit begitu waktunya habis --
-- mirip Tes Diagnostik/Final Tryout (pengaturan_tes.durasi_menit), tapi
-- diatur PER BAB di sini karena tiap bab bisa beda kebutuhannya.
ALTER TABLE bab
  ADD COLUMN durasi_kuis_menit INT UNSIGNED NULL DEFAULT NULL AFTER petunjuk_kuis;

-- Waktu MULAI pengerjaan tiap peserta untuk Kuis per Bab yang punya
-- batas waktu -- beda dengan diagnostik_waktu/tryout_waktu (satu baris
-- per peserta, sekali seumur hidup), tabel ini kuncinya gabungan
-- user_id+bab_id karena Kuis per Bab bisa diulang per bab kalau belum
-- lulus. Baris dihapus lagi begitu peserta submit (lulus/tidak), lihat
-- cn_hapus_waktu_kuis() di api/config.php -- supaya percobaan berikutnya
-- dapat durasi penuh dari awal lagi.
CREATE TABLE kuis_waktu (
  user_id INT UNSIGNED NOT NULL,
  bab_id INT UNSIGNED NOT NULL,
  mulai_pada DATETIME NOT NULL,
  PRIMARY KEY (user_id, bab_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bab_id) REFERENCES bab(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Kuis per Bab: simpan pembahasan jawaban secara permanen ----------
-- Sama seperti diagnostik_hasil.detail_json (FASE 5 di atas) -- supaya
-- peserta yang sudah LULUS Kuis per Bab bisa buka lagi pembahasan
-- jawabannya kapan saja (dropdown "Pembahasan Jawaban" di layar hasil,
-- lihat tampilkanHasilKuisBab di js/quiz.js), bukan cuma sekali muncul
-- pas submit. Rincian per-soal (jawaban peserta, kunci, benar/salah,
-- penjelasan admin) disimpan sebagai JSON di kolom ini saat submit
-- (lihat api/submit_kuis.php). Baris lama dari sebelum kolom ini ada
-- akan bernilai NULL -- pembahasannya dianggap tidak tersedia lagi,
-- bukan error.
ALTER TABLE hasil_kuis
  ADD COLUMN detail_json LONGTEXT NULL AFTER skor;

-- ============================================================
-- FASE 9: OPSI JAWABAN DINAMIS UNTUK TES DIAGNOSTIK & FINAL TRYOUT
-- Sebelumnya HANYA Kuis per Bab yang pilihan jawabannya dinamis (FASE
-- 8) -- Tes Diagnostik & Final Tryout masih baku 4 opsi (A-D).
-- Sekarang disamakan: admin bisa tambah/hapus opsi sebanyak apapun
-- (minimal 2, tandai salah satu sebagai jawaban benar) lewat tabel
-- baru diagnostik_soal_pilihan / tryout_soal_pilihan, sama persis
-- polanya dengan quiz_soal_pilihan di FASE 8. Data pilihan_a..d +
-- jawaban_benar yang lama dipindahkan OTOMATIS ke tabel ini oleh
-- migrasi di bawah, supaya soal yang sudah pernah diinput admin
-- tidak hilang, baru kolom lamanya dihapus.
--
-- Peserta yang sudah PERNAH mengerjakan Tes Diagnostik/Final Tryout
-- sebelum migrasi ini TIDAK terpengaruh: skor, jumlah_benar, dan
-- detail_json pembahasan lama mereka tetap tersimpan apa adanya --
-- js/quiz.js (renderQuizReviewOptions) sudah mendukung menampilkan
-- format detail_json lama (huruf a-d) maupun baru (ID pilihan) secara
-- otomatis, jadi data hasil yang sudah ada TIDAK perlu dimigrasi ulang.
-- ============================================================
CREATE TABLE diagnostik_soal_pilihan (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  soal_id INT UNSIGNED NOT NULL,
  teks VARCHAR(500) NOT NULL,
  is_benar TINYINT(1) NOT NULL DEFAULT 0,
  urutan INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (soal_id) REFERENCES diagnostik_soal(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tryout_soal_pilihan (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  soal_id INT UNSIGNED NOT NULL,
  teks VARCHAR(500) NOT NULL,
  is_benar TINYINT(1) NOT NULL DEFAULT 0,
  urutan INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (soal_id) REFERENCES tryout_soal(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrasi otomatis dari struktur A-D lama ke tabel pilihan dinamis.
INSERT INTO diagnostik_soal_pilihan (soal_id, teks, is_benar, urutan)
SELECT id, pilihan_a, IF(LOWER(jawaban_benar) = 'a', 1, 0), 1 FROM diagnostik_soal
UNION ALL
SELECT id, pilihan_b, IF(LOWER(jawaban_benar) = 'b', 1, 0), 2 FROM diagnostik_soal
UNION ALL
SELECT id, pilihan_c, IF(LOWER(jawaban_benar) = 'c', 1, 0), 3 FROM diagnostik_soal
UNION ALL
SELECT id, pilihan_d, IF(LOWER(jawaban_benar) = 'd', 1, 0), 4 FROM diagnostik_soal;

INSERT INTO tryout_soal_pilihan (soal_id, teks, is_benar, urutan)
SELECT id, pilihan_a, IF(LOWER(jawaban_benar) = 'a', 1, 0), 1 FROM tryout_soal
UNION ALL
SELECT id, pilihan_b, IF(LOWER(jawaban_benar) = 'b', 1, 0), 2 FROM tryout_soal
UNION ALL
SELECT id, pilihan_c, IF(LOWER(jawaban_benar) = 'c', 1, 0), 3 FROM tryout_soal
UNION ALL
SELECT id, pilihan_d, IF(LOWER(jawaban_benar) = 'd', 1, 0), 4 FROM tryout_soal;

ALTER TABLE diagnostik_soal
  DROP COLUMN pilihan_a,
  DROP COLUMN pilihan_b,
  DROP COLUMN pilihan_c,
  DROP COLUMN pilihan_d,
  DROP COLUMN jawaban_benar;

ALTER TABLE tryout_soal
  DROP COLUMN pilihan_a,
  DROP COLUMN pilihan_b,
  DROP COLUMN pilihan_c,
  DROP COLUMN pilihan_d,
  DROP COLUMN jawaban_benar;

-- Petunjuk pengerjaan Tes Diagnostik / Final Tryout (opsional) --
-- ditampilkan di atas soal saat peserta mengerjakan tes, diisi admin
-- lewat panel Kelola Soal (kartu "Petunjuk Pengerjaan"), mirip
-- petunjuk_kuis di tabel bab tapi untuk Tes Diagnostik/Final Tryout.
ALTER TABLE pengaturan_tes
  ADD COLUMN petunjuk_pengerjaan LONGTEXT NULL AFTER durasi_menit;