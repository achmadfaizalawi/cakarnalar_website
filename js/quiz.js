// =================================================================
// MESIN SOAL GENERIK — dipakai oleh diagnostik.html, tryout.html, &
// kuis.html (Kuis per Bab). Ketiganya punya bentuk data yang serupa:
//  GET -> {sudah_selesai, skor, soal[]}, POST -> {jumlah_benar, jumlah_soal, skor}
// Untuk kuis.html, config diberi tambahan "babId" -- ini dipakai untuk
// menambahkan parameter bab_id ke setiap pemanggilan apiGet/apiSubmit
// (lihat loadQuizSoal & kirimJawabanKeServer). diagnostik.html tidak
// perlu mengisi babId sama sekali (satu kali kerja, tidak bisa diulang).
//
// tryout.html diberi tambahan "isTryout: true" -- BEDA dengan
// diagnostik.html, Final Tryout BOLEH diulang selama skornya belum
// mencapai TRYOUT_PASSING_SCORE (51, lihat api/config.php), persis
// pola Kuis per Bab (babId), makanya banyak percabangan di bawah ini
// mengecek "quizConfig.babId || quizConfig.isTryout" bersamaan --
// bedanya cuma layar hasilnya: Kuis per Bab lewat tampilkanHasilKuisBab
// (linear per-bab, ada "bab selanjutnya"), Final Tryout lewat
// tampilkanHasilTryout (rubrik klasifikasi Paul & Elder + pembahasan
// HANYA muncul kalau sudah final, lihat catatan di sana).
// =================================================================

// Matikan pemulihan scroll otomatis bawaan browser untuk halaman ini --
// TANPA ini, kirimJawabanKeServer() memanggil window.location.reload()
// begitu Tes Diagnostik disubmit (satu kali kerja, lihat catatan di
// situ), dan browser (history.scrollRestoration bawaan = "auto") mencoba
// memulihkan lagi posisi scroll SEBELUM reload (biasanya di bawah, dekat
// tombol "Kirim Jawaban" soal terakhir) begitu hasilnya selesai dirender
// lewat AJAX -- pemulihan otomatis itu jalan BELAKANGAN (setelah konten
// hasil AJAX-nya masuk), jadi menimpa lagi window.scrollTo(top:0) yang
// sudah dipanggil manual di renderQuizDone()/tampilkanHasilKuisBab()/
// tampilkanHasilTryout(), membuat peserta tetap mendarat di
// tengah/bawah walau reset manualnya sudah benar. "manual" di sini
// membuat browser TIDAK PERNAH ikut campur lagi -- posisi scroll
// sepenuhnya diatur sendiri oleh window.scrollTo() manual di kode ini.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

let quizConfig = null;
let quizCurrentUser = null;
let quizSoalList = [];
let quizJawaban = {}; // { soal_id: 'a' }
let quizDeadlineMs = null;
let quizTimerInterval = null;
let quizWaktuHabis = false;
let quizNavigatorPage = 0; // halaman aktif di navigator soal (0-indexed, 10 soal/halaman)
let quizPetunjuk = ''; // petunjuk pengerjaan Kuis per Bab (opsional, dari bab.petunjuk_kuis)
let quizDitandai = new Set(); // id soal yang ditandai peserta untuk dicek lagi nanti (fitur "tandai soal")
let quizPendingTimerInfo = null; // {waktuMulai, durasiMenit} -- dipakai mulaiKerjakanSoalKuis(), lihat catatan di loadQuizSoal
let quizDurasiMenitInfo = null; // Kuis per Bab saja: durasi batas waktu (menit) kalau ada, dipakai buat teks konfirmasi "Coba Lagi" SEBELUM waktu mulai benar-benar diambil dari api/mulai_kuis_bab.php (lihat catatan di loadQuizSoal & mulaiKerjakanSoalKuis)

/**
 * Panggil ini dari halaman (diagnostik.html / tryout.html) dengan config:
 * {
 *   apiGet: 'api/get_diagnostik.php',
 *   apiSubmit: 'api/submit_diagnostik.php',
 *   title: 'Tes Diagnostik',
 *   subtitle: 'Deskripsi singkat...',
 *   doneTitle: 'Tes Diagnostik Selesai',
 *   doneDesc: 'Baseline kemampuan awalmu sudah tercatat.',
 *   lockedTitle: 'Belum Bisa Diakses',       // opsional, dipakai kalau API balas error
 *   backUrl: 'dashboard.html'
 * }
 */
function initQuizPage(config) {
    quizConfig = Object.assign({ backUrl: 'dashboard.html' }, config);

    document.getElementById('quiz-title').textContent = quizConfig.title;
    document.getElementById('quiz-subtitle').textContent = quizConfig.subtitle;

    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        quizCurrentUser = JSON.parse(saved);
        if (!quizCurrentUser || !quizCurrentUser.id) throw new Error('invalid');
        if (quizCurrentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    loadQuizSoal();
}

/**
 * Footer disembunyikan lewat CSS selagi soal masih dimuat (lihat css/quiz.css),
 * supaya tidak sempat kelihatan lalu tiba-tiba pindah posisi begitu konten
 * aslinya (yang biasanya jauh lebih panjang dari skeleton loading) selesai
 * dirender. Dipanggil sekali di akhir tiap fungsi render konten.
 */
function revealQuizFooter() {
    document.body.classList.add('quiz-content-ready');
}

async function loadQuizSoal() {
    try {
        let url = quizConfig.apiGet + '?user_id=' + quizCurrentUser.id;
        if (quizConfig.babId) url += '&bab_id=' + quizConfig.babId;
        const res = await fetch(url);
        const result = await res.json();

        if (result.status !== 'success') {
            renderQuizLocked(result.message || 'Halaman ini belum bisa diakses.');
            return;
        }

        // Kuis per Bab (bab_id di config): judul statis "Kuis Bab" diganti
        // sekarang jadi ikut sertakan nomor babnya begitu datanya sampai
        // dari server (mis. "Kuis Bab 3") -- sebelumnya nomor bab tidak
        // pernah ditambahkan ke judul, cuma "Kuis Bab" polos untuk semua
        // bab. Tes Diagnostik/Tryout tidak kirim "nomor" sama sekali jadi
        // tidak kena, judulnya tetap seperti konfigurasi awal.
        if (quizConfig.babId && result.data.nomor !== undefined && result.data.nomor !== null) {
            const titleEl = document.getElementById('quiz-title');
            if (titleEl) titleEl.textContent = quizConfig.title + ' ' + result.data.nomor;
        }

        // Subtitle Kuis per Bab menyebutkan (tanpa nama babnya) apakah lulus
        // kuis ini akan membuka bab sesudahnya -- klausa "supaya bab
        // berikutnya terbuka" dihilangkan sama sekali kalau bab ini yang
        // terakhir (tidak ada bab sesudahnya). Tes Diagnostik/Tryout tidak
        // punya babId & tidak punya konsep "bab berikutnya", jadi
        // subtitle-nya tetap statis seperti konfigurasi awal.
        if (quizConfig.babId) {
            const subtitleEl = document.getElementById('quiz-subtitle');
            if (subtitleEl) {
                const adaBabSelanjutnya = !!(result.data.bab_selanjutnya);
                const teksLanjutan = adaBabSelanjutnya ? ' supaya bab berikutnya terbuka.' : '.';
                subtitleEl.textContent = (quizConfig.subtitle || '') + teksLanjutan;
            }
        }

        if (result.data.sudah_selesai) {
            clearQuizProgress();
            // Kuis per Bab yang sudah lulus / Final Tryout yang sudah
            // final dibuka lagi -- pakai layar hasil yang sama dengan
            // yang muncul langsung pas submit (skor, dropdown "Riwayat
            // Percobaan" & "Pembahasan Jawaban"), BUKAN renderQuizDone
            // (itu KHUSUS Tes Diagnostik -- sekali kerja, tidak punya
            // konsep "riwayat" ataupun "lulus/belum"). get_soal.php &
            // get_tryout.php sudah menyiapkan data dengan bentuk yang
            // sama (lulus, jumlah_benar, jumlah_soal, skor, pembahasan,
            // riwayat).
            if (quizConfig.babId) {
                tampilkanHasilKuisBab(result.data);
            } else if (quizConfig.isTryout) {
                tampilkanHasilTryout(result.data);
            } else {
                renderQuizDone(result.data.skor, null, result.data.pembahasan, result.data.klasifikasi);
            }
            return;
        }

        quizSoalList = result.data.soal || [];
        quizPetunjuk = result.data.petunjuk || '';
        if (quizSoalList.length === 0) {
            renderQuizLocked('Soal belum tersedia. Coba lagi nanti.');
            return;
        }

        // Pulihkan jawaban yang sempat diisi sebelumnya (mis. peserta sempat
        // kembali ke dashboard di tengah pengerjaan), supaya tidak perlu
        // mengisi ulang dari awal. Jawaban untuk soal yang sudah tidak ada
        // lagi di set soal saat ini diabaikan.
        const idSoalValid = new Set(quizSoalList.map(s => s.id));
        const tersimpan = loadQuizProgressFromStorage();
        quizJawaban = {};
        Object.keys(tersimpan).forEach(soalId => {
            if (idSoalValid.has(parseInt(soalId, 10))) {
                quizJawaban[soalId] = tersimpan[soalId];
            }
        });

        // Pulihkan juga soal-soal yang sempat ditandai sebelumnya (lihat
        // toggleTandaiSoal), dengan aturan yang sama: tanda buat soal yang
        // sudah tidak ada lagi di set soal saat ini diabaikan.
        quizDitandai = new Set(Array.from(loadQuizFlagsFromStorage()).filter(id => idSoalValid.has(id)));

        // Simpan progres SEKARANG JUGA (walau peserta belum menjawab satu
        // soal pun) -- ini yang jadi penanda "kuis ini SUDAH PERNAH dibuka"
        // buat materi.html (lihat sudahMulaiKuisBab() di js/materi.js).
        // Sebelumnya progres baru tersimpan pertama kali SETELAH peserta
        // memilih jawaban, jadi kalau peserta cuma buka kuisnya lalu balik
        // lagi ke materi.html TANPA sempat menjawab apa-apa, materi.html
        // tidak tahu kuisnya sudah pernah dibuka dan tetap menampilkan
        // dialog konfirmasi "Mulai Kuis Sekarang?" lagi -- padahal dari
        // sudut pandang peserta, kuisnya memang sudah "dimulai" begitu
        // halaman ini dibuka.
        saveQuizProgress();

        if (quizConfig.babId || quizConfig.isTryout) {
            // Kuis per Bab & Final Tryout: get_soal.php/get_tryout.php
            // SENGAJA tidak menyertakan waktu_mulai (lihat catatan
            // panjang di sana) -- endpoint ini cuma "melihat" data,
            // termasuk buat layar riwayat percobaan di bawah, tanpa efek
            // samping mencatat waktu mulai. Waktu mulai yang SEBENARNYA
            // baru diambil belakangan, persis saat mulaiKerjakanSoalKuis()
            // dipanggil (baik langsung di bawah, kalau tidak ada riwayat
            // yang perlu ditampilkan dulu, MAUPUN lewat tombol "Coba
            // Lagi"). quizDurasiMenitInfo di sini cuma dipakai buat teks
            // konfirmasi "Coba Lagi" (konfirmasiCobaLagiKuis).
            quizPendingTimerInfo = null;
            quizDurasiMenitInfo = result.data.durasi_menit || null;
        } else {
            // Tes Diagnostik: TIDAK ada konsep "cuma mengintip riwayat"
            // (cuma bisa dikerjakan sekali, tidak ada layar riwayat
            // percobaan) -- setiap kali halaman ini dibuka memang berarti
            // peserta genuinely mulai/melanjutkan, jadi waktu mulai tetap
            // langsung dipakai dari respons endpoint ini seperti
            // sebelumnya (get_diagnostik.php TIDAK diubah, beda dengan
            // get_soal.php/get_tryout.php di atas).
            quizPendingTimerInfo = (result.data.durasi_menit && result.data.waktu_mulai)
                ? { waktuMulai: result.data.waktu_mulai, durasiMenit: result.data.durasi_menit }
                : null;
        }

        // Kuis per Bab & Final Tryout BOLEH diulang, dan sekarang setiap
        // percobaan (lulus/final ataupun tidak) tercatat di
        // hasil_kuis/tryout_hasil (lihat riwayat di atas). Kalau peserta
        // SUDAH PERNAH submit sebelumnya (belum lulus/final) dan TIDAK
        // sedang di tengah percobaan yang aktif, tampilkan dulu riwayat
        // nilai & jumlah percobaannya, baru peserta pilih sendiri kapan
        // mau "Coba Lagi" (via konfirmasiCobaLagiKuis). "Sedang di
        // tengah percobaan" dicek dari DUA hal: (a) quizJawaban ada
        // isinya (sudah sempat pilih jawaban), ATAU (b)
        // percobaanKuisSudahDimulai() true -- peserta sudah sempat masuk
        // ke halaman soal percobaan ini (via tombol "Ya, kerjakan"),
        // walau belum sempat pilih jawaban apa pun, lalu sempat pindah
        // halaman/balik lalu masuk lagi. Tanpa (b), peserta yang cuma
        // "melihat-lihat" soal tanpa menjawab lalu balik akan disuruh
        // konfirmasi ulang setiap kali masuk lagi -- padahal dari sudut
        // pandang peserta percobaan itu sudah dimulai.
        const sedangMengerjakan = Object.keys(quizJawaban).length > 0 || percobaanKuisSudahDimulai();
        const adaRiwayat = Array.isArray(result.data.riwayat) && result.data.riwayat.length > 0;
        if (!sedangMengerjakan && adaRiwayat) {
            if (quizConfig.isTryout) {
                tampilkanHasilTryout(result.data);
            } else {
                renderRiwayatKuisBab(result.data);
            }
            return;
        }

        await mulaiKerjakanSoalKuis();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' })
            .then(() => cnGoTo(quizConfig.backUrl));
    }
}

// =================================================================
// SIMPAN PROGRES PENGERJAAN DI LOCALSTORAGE (biar tidak reset kalau
// peserta sempat pindah halaman di tengah pengerjaan)
// =================================================================
function quizProgressStorageKey() {
    if (!quizConfig.storageKey || !quizCurrentUser) return null;
    return 'cn_progress_' + quizConfig.storageKey + '_' + quizCurrentUser.id;
}

function saveQuizProgress() {
    const key = quizProgressStorageKey();
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(quizJawaban));
    } catch (e) {
        // localStorage penuh/diblokir -- abaikan, tidak fatal
    }
}

function loadQuizProgressFromStorage() {
    const key = quizProgressStorageKey();
    if (!key) return {};
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function clearQuizProgress() {
    const key = quizProgressStorageKey();
    if (key) localStorage.removeItem(key);
    clearQuizFlags();
    clearQuizAttemptStarted();
}

// =================================================================
// PENANDA "PERCOBAAN INI SUDAH DIMULAI": dipakai supaya layar riwayat
// & dialog konfirmasi "Coba Lagi" (lihat konfirmasiCobaLagiKuis) TIDAK
// muncul lagi kalau peserta sempat masuk ke halaman soal (walau belum
// sempat jawab satu soal pun) lalu balik/pindah halaman -- dari sudut
// pandang peserta, percobaan itu sudah "dimulai", jadi tidak perlu
// dikonfirmasi ulang. Beda dengan pengecekan quizJawaban (yang cuma
// terisi kalau sudah ada jawaban tersimpan), penanda ini disimpan
// begitu soal DITAMPILKAN (lihat mulaiKerjakanSoalKuis), terlepas dari
// ada jawaban atau tidak, lalu ikut terhapus oleh clearQuizProgress()
// setiap kali submit (supaya percobaan BERIKUTNYA butuh konfirmasi
// baru lagi).
// =================================================================
function quizAttemptStorageKey() {
    if (!quizConfig.storageKey || !quizCurrentUser) return null;
    return 'cn_attempt_' + quizConfig.storageKey + '_' + quizCurrentUser.id;
}

function tandaiPercobaanKuisSudahDimulai() {
    const key = quizAttemptStorageKey();
    if (!key) return;
    try {
        localStorage.setItem(key, '1');
    } catch (e) {
        // localStorage penuh/diblokir -- abaikan, tidak fatal
    }
}

function percobaanKuisSudahDimulai() {
    const key = quizAttemptStorageKey();
    if (!key) return false;
    try {
        return localStorage.getItem(key) !== null;
    } catch (e) {
        return false;
    }
}

function clearQuizAttemptStarted() {
    const key = quizAttemptStorageKey();
    if (key) localStorage.removeItem(key);
}

// =================================================================
// TANDAI SOAL: peserta bisa menandai soal tertentu untuk dicek lagi
// nanti (mis. ragu-ragu jawabannya) -- tersimpan terpisah dari jawaban,
// dengan pola localStorage yang sama (per bab & per peserta), supaya
// tetap ada kalau peserta sempat pindah halaman lalu balik lagi.
// =================================================================
function quizFlagStorageKey() {
    if (!quizConfig.storageKey || !quizCurrentUser) return null;
    return 'cn_flag_' + quizConfig.storageKey + '_' + quizCurrentUser.id;
}

function saveQuizFlags() {
    const key = quizFlagStorageKey();
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(Array.from(quizDitandai)));
    } catch (e) {
        // localStorage penuh/diblokir -- abaikan, tidak fatal
    }
}

function loadQuizFlagsFromStorage() {
    const key = quizFlagStorageKey();
    if (!key) return new Set();
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed.map(id => parseInt(id, 10)) : []);
    } catch (e) {
        return new Set();
    }
}

function clearQuizFlags() {
    const key = quizFlagStorageKey();
    if (key) localStorage.removeItem(key);
}

/**
 * Tombol bookmark di pojok tiap kartu soal -- tandai/batalkan tanda soal
 * ini untuk dicek lagi nanti. Penandanya ikut tampil di navigator (titik
 * kuning di pojok nomor soal, lihat renderQuizNavigatorGrid) supaya
 * peserta bisa lihat sekilas soal mana saja yang ditandai tanpa harus
 * scroll ke soalnya satu-satu.
 */
function toggleTandaiSoal(soalId) {
    const kartu = document.querySelector(`.quiz-question-card[data-soal-id-card="${soalId}"]`);
    const tombol = kartu ? kartu.querySelector('.quiz-question-mark-btn') : null;
    const navBtn = document.querySelector(`.quiz-navigator-num[data-soal-id="${soalId}"]`);

    const jadiDitandai = !quizDitandai.has(soalId);
    quizDitandai[jadiDitandai ? 'add' : 'delete'](soalId);
    saveQuizFlags();

    if (kartu) kartu.classList.toggle('marked', jadiDitandai);
    if (navBtn) navBtn.classList.toggle('marked', jadiDitandai);
    if (tombol) {
        tombol.classList.toggle('marked', jadiDitandai);
        tombol.title = jadiDitandai ? 'Batalkan tanda soal ini' : 'Tandai soal ini untuk dicek lagi';
        const icon = tombol.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-regular', !jadiDitandai);
            icon.classList.toggle('fa-solid', jadiDitandai);
        }
    }
}

/**
 * Benar-benar mulai/lanjutkan pengerjaan soal -- merender kartu-kartu
 * soal & (kalau bab-nya punya batas waktu) menyalakan timernya. Dipanggil
 * langsung dari loadQuizSoal() kalau tidak ada riwayat yang perlu
 * ditampilkan dulu, ATAU belakangan dari tombol "Coba Lagi" di layar
 * riwayat (lihat renderRiwayatKuisBab).
 *
 * Khusus Kuis per Bab (quizConfig.babId) & Final Tryout
 * (quizConfig.isTryout): inilah SATU-SATUNYA titik di mana waktu mulai
 * benar-benar dicatat di server (lewat api/mulai_kuis_bab.php atau
 * api/mulai_tryout.php) -- persis saat soal benar-benar ditampilkan &
 * timer (kalau ada) dinyalakan, BUKAN cuma saat halaman kuis/tryout-nya
 * dibuka (itu tugas api/get_soal.php / api/get_tryout.php, yang sudah
 * sengaja dibuat tanpa efek samping, lihat catatan di sana & di
 * loadQuizSoal). Kalau fetch-nya gagal (mis. jaringan bermasalah),
 * peserta tetap dibiarkan mengerjakan TANPA timer daripada diblokir
 * total.
 */
async function mulaiKerjakanSoalKuis() {
    tandaiPercobaanKuisSudahDimulai();

    if (quizConfig.babId || quizConfig.isTryout) {
        try {
            const url = quizConfig.babId
                ? 'api/mulai_kuis_bab.php?bab_id=' + quizConfig.babId + '&user_id=' + quizCurrentUser.id
                : 'api/mulai_tryout.php?user_id=' + quizCurrentUser.id;
            const res = await fetch(url);
            const result = await res.json();
            if (result.status === 'success' && result.data.durasi_menit && result.data.waktu_mulai) {
                quizPendingTimerInfo = { waktuMulai: result.data.waktu_mulai, durasiMenit: result.data.durasi_menit };
            } else {
                quizPendingTimerInfo = null;
            }
        } catch (err) {
            quizPendingTimerInfo = null;
        }
    }

    renderQuizQuestions();
    if (quizPendingTimerInfo) {
        startQuizTimer(quizPendingTimerInfo.waktuMulai, quizPendingTimerInfo.durasiMenit);
    }
}

/**
 * Cek apakah peserta SUDAH PERNAH benar-benar mengerjakan Final Tryout
 * -- baik SUDAH PERNAH SUBMIT minimal 1x (dicek ke server, permanen,
 * ikut ke-reset kalau admin reset progres tryout-nya dari Panel Admin),
 * MAUPUN SEDANG di tengah percobaan yang aktif tapi belum sempat submit
 * (dicek dari localStorage 'cn_attempt_tryout_*'/'cn_progress_tryout_*'
 * yang ditulis js/quiz.js sendiri begitu peserta membuka soal tryout.html
 * -- lihat tandaiPercobaanKuisSudahDimulai()/saveQuizProgress()) --
 * dipakai supaya dialog konfirmasi "Mulai Final Tryout Sekarang?" cuma
 * muncul untuk yang BENAR-BENAR pertama kali, bukan buat peserta yang
 * misalnya sudah mulai tryout lewat dashboard lalu balik ke kuis.html
 * bab terakhir dan klik "Lanjut ke Final Tryout" lagi.
 *
 * SENGAJA dicek ke server (bukan localStorage) untuk bagian "sudah
 * pernah submit"-nya, supaya statusnya selalu ikut kondisi database
 * SEKARANG -- sebelumnya dipakai penanda localStorage
 * ('cn_pernah_masuk_tryout_') yang diisi begitu tryout.html PERNAH
 * dibuka sekali saja (walau belum pernah dikerjakan), dan tidak pernah
 * terhapus otomatis, termasuk kalau admin me-reset progres tryout
 * peserta ini -- efeknya dialognya jadi tidak pernah muncul lagi untuk
 * peserta yang sudah pernah sekali membuka halaman ini di masa lalu,
 * PADAHAL setelah di-reset, percobaan berikutnya seharusnya kembali
 * dianggap "pertama kali". Logika "sudah pernah submit"-nya SENGAJA
 * disamakan dengan perhitungan "pernahMasuk" di renderTryout() (js/
 * dashboard.js) -- sama-sama menghitung dari jumlah_percobaan yang
 * dikembalikan server -- walau file-nya terpisah karena dashboard.html
 * tidak memuat quiz.js.
 */
async function cekSudahPernahMasukTryout() {
    // Sedang di tengah percobaan aktif (soal tryout sudah pernah
    // ditampilkan dan/atau sudah sempat diisi sebagian, tapi belum
    // submit) -- cek localStorage LANGSUNG dengan key tryout yang tetap
    // (bukan lewat quizAttemptStorageKey()/quizProgressStorageKey(),
    // karena quizConfig di titik ini masih konfigurasi Kuis Bab, bukan
    // tryout, jadi key-nya akan salah kalau lewat situ).
    try {
        if (localStorage.getItem('cn_attempt_tryout_' + quizCurrentUser.id) !== null) return true;
        const raw = localStorage.getItem('cn_progress_tryout_' + quizCurrentUser.id);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return true;
        }
    } catch (e) {
        // localStorage penuh/diblokir/rusak -- abaikan, lanjut cek ke server
    }

    try {
        const res = await fetch('api/get_tryout.php?user_id=' + quizCurrentUser.id);
        const result = await res.json();
        if (result.status !== 'success') return false;
        return (result.data.jumlah_percobaan || 0) > 0;
    } catch (e) {
        // Gagal cek ke server -- anggap belum pernah supaya dialog
        // konfirmasi tetap muncul (lebih aman daripada melompati
        // konfirmasi tanpa kepastian).
        return false;
    }
}

/**
 * Konfirmasi dulu (dialog SweetAlert) sebelum berpindah ke Final Tryout
 * lewat tombol "Lanjut ke Final Tryout" di layar hasil Kuis Bab terakhir
 * (lihat tampilkanHasilKuisBab) -- supaya peserta tidak "kepencet" tanpa
 * sadar langsung masuk ke tes penutup, sama pola dengan dialog "Mulai
 * Kuis Sekarang?" di materi.html sebelum mengerjakan Kuis per Bab. Kalau
 * peserta sudah PERNAH mengerjakan Final Tryout sebelumnya (lihat
 * cekSudahPernahMasukTryout), langsung pindah tanpa konfirmasi lagi --
 * dialog ini cuma buat yang benar-benar pertama kali. Kalau dibatalkan,
 * layar hasil kuis bab ini tetap tampil (peserta bisa pilih "Kembali ke
 * Dashboard" dan masuk Final Tryout belakangan lewat tombol "Mulai
 * Final Tryout" di sana).
 */
async function konfirmasiLanjutTryout() {
    if (await cekSudahPernahMasukTryout()) {
        cnGoTo('tryout.html');
        return;
    }
    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Mulai Final Tryout Sekarang?',
        text: 'Ini tes penutup rangkaian Program Cakar Nalar, mencakup seluruh materi Bab 1-6. Pastikan kamu sudah siap sebelum memulai.',
        showCancelButton: true,
        confirmButtonText: 'Ya, kerjakan',
        cancelButtonText: 'Nanti Saja',
        confirmButtonColor: '#0C7A6E'
    });
    if (!konfirmasi.isConfirmed) return;
    cnGoTo('tryout.html');
}

/**
 * Konfirmasi dulu (dialog SweetAlert) sebelum benar-benar memulai ulang
 * pengerjaan soal lewat tombol "Coba Lagi" di layar riwayat (lihat
 * renderRiwayatKuisBab) -- supaya peserta tidak "kepencet" tanpa sadar,
 * sama seperti dialog "Mulai Kuis Sekarang?" di materi.html untuk
 * percobaan pertama. Kalau dibatalkan, layar riwayat tetap tampil.
 */
async function konfirmasiCobaLagiKuis() {
    // quizDurasiMenitInfo cuma terisi kalau bab ini memang punya batas
    // waktu kuis -- jadi kalimatnya langsung menyatakan kepastian, BUKAN
    // berandai-andai ("kalau kuis ini punya batas waktu..."). Dipakai
    // (bukan quizPendingTimerInfo) karena waktu mulai yang SEBENARNYA
    // baru diambil belakangan di dalam mulaiKerjakanSoalKuis() -- di
    // titik ini quizPendingTimerInfo untuk Kuis per Bab selalu masih
    // null (lihat catatan di loadQuizSoal).
    const infoTimer = quizDurasiMenitInfo
        ? ' Hitungan mundurnya langsung mulai begitu kamu klik Ya.'
        : '';
    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Mulai ' + (quizConfig.title || 'Kuis') + ' Sekarang?',
        text: 'Pastikan kamu sudah mempelajari ulang materinya sebelum mencoba lagi.' + infoTimer,
        showCancelButton: true,
        confirmButtonText: 'Ya, kerjakan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0C7A6E'
    });
    if (!konfirmasi.isConfirmed) return;
    await mulaiKerjakanSoalKuis();
}

/**
 * Bangun markup baris-baris riwayat percobaan (dipakai berdua: layar
 * riwayat sebelum "Coba Lagi" untuk yang belum lulus, ATAUPUN dropdown
 * "Riwayat Percobaan" di layar hasil yang SUDAH lulus -- lihat
 * renderRiwayatKuisBab & tampilkanHasilKuisBab). Skor tiap baris diberi
 * warna hijau kalau percobaan itu sendiri sudah mencapai nilai minimal
 * (atau bab-nya tidak punya nilai minimal sama sekali -- selalu lulus),
 * merah kalau tidak -- supaya kelihatan percobaan mana yang akhirnya
 * bikin peserta lulus.
 */
function buildRiwayatRowsHtml(riwayat, nilaiMinimal) {
    return riwayat.map((r, i) => {
        const rowLulus = (nilaiMinimal === null || nilaiMinimal === undefined) || r.skor >= nilaiMinimal;
        return `
        <div class="quiz-riwayat-row">
            <div class="quiz-riwayat-row-left">
                <span class="quiz-riwayat-attempt-num">Percobaan ke-${riwayat.length - i}</span>
                <span class="quiz-riwayat-date">${formatTanggalRiwayat(r.tanggal)}</span>
            </div>
            <div class="quiz-riwayat-row-right">
                <span class="quiz-riwayat-benar">${r.jumlah_benar}/${r.jumlah_soal} benar</span>
                <span class="quiz-riwayat-skor${rowLulus ? ' lulus' : ''}">${r.skor}</span>
            </div>
        </div>`;
    }).join('');
}

/**
 * Layar riwayat percobaan Kuis per Bab -- ditampilkan begitu peserta
 * membuka lagi kuis yang PERNAH disubmit tapi BELUM lulus (lihat
 * loadQuizSoal), supaya peserta bisa lihat dulu nilai-nilai percobaan
 * sebelumnya & sudah berapa kali mencoba, sebelum benar-benar mulai
 * mengerjakan lagi lewat tombol "Coba Lagi".
 */
function renderRiwayatKuisBab(data) {
    const container = document.getElementById('quiz-content');
    const riwayat = data.riwayat || [];
    const jumlahPercobaan = data.jumlah_percobaan || riwayat.length;

    const infoNilaiMinimal = (data.nilai_minimal !== null && data.nilai_minimal !== undefined)
        ? ` Nilai minimal kelulusannya ${data.nilai_minimal}.`
        : '';

    const riwayatRowsHtml = buildRiwayatRowsHtml(riwayat, data.nilai_minimal);

    container.innerHTML = `
        <div class="quiz-result-card">
            <div class="quiz-result-icon gagal"><i class="fa-solid fa-clock-rotate-left"></i></div>
            <h3>Belum Lulus -- ${jumlahPercobaan}x Percobaan</h3>
            <p class="desc">Kamu sudah mencoba kuis ini ${jumlahPercobaan} kali tapi belum mencapai nilai minimal.${infoNilaiMinimal} Pelajari lagi materinya, lalu coba lagi kalau sudah siap.</p>
            <button class="quiz-result-back-btn" onclick="konfirmasiCobaLagiKuis()">
                <i class="fa-solid fa-rotate-left"></i> Coba Lagi
            </button>
        </div>
        <div class="quiz-riwayat-list-card">
            <div class="quiz-riwayat-list-title"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat Percobaan</div>
            ${riwayatRowsHtml}
        </div>`;
    revealQuizFooter();
    hideQuizNavigator();
}

/**
 * Ubah "2026-09-20T14:05:00" (format created_at dari server, lihat
 * get_soal.php) jadi "20 Sep 2026, 14:05" yang lebih gampang dibaca.
 */
function formatTanggalRiwayat(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const bulanList = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const tgl = String(d.getDate()).padStart(2, '0');
        const jam = String(d.getHours()).padStart(2, '0');
        const menit = String(d.getMinutes()).padStart(2, '0');
        return `${tgl} ${bulanList[d.getMonth()]} ${d.getFullYear()}, ${jam}:${menit}`;
    } catch (e) {
        return iso;
    }
}

// =================================================================
// RENDER: soal-soal + bar progres di bawah
// =================================================================
function renderQuizQuestions() {
    const container = document.getElementById('quiz-content');

    const petunjukHtml = quizPetunjuk ? `
        <div class="quiz-petunjuk-box">
            <div class="quiz-petunjuk-title"><i class="fa-solid fa-circle-info"></i> Petunjuk Pengerjaan</div>
            <div class="quiz-petunjuk-text">${sanitizeRichHtmlQuiz(quizPetunjuk)}</div>
        </div>` : '';

    const questionsHtml = quizSoalList.map((soal, idx) => {
        const ditandai = quizDitandai.has(soal.id);
        return `
        <div class="quiz-question-card${ditandai ? ' marked' : ''}" data-soal-id-card="${soal.id}">
            <div class="quiz-question-top">
                <div class="quiz-question-number">${idx + 1}</div>
                <button type="button" class="quiz-question-mark-btn${ditandai ? ' marked' : ''}"
                    onclick="toggleTandaiSoal(${soal.id})"
                    title="${ditandai ? 'Batalkan tanda soal ini' : 'Tandai soal ini untuk dicek lagi'}">
                    <i class="fa-${ditandai ? 'solid' : 'regular'} fa-bookmark"></i>
                    <span class="quiz-question-mark-label">Tandai</span>
                </button>
            </div>
            <div class="quiz-question-text">${sanitizeRichHtmlQuiz(soal.pertanyaan)}</div>
            ${renderQuizOptionsForSoal(soal)}
        </div>
    `;
    }).join('');

    container.innerHTML = petunjukHtml + questionsHtml;
    bungkusTabelScrollQuiz(container);
    initGambarLightboxQuiz(container);
    revealQuizFooter();

    document.getElementById('quiz-footer-bar').style.display = 'block';
    updateQuizProgress();

    quizNavigatorPage = 0;
    renderQuizNavigator();
}

/**
 * Render pilihan jawaban satu soal. Sejak FASE 9 (schema.sql), KETIGA
 * jenis soal (Kuis per Bab, Tes Diagnostik, Final Tryout) sama-sama
 * punya pilihan DINAMIS (jumlah bebas, tersimpan di soal.pilihan sebagai
 * array [{id, teks}]) -- value yang dikirim & disimpan di quizJawaban
 * berupa ID pilihan (angka). Cabang huruf a-d di bawah ini dipertahankan
 * hanya sebagai fallback kalau backend suatu saat kirim format lama.
 */
function renderQuizOptionsForSoal(soal) {
    if (Array.isArray(soal.pilihan)) {
        return soal.pilihan.map((opt, i) => `
            <div class="quiz-option${quizJawaban[soal.id] === opt.id ? ' selected' : ''}" data-soal-id="${soal.id}" data-value="${opt.id}" onclick="pilihJawaban(${soal.id}, ${opt.id})">
                <div class="quiz-option-letter">${String.fromCharCode(65 + i)}</div>
                <div class="quiz-option-text">${sanitizeRichHtmlQuiz(opt.teks)}</div>
            </div>
        `).join('');
    }

    return ['a', 'b', 'c', 'd'].map(letter => `
        <div class="quiz-option${quizJawaban[soal.id] === letter ? ' selected' : ''}" data-soal-id="${soal.id}" data-value="${letter}" onclick="pilihJawaban(${soal.id}, '${letter}')">
            <div class="quiz-option-letter">${letter.toUpperCase()}</div>
            <div class="quiz-option-text">${sanitizeRichHtmlQuiz(soal['pilihan_' + letter])}</div>
        </div>
    `).join('');
}

// =================================================================
// NAVIGATOR SOAL: panel mengambang di kanan layar yang menampilkan
// nomor semua soal (biru = sudah dijawab, abu = belum), bisa
// di-minimize/maximize, dan dipaginasi 10 nomor per halaman.
// =================================================================
function renderQuizNavigator() {
    const panel = document.getElementById('quiz-navigator');
    if (!panel) return;

    if (quizSoalList.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';
    renderQuizNavigatorGrid();
    renderQuizNavigatorPagination();
    setQuizNavigatorDefaultState();
}

/**
 * Kondisi awal panel navigator saat soal pertama kali dimuat: terbuka
 * di layar besar (desktop), tapi tertutup (minimized) di layar kecil (HP)
 * supaya tidak menutupi soal begitu tes dimulai. Sama dengan breakpoint
 * responsif panelnya sendiri di css/quiz.css (991.98px).
 *
 * Catatan: posisi panel ini sekarang SELALU tetap (pojok kanan-bawah, di
 * atas bar progres) lewat CSS saja untuk semua ukuran layar -- percobaan
 * sebelumnya yang menghitung posisi lewat JS (mengikuti tepi kanan konten,
 * plus kompensasi lebar scrollbar) dihapus karena rapuh & sulit ditebak
 * hasilnya di berbagai kombinasi lebar layar/scrollbar. Fungsi ini
 * sekarang HANYA mengatur status buka/tutup default-nya.
 */
function setQuizNavigatorDefaultState() {
    const panel = document.getElementById('quiz-navigator');
    if (!panel) return;

    const layarKecil = window.innerWidth <= 991.98;
    panel.classList.toggle('minimized', layarKecil);

    const btnIcon = document.querySelector('#quiz-navigator-toggle-btn i');
    if (btnIcon) {
        btnIcon.classList.toggle('fa-list-ol', layarKecil);
        btnIcon.classList.toggle('fa-xmark', !layarKecil);
    }
}

function renderQuizNavigatorGrid() {
    const grid = document.getElementById('quiz-navigator-grid');
    if (!grid) return;

    const perPage = 10;
    const start = quizNavigatorPage * perPage;
    const end = Math.min(start + perPage, quizSoalList.length);

    let html = '';
    for (let i = start; i < end; i++) {
        const soal = quizSoalList[i];
        const terjawab = !!quizJawaban[soal.id];
        const ditandai = quizDitandai.has(soal.id);
        const kelas = ['quiz-navigator-num'];
        if (terjawab) kelas.push('answered');
        if (ditandai) kelas.push('marked');
        html += `<button type="button" class="${kelas.join(' ')}" data-soal-id="${soal.id}" onclick="gotoQuizSoal(${soal.id})">${i + 1}</button>`;
    }
    grid.innerHTML = html;
}

function renderQuizNavigatorPagination() {
    const el = document.getElementById('quiz-navigator-pagination');
    if (!el) return;

    const perPage = 10;
    const totalPages = Math.ceil(quizSoalList.length / perPage);

    if (totalPages <= 1) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    el.style.display = 'flex';
    el.innerHTML = `
        <button type="button" class="quiz-navigator-page-btn" onclick="gantiHalamanNavigator(-1)" ${quizNavigatorPage === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="quiz-navigator-page-label">Hal ${quizNavigatorPage + 1}/${totalPages}</span>
        <button type="button" class="quiz-navigator-page-btn" onclick="gantiHalamanNavigator(1)" ${quizNavigatorPage === totalPages - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;
}

function gantiHalamanNavigator(delta) {
    const totalPages = Math.ceil(quizSoalList.length / 10);
    const next = quizNavigatorPage + delta;
    if (next < 0 || next >= totalPages) return;

    quizNavigatorPage = next;
    renderQuizNavigatorGrid();
    renderQuizNavigatorPagination();
}

function gotoQuizSoal(soalId) {
    const card = document.querySelector(`.quiz-question-card[data-soal-id-card="${soalId}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toggleQuizNavigator() {
    const panel = document.getElementById('quiz-navigator');
    if (!panel) return;
    const jadiMinimized = panel.classList.toggle('minimized');

    const btnIcon = document.querySelector('#quiz-navigator-toggle-btn i');
    if (btnIcon) {
        btnIcon.classList.toggle('fa-list-ol', jadiMinimized);
        btnIcon.classList.toggle('fa-xmark', !jadiMinimized);
    }
}

function hideQuizNavigator() {
    const panel = document.getElementById('quiz-navigator');
    if (panel) panel.style.display = 'none';
}

/**
 * Sembunyikan lagi badge hitungan mundur begitu kuis selesai dikirim.
 * stopQuizTimer() cuma menghentikan interval-nya (angkanya berhenti
 * berubah) tapi badge-nya SENDIRI tetap tampil di layar dengan angka
 * terakhir "beku" -- dari sudut pandang peserta kelihatannya seperti
 * "waktunya masih ada" padahal cuma bekas tampilan lama yang lupa
 * disembunyikan. Dipanggil dari layar hasil (tampilkanHasilKuisBab,
 * renderQuizDone) supaya badge-nya hilang begitu hasil kuis tampil.
 */
function hideQuizTimer() {
    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) timerEl.style.display = 'none';
}

/**
 * Buka/tutup kartu "Kategori Rentang Skor" di halaman hasil kuis.
 * Defaultnya tertutup (collapsed) supaya halaman hasil tidak terlalu panjang,
 * peserta yang penasaran tinggal klik judulnya untuk melihat detail rentangnya.
 */
/**
 * Buka/tutup satu kartu dropdown, mengukur tinggi konten SESUNGGUHNYA
 * (scrollHeight) begitu dibuka -- bukan menebak angka max-height tetap di
 * CSS. Angka tebakan tetap (dipakai sebelumnya) bisa memotong konten yang
 * ternyata lebih tinggi dari perkiraan, contoh nyatanya: dropdown
 * "Pembahasan Jawaban" di kuis.html kepotong di layar HP karena kontennya
 * (banyak kartu soal + opsi yang bisa berbaris panjang di layar sempit)
 * lebih tinggi dari angka tebakan yang dipakai. Dipakai bersama oleh
 * toggleQuizRangeCard (kartu "Kategori Rentang Skor") dan toggleQuizCollapse
 * (kartu "Riwayat Percobaan" & "Pembahasan Jawaban" di tampilkanHasilKuisBab).
 *
 * Begitu animasi BUKA selesai, max-height DILEPAS SAMA SEKALI (jadi 'none'),
 * bukan dibiarkan menempel di angka scrollHeight yang sempat terukur --
 * scrollHeight itu angka BULAT (pembulatan sub-pixel), jadi kadang beda
 * sepersekian pixel dari tinggi asli konten. Kalau max-height dibiarkan
 * pas di angka itu, sepersekian pixel kelebihan konten (mis. border baris
 * paling bawah) ikut ke-crop oleh overflow:hidden -- ini yang bikin baris
 * terakhir "Riwayat Percobaan" kelihatan kepotong tipis di bawah,
 * terutama di kondisi layar/zoom tertentu yang pas kena pembulatan itu.
 * 'none' juga otomatis ikut kalau kontennya berubah belakangan (resize,
 * font custom baru kelar dimuat, dst) TANPA perlu diukur ulang lagi.
 * Sebaliknya waktu mau TUTUP, max-height 'none' tidak bisa langsung
 * dianimasikan turun ke 0 (browser tidak bisa interpolasi dari 'none'),
 * jadi dikembalikan dulu ke angka scrollHeight sesaat (+paksa reflow),
 * baru diturunkan ke 0 di frame berikutnya.
 */
function toggleCollapsibleCard(cardEl, bodySelector) {
    if (!cardEl) return;
    const body = cardEl.querySelector(bodySelector);
    cardEl.classList.toggle('collapsed');
    if (!body) return;
    if (cardEl.classList.contains('collapsed')) {
        body.style.maxHeight = body.scrollHeight + 'px';
        void body.offsetHeight; // paksa reflow supaya nilai di atas "tercatat" dulu sebelum diturunkan ke 0
        body.style.maxHeight = '0px';
    } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        const lepasBatasTinggi = (e) => {
            if (e.propertyName !== 'max-height') return;
            body.removeEventListener('transitionend', lepasBatasTinggi);
            if (!cardEl.classList.contains('collapsed')) body.style.maxHeight = 'none';
        };
        body.addEventListener('transitionend', lepasBatasTinggi);
    }
}

function toggleQuizRangeCard() {
    toggleCollapsibleCard(document.getElementById('quiz-range-card'), '.quiz-range-list');
}

/**
 * Buka/tutup kartu dropdown generik di layar hasil (dipakai buat "Riwayat
 * Percobaan" & "Pembahasan Jawaban" di tampilkanHasilKuisBab) -- pola sama
 * dengan toggleQuizRangeCard di atas, tapi bisa dipakai untuk beberapa
 * kartu berbeda dalam satu halaman lewat parameter id-nya.
 */
function toggleQuizCollapse(id) {
    toggleCollapsibleCard(document.getElementById(id), '.quiz-collapse-body');
    // Dropdown "Pembahasan Jawaban" punya tombol "kembali ke atas" sendiri
    // (lihat initBackToTopPembahasan) yang harus langsung dicek ulang begitu
    // dropdown ini dibuka/ditutup, tidak menunggu event scroll berikutnya.
    if (id === 'quiz-pembahasan-collapse' && backToTopUpdateFn) backToTopUpdateFn();
}

// =================================================================
// TOMBOL "KEMBALI KE ATAS" DI LAYAR HASIL KUIS PER BAB
// =================================================================
// Markup, kelas CSS, dan cara kerja cincin progresnya sama persis dengan
// tombol "back-to-top" di index.html (lihat initBackToTop di js/main.js).
// Bedanya di sini: tombolnya HANYA ditampilkan kalau dropdown "Pembahasan
// Jawaban" sedang terbuka -- kalau soal cukup banyak, dropdown itu bisa
// panjang dan scroll manual ke atas jadi merepotkan. Begitu dropdown
// ditutup lagi, tombolnya ikut disembunyikan.
let backToTopUpdateFn = null;

function initBackToTopPembahasan() {
    const btn = document.getElementById('backToTopBtn');
    const ring = document.getElementById('backToTopRing');
    if (!btn || !ring) return;

    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference;

    function update() {
        const pembahasanEl = document.getElementById('quiz-pembahasan-collapse');
        const terbuka = !!pembahasanEl && !pembahasanEl.classList.contains('collapsed');
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
        ring.style.strokeDashoffset = circumference * (1 - progress);
        btn.classList.toggle('show', terbuka && scrollTop > 320);
    }

    // Kalau halaman hasil dirender ulang (misal reopen), lepas dulu
    // listener yang lama supaya tidak dobel menempel ke window.
    if (backToTopUpdateFn) {
        window.removeEventListener('scroll', backToTopUpdateFn);
        window.removeEventListener('resize', backToTopUpdateFn);
    }
    backToTopUpdateFn = update;
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pilihJawaban(soalId, value) {
    // Klik pilihan yang SUDAH terpilih -> batalkan (undo) jawabannya,
    // balik jadi belum terjawab. Sebelumnya klik ulang pilihan yang sama
    // tidak ada efeknya (tetap terpilih) -- peserta yang berubah pikiran
    // (misal ternyata ragu) tidak punya cara untuk "mengosongkan lagi"
    // jawaban yang sudah diklik selain memilih opsi lain.
    // eslint-disable-next-line eqeqeq -- value bisa angka (pilihan dinamis) atau huruf (format baku)
    const dibatalkan = quizJawaban[soalId] !== undefined && quizJawaban[soalId] == value;

    if (dibatalkan) {
        delete quizJawaban[soalId];
    } else {
        quizJawaban[soalId] = value;
    }

    document.querySelectorAll(`.quiz-option[data-soal-id="${soalId}"]`).forEach(el => {
        // eslint-disable-next-line eqeqeq -- lihat catatan di atas
        el.classList.toggle('selected', !dibatalkan && el.dataset.value == value);
    });

    const navBtn = document.querySelector(`.quiz-navigator-num[data-soal-id="${soalId}"]`);
    if (navBtn) navBtn.classList.toggle('answered', !dibatalkan);

    saveQuizProgress();
    updateQuizProgress();
}

function updateQuizProgress() {
    const total = quizSoalList.length;
    const terjawab = Object.keys(quizJawaban).length;
    const persen = total > 0 ? Math.round((terjawab / total) * 100) : 0;

    document.getElementById('quiz-progress-num').textContent = terjawab + ' dari ' + total;
    document.getElementById('quiz-progress-fill').style.width = persen + '%';
    document.getElementById('quiz-submit-btn').disabled = terjawab < total;
}

// =================================================================
// SUBMIT
// =================================================================
async function submitQuizJawaban() {
    const total = quizSoalList.length;
    const terjawab = Object.keys(quizJawaban).length;

    if (terjawab < total) {
        Swal.fire({ icon: 'warning', title: 'Belum semua soal dijawab', text: 'Lengkapi dulu semua jawaban sebelum mengirim.' });
        return;
    }

    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Kirim jawaban?',
        text: 'Jawaban tidak bisa diubah lagi setelah dikirim.',
        showCancelButton: true,
        confirmButtonText: 'Ya, kirim',
        cancelButtonText: 'Cek lagi',
        confirmButtonColor: '#0C7A6E'
    });
    if (!konfirmasi.isConfirmed) return;

    await kirimJawabanKeServer();
}

/**
 * Kirim jawaban ke server (dipakai submit manual maupun auto-submit
 * saat waktu habis). Jawaban yang belum sempat dipilih peserta tetap
 * ikut terkirim sebagai kosong -- dinilai salah oleh server.
 */
async function kirimJawabanKeServer() {
    const btn = document.getElementById('quiz-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Mengirim...';
    }
    stopQuizTimer();

    try {
        const payload = { user_id: quizCurrentUser.id, jawaban: quizJawaban };
        if (quizConfig.babId) payload.bab_id = quizConfig.babId;

        const res = await fetch(quizConfig.apiSubmit, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'success') {
            clearQuizProgress();
            document.getElementById('quiz-footer-bar').style.display = 'none';

            if (quizConfig.babId) {
                // Kuis per Bab BOLEH diulang selama belum lulus (lihat
                // get_soal.php -- "sudah_selesai" di situ artinya "sudah
                // LULUS", bukan "sudah pernah mengerjakan"). Sebelumnya di
                // sini langsung reload() tanpa syarat: kalau peserta belum
                // lulus, fetch ulang itu balik mengirim SOAL KOSONG lagi
                // (bukan status "selesai"), jadi peserta cuma melihat
                // kuisnya "reset" ke awal tanpa tahu skornya berapa atau
                // kenapa harus mengulang -- persis keluhan "kok malah
                // ngulangi lagi". Sekarang hasilnya (lulus/tidak, skor,
                // jumlah benar) dirender LANGSUNG dari respons submit ini,
                // supaya peserta selalu lihat hasil percobaannya dulu,
                // baru pilih sendiri mau "Coba Lagi" atau kembali.
                tampilkanHasilKuisBab(result.data);
                return;
            }

            if (quizConfig.isTryout) {
                // Final Tryout BOLEH diulang selama skornya belum
                // mencapai TRYOUT_PASSING_SCORE (51, lihat
                // api/config.php) -- sama pola dengan Kuis per Bab di
                // atas, hasilnya (final/belum, skor, rubrik klasifikasi)
                // dirender LANGSUNG dari respons submit ini lewat
                // tampilkanHasilTryout.
                tampilkanHasilTryout(result.data);
                return;
            }

            // Tes Diagnostik: cuma bisa dikerjakan sekali, jadi reload di
            // sini aman -- fetch ulang akan melaporkan sudah_selesai=true
            // dan menampilkan hasilnya lewat renderQuizDone seperti biasa
            // (perilaku lama, tidak berubah).
            window.location.reload();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal mengirim', text: result.message || 'Terjadi kesalahan.' });
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="quiz-submit-btn-prefix">Selesai & </span>Kirim Jawaban';
            }
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="quiz-submit-btn-prefix">Selesai & </span>Kirim Jawaban';
        }
    }
}

// =================================================================
// TIMER / BATAS WAKTU (opsional, diatur admin)
// =================================================================
function startQuizTimer(waktuMulaiIso, durasiMenit) {
    quizDeadlineMs = new Date(waktuMulaiIso).getTime() + durasiMenit * 60 * 1000;

    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) timerEl.style.display = 'flex';

    updateQuizTimerDisplay();

    if (quizDeadlineMs - Date.now() <= 0) {
        waktuTesHabis();
        return;
    }

    quizTimerInterval = setInterval(() => {
        const sisa = quizDeadlineMs - Date.now();
        if (sisa <= 0) {
            waktuTesHabis();
            return;
        }
        updateQuizTimerDisplay();
    }, 1000);
}

function updateQuizTimerDisplay() {
    const textEl = document.getElementById('quiz-timer-text');
    const badgeEl = document.getElementById('quiz-timer');
    if (!textEl) return;

    const sisa = Math.max(0, quizDeadlineMs - Date.now());
    const menit = Math.floor(sisa / 60000);
    const detik = Math.floor((sisa % 60000) / 1000);
    textEl.textContent = String(menit).padStart(2, '0') + ':' + String(detik).padStart(2, '0');

    if (badgeEl) badgeEl.classList.toggle('warning', sisa <= 60000);
}

function stopQuizTimer() {
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
}

function waktuTesHabis() {
    if (quizWaktuHabis) return; // cegah double-trigger
    quizWaktuHabis = true;
    stopQuizTimer();
    updateQuizTimerDisplay();

    Swal.fire({
        icon: 'info',
        title: 'Waktu Habis',
        text: 'Waktu pengerjaan sudah habis. Jawabanmu dikirim otomatis.',
        confirmButtonColor: '#0C7A6E'
    });

    kirimJawabanKeServer();
}

/**
 * Render daftar pilihan untuk satu soal di pembahasan, dengan penanda
 * jawaban peserta dan kunci jawaban. Sejak FASE 9 (schema.sql), KETIGA
 * jenis soal (Kuis per Bab, Tes Diagnostik, Final Tryout) sama-sama
 * pakai pilihan dinamis (array item.pilihan berisi {id, teks}).
 * Fallback ke format huruf a-d lama di bawah HANYA untuk detail_json
 * yang tersimpan dari hasil tes yang dikerjakan SEBELUM migrasi ini
 * (kompatibilitas mundur, bukan jalur baru).
 */
function renderQuizReviewOptions(item) {
    if (Array.isArray(item.pilihan)) {
        // Pilihan dinamis -- jawaban_user/jawaban_benar di sini adalah ID
        // pilihan (angka), bukan huruf a-d.
        const kunciId = item.jawaban_benar;
        const dipilihId = item.jawaban_user;

        const optionsHtml = item.pilihan.map((opt, i) => {
            const isKunci = opt.id === kunciId;
            const isDipilih = opt.id === dipilihId;

            // Tag teks ("Jawabanmu (Benar)"/"Kunci Jawaban"/"Jawabanmu")
            // SENGAJA tidak dipakai lagi -- cukup warna (opt-benar/opt-salah)
            // saja untuk menandai kunci jawaban & jawaban peserta, biar
            // tampilannya lebih simpel.
            let cls = 'quiz-review-opt';
            if (isKunci && isDipilih) {
                cls += ' opt-benar';
            } else if (isKunci) {
                cls += ' opt-benar';
            } else if (isDipilih) {
                cls += ' opt-salah';
            }

            return `
                <div class="${cls}">
                    <div class="quiz-review-opt-letter">${String.fromCharCode(65 + i)}</div>
                    <div class="quiz-review-opt-text">${sanitizeRichHtmlQuiz(opt.teks)}</div>
                </div>`;
        }).join('');

        return `<div class="quiz-review-options">${optionsHtml}</div>`;
    }

    if (item.pilihan_a === undefined || item.pilihan_a === null) {
        return `
            <div class="quiz-review-answer-row">
                <span>Jawabanmu: <strong>${item.jawaban_user ? item.jawaban_user.toUpperCase() : '-'}</strong></span>
                ${!item.benar ? `<span>Kunci: <strong>${item.jawaban_benar.toUpperCase()}</strong></span>` : ''}
            </div>`;
    }

    const kunci = (item.jawaban_benar || '').toLowerCase();
    const dipilih = (item.jawaban_user || '').toLowerCase();

    const optionsHtml = ['a', 'b', 'c', 'd'].map(letter => {
        const teks = item['pilihan_' + letter];
        if (teks === null || teks === undefined || teks === '') return '';

        const isKunci = letter === kunci;
        const isDipilih = letter === dipilih;

        // Sama seperti di atas -- tag teks dihilangkan, cukup warna saja.
        let cls = 'quiz-review-opt';
        if (isKunci && isDipilih) {
            cls += ' opt-benar';
        } else if (isKunci) {
            cls += ' opt-benar';
        } else if (isDipilih) {
            cls += ' opt-salah';
        }

        return `
            <div class="${cls}">
                <div class="quiz-review-opt-letter">${letter.toUpperCase()}</div>
                <div class="quiz-review-opt-text">${sanitizeRichHtmlQuiz(teks)}</div>
            </div>`;
    }).join('');

    return `<div class="quiz-review-options">${optionsHtml}</div>`;
}

/**
 * Bangun markup kartu-kartu pembahasan (satu kartu per soal: benar/salah,
 * pertanyaan, pilihan dengan penanda jawaban peserta & kunci, penjelasan)
 * -- dipakai berdua: renderQuizDone (Tes Diagnostik/Tryout, selalu
 * tampil rata/tidak bisa ditutup) dan tampilkanHasilKuisBab (Kuis per Bab,
 * dibungkus dropdown yang bisa ditutup, cuma muncul kalau sudah lulus).
 */
function buildPembahasanCardsHtml(pembahasan) {
    return pembahasan.map((item, idx) => `
        <div class="quiz-review-card ${item.benar ? 'benar' : 'salah'}">
            <div class="quiz-review-top">
                <span class="quiz-review-badge ${item.benar ? 'benar' : 'salah'}">
                    <i class="fa-solid ${item.benar ? 'fa-check' : 'fa-xmark'}"></i> ${item.benar ? 'Benar' : 'Salah'}
                </span>
                <span class="quiz-review-number">Soal ${idx + 1}</span>
            </div>
            <div class="quiz-review-question">${sanitizeRichHtmlQuiz(item.pertanyaan)}</div>
            ${renderQuizReviewOptions(item)}
            ${item.penjelasan ? `
            <div class="quiz-review-explanation">
                <div class="quiz-review-explanation-title"><i class="fa-solid fa-lightbulb"></i> Penyelesaian</div>
                <div class="quiz-review-explanation-text">${sanitizeRichHtmlQuiz(item.penjelasan)}</div>
            </div>` : ''}
        </div>
    `).join('');
}

/**
 * Tampilan hasil KHUSUS Kuis per Bab, dirender LANGSUNG dari respons
 * submit_kuis.php (bukan lewat reload+fetch ulang, lihat catatan di
 * kirimJawabanKeServer) -- beda dari renderQuizDone (dipakai Diagnostik/
 * Tryout) karena kuis per bab punya dua kemungkinan hasil yang harus
 * jelas dibedakan: LULUS (selesai, lanjut ke bab berikutnya) atau BELUM
 * LULUS (boleh & harus mencoba lagi). showPembahasan/showRangeInfo di
 * config kuis.html sengaja false (lihat konfigurasinya) -- kuis per bab
 * memang tidak menampilkan kunci jawaban supaya peserta yang belum lulus
 * benar-benar mempelajari ulang materinya, bukan cuma menghafal jawaban
 * yang benar dari pembahasan lalu asal klik ulang.
 */
function tampilkanHasilKuisBab(data) {
    hideQuizNavigator();
    hideQuizTimer();
    const container = document.getElementById('quiz-content');
    const lulus = !!data.lulus;
    const warna = lulus ? 'hijau' : 'merah';

    const infoNilaiMinimal = (data.nilai_minimal !== null && data.nilai_minimal !== undefined)
        ? ` Nilai minimal kelulusannya ${data.nilai_minimal}.`
        : '';

    // Kalau lulus DAN ada bab selanjutnya (sudah otomatis terbuka begitu bab
    // ini lulus), tampilkan tombol pintasan langsung ke bab itu supaya
    // peserta tidak perlu balik ke dashboard dulu untuk lanjut belajar.
    const babSelanjutnya = data.bab_selanjutnya || null;

    // "bab_selanjutnya" dari submit_kuis.php cuma null kalau memang tidak
    // ada bab dengan nomor+1 (lihat catatan di sana) -- artinya bab yang
    // baru saja lulus ini adalah BAB TERAKHIR. Karena syarat buka satu bab
    // cuma "bab sebelumnya lulus" (rantai berurutan), lulus di bab terakhir
    // otomatis berarti SEMUA bab sudah lulus, jadi Final Tryout pasti sudah
    // terbuka juga (sama seperti syarat yang dicek dashboard.js sebelum
    // menampilkan tombol "Mulai Final Tryout") -- makanya di sini aman
    // langsung arahkan ke tryout.html tanpa perlu cek ulang ke server.
    const babTerakhir = lulus && !babSelanjutnya;

    // Kalimat "Bab berikutnya sekarang terbuka."/"Final Tryout sekarang
    // terbuka." (TANPA menyebut nama babnya) cuma ditambahkan kalau memang
    // ada tujuan lanjutan -- kalau bukan keduanya (mis. belum lulus),
    // kalimat ini dihilangkan sama sekali.
    const teksBabSelanjutnya = lulus ? (babTerakhir ? ' Final Tryout sekarang terbuka.' : (babSelanjutnya ? ' Bab berikutnya sekarang terbuka.' : '')) : '';

    const desc = lulus
        ? `Kamu menjawab benar ${data.jumlah_benar} dari ${data.jumlah_soal} soal.${teksBabSelanjutnya}`
        : `Kamu menjawab benar ${data.jumlah_benar} dari ${data.jumlah_soal} soal.${infoNilaiMinimal} Pelajari lagi materinya, lalu coba kerjakan ulang kuisnya.`;
    // Label tombol "kembali" MENYESUAIKAN tujuan sebenarnya dari
    // quizConfig.backUrl -- Kuis per Bab (kuis.html) baliknya ke
    // materi.html?bab_id=... (BUKAN dashboard.html), jadi labelnya harus
    // "Kembali ke Materi", bukan "Kembali ke Dashboard" yang menyesatkan
    // (lihat quizTombolKembaliLabel()). Diagnostik & Final Tryout tetap
    // "Kembali ke Dashboard" seperti biasa karena backUrl-nya memang
    // dashboard.html.
    const labelKembali = quizTombolKembaliLabel();
    const tombolHtml = lulus
        ? (babSelanjutnya
            ? `
            <div class="quiz-result-btn-row">
                <button class="quiz-result-back-btn" onclick="cnGoTo('materi.html?bab_id=${babSelanjutnya.id}')">
                    Lanjut ke Bab Berikutnya <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">${labelKembali}</button>
            </div>`
            : (babTerakhir
                ? `
            <div class="quiz-result-btn-row">
                <button class="quiz-result-back-btn" onclick="konfirmasiLanjutTryout()">
                    Lanjut ke Final Tryout <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">${labelKembali}</button>
            </div>`
                : `<button class="quiz-result-back-btn" onclick="cnGoTo('${quizConfig.backUrl}')">${labelKembali}</button>`))
        : `
        <div class="quiz-result-btn-row">
            <button class="quiz-result-back-btn" onclick="ulangiKuisBab()">
                <i class="fa-solid fa-rotate-left"></i> Coba Lagi
            </button>
            <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">${labelKembali}</button>
        </div>`;

    // Begitu peserta LULUS, boleh lihat lagi riwayat semua percobaannya
    // (termasuk yang gagal sebelumnya) dan pembahasan lengkap percobaan
    // yang bikin lulus -- keduanya dropdown (tertutup by default) supaya
    // layar hasil tidak langsung panjang. Sengaja TIDAK ditampilkan kalau
    // belum lulus (lihat catatan showPembahasan di atas -- mencegah
    // peserta menghafal kunci jawaban buat percobaan ulang).
    const riwayat = Array.isArray(data.riwayat) ? data.riwayat : [];
    const riwayatDropdownHtml = (lulus && riwayat.length > 0) ? `
        <div class="quiz-collapse-card collapsed" id="quiz-riwayat-collapse">
            <button type="button" class="quiz-collapse-title" onclick="toggleQuizCollapse('quiz-riwayat-collapse')">
                <span class="quiz-collapse-title-text"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat Percobaan (${data.jumlah_percobaan || riwayat.length}x)</span>
                <i class="fa-solid fa-chevron-down quiz-collapse-toggle-icon"></i>
            </button>
            <div class="quiz-collapse-body">
                ${buildRiwayatRowsHtml(riwayat, data.nilai_minimal)}
            </div>
        </div>` : '';

    const pembahasan = Array.isArray(data.pembahasan) ? data.pembahasan : [];
    const pembahasanDropdownHtml = (lulus && pembahasan.length > 0) ? `
        <div class="quiz-collapse-card collapsed" id="quiz-pembahasan-collapse">
            <button type="button" class="quiz-collapse-title" onclick="toggleQuizCollapse('quiz-pembahasan-collapse')">
                <span class="quiz-collapse-title-text"><i class="fa-solid fa-lightbulb"></i> Pembahasan Jawaban</span>
                <i class="fa-solid fa-chevron-down quiz-collapse-toggle-icon"></i>
            </button>
            <div class="quiz-collapse-body quiz-review-list">
                ${buildPembahasanCardsHtml(pembahasan)}
            </div>
        </div>` : '';

    // Tombol "kembali ke atas" -- lihat catatan di initBackToTopPembahasan.
    // Cuma dirender kalau dropdown Pembahasan Jawaban-nya ada (peserta lulus
    // & punya data pembahasan); kalau tidak, tidak perlu tombolnya sama sekali.
    const backToTopHtml = (lulus && pembahasan.length > 0) ? `
        <button class="back-to-top" id="backToTopBtn" onclick="scrollToTop()" aria-label="Kembali ke atas">
            <svg class="back-to-top-ring" width="40" height="40" viewBox="0 0 40 40">
                <circle class="ring-bg" cx="20" cy="20" r="17"></circle>
                <circle class="ring-progress" id="backToTopRing" cx="20" cy="20" r="17"></circle>
            </svg>
            <i class="fa-solid fa-chevron-up"></i>
        </button>` : '';

    container.innerHTML = `
        <div class="quiz-result-card">
            ${quizDecorHtml(lulus ? 'hijau' : 'merah', lulus ? 'fa-trophy' : 'fa-triangle-exclamation')}
            <div class="quiz-result-icon${lulus ? '' : ' gagal'}"><i class="fa-solid ${lulus ? 'fa-check' : 'fa-rotate-left'}"></i></div>
            <h3>${lulus ? (quizConfig.doneTitle || 'Selamat, Kamu Lulus!') : 'Belum Lulus'}</h3>
            <div class="quiz-result-score ${warna}">${data.skor}</div>
            <p class="desc">${escapeHtmlQuiz(desc)}</p>
            ${tombolHtml}
        </div>
        ${riwayatDropdownHtml}
        ${pembahasanDropdownHtml}
        ${backToTopHtml}`;
    bungkusTabelScrollQuiz(container);
    initGambarLightboxQuiz(container);
    revealQuizFooter();

    // Scroll ke paling atas halaman -- SAMA PERSIS alasan & pola dengan
    // tampilkanHasilTryout() (lihat catatan panjang di situ): tanpa ini,
    // posisi scroll ikut posisi terakhir sebelum submit (dekat tombol
    // "Kirim Jawaban" soal terakhir), jadi peserta malah mendarat di
    // tengah/bawah kartu hasil, bukan dari judul/skor paling atas.
    // "instant" (bukan "auto") supaya benar-benar langsung lompat, bukan
    // ikut dianimasikan halus oleh "html { scroll-behavior: smooth; }"
    // global (css/style.css) lalu gampang keputus di tengah jalan.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    if (backToTopHtml) initBackToTopPembahasan();
}

/**
 * Tombol "Coba Lagi" di hasil kuis yang belum lulus -- muat ulang
 * halaman supaya soal kuisnya diambil ulang dari server dari awal
 * (get_soal.php otomatis mengirim set soal lagi selama belum lulus).
 */
function ulangiKuisBab() {
    window.location.reload();
}

/**
 * Layar hasil Final Tryout -- dipakai baik langsung setelah submit
 * MAUPUN saat peserta membuka lagi halaman tryout.html (baik yang
 * sudah final maupun yang belum, lihat loadQuizSoal & kirimJawabanKeServer).
 * Beda dengan tampilkanHasilKuisBab (Kuis per Bab):
 * - Rubrik klasifikasi Paul & Elder (3 kategori skor) SELALU tampil,
 *   lulus/final ataupun belum -- supaya peserta yang belum final tahu
 *   di kategori mana skornya sekarang & apa target berikutnya.
 * - Tombol "Coba Lagi" HANYA muncul kalau BELUM mencapai skor final
 *   (TRYOUT_PASSING_SCORE = 51, lihat api/config.php) -- begitu sudah
 *   final, Final Tryout tidak bisa diulang lagi sama sekali (submit_
 *   tryout.php juga menolaknya di server, bukan cuma disembunyikan di
 *   sini).
 * - Dropdown "Pembahasan Jawaban" HANYA muncul kalau sudah final --
 *   selama belum, kunci jawaban sengaja tidak dikirim server sama
 *   sekali (lihat get_tryout.php/submit_tryout.php) supaya tidak
 *   bocor buat percobaan ulang.
 */
function tampilkanHasilTryout(data) {
    hideQuizNavigator();
    hideQuizTimer();
    const container = document.getElementById('quiz-content');
    const skor = data.skor;
    const final = !!data.lulus;
    const warna = final ? 'hijau' : 'merah';

    const klasifikasi = data.klasifikasi || null;
    const klasifikasiWarna = klasifikasi ? (klasifikasi.warna || '') : '';
    const klasifikasiIcon = { merah: 'fa-triangle-exclamation', kuning: 'fa-circle-exclamation', hijau: 'fa-brain' };
    const klasifikasiHtml = klasifikasi ? `
        <div class="quiz-klasifikasi-badge ${klasifikasiWarna}">
            <i class="fa-solid ${klasifikasiIcon[klasifikasiWarna] || 'fa-brain'}"></i>
            <div>
                <div class="quiz-klasifikasi-label">${quizItalicizeInggris(klasifikasi.label)}</div>
                <div class="quiz-klasifikasi-desc">${quizItalicizeInggris(klasifikasi.deskripsi)}</div>
            </div>
        </div>` : '';

    // Rubrik lengkap (3 kategori) -- SENGAJA beda rentang skornya dari
    // Tes Diagnostik (lihat daftarRangeSkor di renderQuizDone, itu
    // 0-40/41-70/71-100) -- Final Tryout memakai 0-50/51-75/76-100,
    // SAMAKAN dengan cn_klasifikasi_tryout() di api/config.php.
    const daftarRangeSkorTryout = [
        {
            min: 0, max: 50, warna: 'merah', label: 'Unreflective Thinker',
            deskripsi: 'Peserta masih rentan terhadap disinformasi, mudah terpengaruh bias emosional, dan belum sepenuhnya menguasai verifikasi logika dasar. Peserta pada kategori ini disarankan untuk mereview ulang materi modul secara komprehensif.'
        },
        {
            min: 51, max: 75, warna: 'kuning', label: 'Challenged / Beginning Thinker',
            deskripsi: 'Peserta sudah mulai mengenali anomali informasi dan cacat logika, namun masih sering terkecoh oleh sesat pikir (logical fallacy) tingkat lanjut atau jebakan pengecoh skenario kompleks.'
        },
        {
            min: 76, max: 100, warna: 'hijau', label: 'Practicing hingga Master Thinker',
            deskripsi: 'Peserta memiliki nalar kritis yang matang, menguasai verifikasi multi-kriteria secara presisi, kebal terhadap manipulasi ruang gema, dan sangat layak dinobatkan sebagai agen perubahan digital yang cakap.'
        }
    ];
    const rangeSkorHtml = `
        <div class="quiz-range-card collapsed" id="quiz-range-card">
            <button type="button" class="quiz-range-info-title" onclick="toggleQuizRangeCard()">
                <span class="quiz-range-info-title-text"><i class="fa-solid fa-ruler-horizontal"></i> Rubrik Klasifikasi Penilaian</span>
                <i class="fa-solid fa-chevron-down quiz-range-toggle-icon"></i>
            </button>
            <div class="quiz-range-list">
                <p class="quiz-range-intro">${quizItalicizeInggris('Skor total peserta dikelompokkan ke dalam tiga tahapan perkembangan nalar kritis berdasarkan rubrik Paul & Elder Critical Thinking Stages:')}</p>
                ${daftarRangeSkorTryout.map(range => `
                    <div class="quiz-range-item ${range.warna}${range.warna === klasifikasiWarna ? ' active' : ''}">
                        <div class="quiz-range-item-top">
                            <span class="quiz-range-badge">${range.min}-${range.max}</span>
                            <span class="quiz-range-label">${quizItalicizeInggris(range.label)}</span>
                            ${range.warna === klasifikasiWarna ? '<span class="quiz-range-tag"><i class="fa-solid fa-check"></i> Skormu</span>' : ''}
                        </div>
                        <p class="quiz-range-desc">${quizItalicizeInggris(range.deskripsi)}</p>
                    </div>
                `).join('')}
            </div>
        </div>`;

    const desc = final
        ? `Terima kasih sudah menyelesaikan seluruh rangkaian Program Cakar Nalar dengan baik!`
        : `Skor percobaan terakhirmu belum mencapai batas minimal ${data.passing_score || 51} poin. Pelajari lagi materinya, lalu coba kerjakan ulang Final Tryout ini.`;

    // Tombol "Lihat Laporan Lengkap" HANYA muncul begitu final (lulus) --
    // labelnya, ikonnya, & tujuannya (laporan.html) SENGAJA disamakan
    // persis dengan tombol yang sama di dashboard.html (lihat
    // #welcome-complete-actions di js/dashboard.js, tampil begitu progres
    // 100%) -- lulus Final Tryout di sini PERSIS momen progres jadi 100%,
    // jadi peserta tidak perlu balik ke Dashboard dulu cuma buat klik
    // tombol yang sama.
    const tombolHtml = final
        ? `
        <div class="quiz-result-btn-row">
            <button class="quiz-result-back-btn" onclick="cnGoTo('laporan.html')">
                <i class="fa-solid fa-file-lines"></i> Lihat Laporan Lengkap
            </button>
            <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">Kembali ke Dashboard</button>
        </div>`
        : `
        <div class="quiz-result-btn-row">
            <button class="quiz-result-back-btn" onclick="konfirmasiCobaLagiKuis()">
                <i class="fa-solid fa-rotate-left"></i> Coba Lagi
            </button>
            <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">Kembali ke Dashboard</button>
        </div>`;

    const riwayat = Array.isArray(data.riwayat) ? data.riwayat : [];
    const riwayatDropdownHtml = riwayat.length > 0 ? `
        <div class="quiz-collapse-card collapsed" id="quiz-riwayat-collapse">
            <button type="button" class="quiz-collapse-title" onclick="toggleQuizCollapse('quiz-riwayat-collapse')">
                <span class="quiz-collapse-title-text"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat Percobaan (${data.jumlah_percobaan || riwayat.length}x)</span>
                <i class="fa-solid fa-chevron-down quiz-collapse-toggle-icon"></i>
            </button>
            <div class="quiz-collapse-body">
                ${buildRiwayatRowsHtml(riwayat, data.passing_score)}
            </div>
        </div>` : '';

    // Pembahasan Jawaban SENGAJA TIDAK PERNAH ditampilkan ke peserta untuk
    // Final Tryout -- baik sudah final (lulus) maupun belum -- sama seperti
    // Tes Diagnostik (lihat showPembahasan:false di diagnostik.html/
    // renderQuizDone). Server sendiri juga sudah tidak mengirim data
    // pembahasan sama sekali di endpoint peserta (lihat catatan di
    // get_tryout.php/submit_tryout.php), jadi blok "Pembahasan Jawaban" +
    // tombol "back to top"-nya dihapus total di sini, bukan cuma
    // disembunyikan kondisional. Admin tetap bisa melihat rincian jawaban
    // peserta lewat dialog "Rincian Final Tryout" di Panel Admin (baca
    // langsung dari database, tidak lewat endpoint ini).

    container.innerHTML = `
        <div class="quiz-result-card">
            ${quizDecorHtml(final ? 'hijau' : 'merah', final ? 'fa-trophy' : 'fa-triangle-exclamation')}
            <div class="quiz-result-icon${final ? '' : ' gagal'}"><i class="fa-solid ${final ? 'fa-check' : 'fa-rotate-left'}"></i></div>
            <h3>${final ? (quizConfig.doneTitle || 'Final Tryout Selesai') : 'Belum Mencapai Skor Final'}</h3>
            <div class="quiz-result-score ${warna}">${skor}</div>
            <p class="desc">${escapeHtmlQuiz(desc)}</p>
            ${klasifikasiHtml}
            ${tombolHtml}
        </div>
        ${rangeSkorHtml}
        ${riwayatDropdownHtml}`;
    bungkusTabelScrollQuiz(container);
    initGambarLightboxQuiz(container);
    revealQuizFooter();

    // Scroll ke paling atas halaman -- TANPA ini, posisi scroll ikut
    // posisi terakhir sebelum submit (biasanya di bagian bawah, dekat
    // tombol "Kirim Jawaban" soal terakhir), jadi peserta yang baru
    // selesai mengerjakan malah mendarat di tengah/bawah layar hasil
    // (kelihatan seperti "nyangkut" di bawah), bukan dari judul "Final
    // Tryout Selesai"/skor di paling atas. Berlaku juga waktu peserta
    // membuka ulang halaman ini setelah pernah selesai (lihat
    // loadQuizSoal) -- posisi scroll browser tetap dipertahankan dari
    // kunjungan sebelumnya kalau tidak di-reset manual di sini.
    //
    // "behavior: 'instant'" (BUKAN 'auto') -- seluruh halaman situs ini
    // punya "html { scroll-behavior: smooth; }" (css/style.css), dan
    // menurut spesifikasinya nilai "auto" di sini justru berarti "ikuti
    // saja aturan CSS scroll-behavior halaman", BUKAN "paksa langsung
    // tanpa animasi" seperti dugaan awal -- jadi dengan "auto" scroll-nya
    // tetap dianimasikan halus (butuh waktu >1 detik buat jarak yang
    // jauh), dan gampang "keganggu"/keputus di tengah jalan begitu
    // konten kartu hasil masih berubah-ubah tinggi sesaat setelahnya,
    // sehingga peserta bisa mendarat di posisi tengah, bukan benar-benar
    // di paling atas. "instant" memaksa lompat SAAT ITU JUGA tanpa
    // animasi, terlepas dari scroll-behavior CSS.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/**
 * Tombol "Ayo Mulai Belajar!" di layar hasil Tes Diagnostik
 * (renderQuizDone, KHUSUS diagnostik -- lihat pemanggilnya di
 * loadQuizSoal) -- langsung ke materi Bab 1, TANPA peserta harus balik
 * ke Dashboard dulu buat klik bab pertama. Id Bab 1 tidak dikirim oleh
 * get_diagnostik.php (endpoint itu memang tidak tahu apa-apa soal bab),
 * jadi diambil di sini lewat api/get_bab.php (endpoint yang sama dipakai
 * dashboard.js) -- daftar bab-nya SUDAH terurut "ORDER BY b.nomor ASC",
 * jadi elemen PERTAMA di array "bab" itu Bab 1.
 */
async function mulaiBelajarBabPertama(btn) {
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memuat...';
    }
    try {
        const res = await fetch('api/get_bab.php?user_id=' + quizCurrentUser.id);
        const result = await res.json();
        const babPertama = (result.status === 'success' && Array.isArray(result.data.bab)) ? result.data.bab[0] : null;
        if (!babPertama) {
            throw new Error('Bab 1 tidak ditemukan');
        }
        cnGoTo('materi.html?bab_id=' + babPertama.id);
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Gagal Memuat', text: 'Tidak bisa membuka Bab 1 sekarang, silakan buka lewat Dashboard.' });
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-book-open"></i> Ayo Mulai Belajar!';
        }
    }
}

// =================================================================
// TAMPILAN: sudah selesai / terkunci
// =================================================================
function renderQuizDone(skor, customMessage, pembahasan, klasifikasi) {
    const container = document.getElementById('quiz-content');

    const klasifikasiIcon = {
        merah: 'fa-triangle-exclamation',
        kuning: 'fa-circle-exclamation',
        hijau: 'fa-brain'
    };
    const klasifikasiWarna = klasifikasi ? (klasifikasi.warna || '') : '';
    const klasifikasiHtml = klasifikasi ? `
        <div class="quiz-klasifikasi-badge ${klasifikasiWarna}">
            <i class="fa-solid ${klasifikasiIcon[klasifikasiWarna] || 'fa-brain'}"></i>
            <div>
                <div class="quiz-klasifikasi-label">${quizItalicizeInggris(klasifikasi.label)}</div>
                <div class="quiz-klasifikasi-desc">${quizItalicizeInggris(klasifikasi.deskripsi)}</div>
            </div>
        </div>` : '';

    // Daftar rentang skor & kategorinya (samakan dengan cn_klasifikasi_paul_elder
    // di api/config.php) supaya peserta bisa lihat sendiri skornya masuk
    // kategori yang mana, tanpa perlu tabel dari server.
    const daftarRangeSkor = [
        {
            min: 0, max: 40, warna: 'merah', label: 'Unreflective Thinker',
            deskripsi: 'Rentan tinggi terhadap hoaks dan bias emosional. Wajib mengikuti modul secara penuh.'
        },
        {
            min: 41, max: 70, warna: 'kuning', label: 'Challenged / Beginning Thinker',
            deskripsi: 'Mulai sadar namun masih mudah terkecoh sesat pikir (logical fallacy).'
        },
        {
            min: 71, max: 100, warna: 'hijau', label: 'Practicing hingga Master Thinker',
            deskripsi: 'Memiliki nalar kritis matang dan siap menjadi agen perubahan digital.'
        }
    ];
    const tampilkanRangeSkor = quizConfig.showRangeInfo !== false;
    const rangeSkorHtml = tampilkanRangeSkor ? `
        <div class="quiz-range-card collapsed" id="quiz-range-card">
            <button type="button" class="quiz-range-info-title" onclick="toggleQuizRangeCard()">
                <span class="quiz-range-info-title-text"><i class="fa-solid fa-ruler-horizontal"></i> Rubrik Klasifikasi Penilaian</span>
                <i class="fa-solid fa-chevron-down quiz-range-toggle-icon"></i>
            </button>
            <div class="quiz-range-list">
                ${daftarRangeSkor.map(range => `
                    <div class="quiz-range-item ${range.warna}${range.warna === klasifikasiWarna ? ' active' : ''}">
                        <div class="quiz-range-item-top">
                            <span class="quiz-range-badge">${range.min}-${range.max}</span>
                            <span class="quiz-range-label">${quizItalicizeInggris(range.label)}</span>
                            ${range.warna === klasifikasiWarna ? '<span class="quiz-range-tag"><i class="fa-solid fa-check"></i> Skormu</span>' : ''}
                        </div>
                        <p class="quiz-range-desc">${quizItalicizeInggris(range.deskripsi)}</p>
                    </div>
                `).join('')}
            </div>
        </div>` : '';

    const tampilkanPembahasan = quizConfig.showPembahasan !== false;
    const pembahasanHtml = (tampilkanPembahasan && pembahasan && pembahasan.length > 0)
        ? `
        <div class="quiz-review-heading">Pembahasan Jawaban</div>
        <div class="quiz-review-list">${buildPembahasanCardsHtml(pembahasan)}</div>`
        : '';

    container.innerHTML = `
        <div class="quiz-result-card">
            ${quizDecorHtml(klasifikasiWarna || 'abu', klasifikasiIcon[klasifikasiWarna] || 'fa-brain')}
            <div class="quiz-result-icon"><i class="fa-solid fa-check"></i></div>
            <h3>${quizConfig.doneTitle}</h3>
            <div class="quiz-result-score ${klasifikasiWarna}">${skor}</div>
            <p class="desc">${quizItalicizeInggris(customMessage || quizConfig.doneDesc)}</p>
            ${klasifikasiHtml}
            <div class="quiz-result-btn-row">
                <button class="quiz-result-back-btn" onclick="mulaiBelajarBabPertama(this)">
                    <i class="fa-solid fa-book-open"></i> Ayo Mulai Belajar!
                </button>
                <button class="quiz-result-secondary-btn" onclick="cnGoTo('${quizConfig.backUrl}')">Kembali ke Dashboard</button>
            </div>
        </div>
        ${rangeSkorHtml}
        ${pembahasanHtml}`;
    bungkusTabelScrollQuiz(container);
    initGambarLightboxQuiz(container);
    revealQuizFooter();
    hideQuizNavigator();
    hideQuizTimer();

    // Scroll ke paling atas halaman -- SAMA PERSIS alasan & pola dengan
    // tampilkanHasilTryout()/tampilkanHasilKuisBab() (lihat catatan
    // panjang di tampilkanHasilTryout): tanpa ini, posisi scroll ikut
    // posisi terakhir sebelum submit. Berlaku juga untuk Tes Diagnostik
    // walau alurnya lewat window.location.reload() (lihat
    // kirimJawabanKeServer) -- reload TIDAK otomatis mengembalikan
    // scroll ke 0 (browser modern coba memulihkan posisi scroll lama di
    // URL yang sama lewat history.scrollRestoration), jadi tetap perlu
    // di-reset manual di sini. "instant" (bukan "auto") supaya benar-benar
    // langsung lompat, bukan ikut dianimasikan halus oleh
    // "html { scroll-behavior: smooth; }" global (css/style.css).
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

function renderQuizLocked(message) {
    const container = document.getElementById('quiz-content');
    container.innerHTML = `
        <div class="quiz-result-card">
            ${quizDecorHtml('abu', 'fa-lock')}
            <div class="quiz-result-icon locked"><i class="fa-solid fa-lock"></i></div>
            <h3>${quizConfig.lockedTitle || 'Belum Bisa Diakses'}</h3>
            <p class="desc">${escapeHtmlQuiz(message)}</p>
            <button class="quiz-result-back-btn" onclick="cnGoTo('${quizConfig.backUrl}')">
                ${quizTombolKembaliLabel()}
            </button>
        </div>`;
    revealQuizFooter();
    hideQuizNavigator();
}

/**
 * Label tombol "kembali" di layar hasil/terkunci (dipakai bareng oleh
 * diagnostik.html, tryout.html, & kuis.html lewat js/quiz.js) -- HARUS
 * menyesuaikan tujuan sebenarnya dari quizConfig.backUrl, bukan selalu
 * "Kembali ke Dashboard": Kuis per Bab (kuis.html, ditandai adanya
 * quizConfig.babId) baliknya ke materi.html?bab_id=... punya bab itu,
 * BUKAN dashboard.html (lihat backUrl di kuis.html) -- Diagnostik &
 * Final Tryout baliknya memang ke dashboard.html jadi labelnya tetap
 * "Kembali ke Dashboard".
 */
function quizTombolKembaliLabel() {
    return quizConfig.babId ? 'Kembali ke Materi' : 'Kembali ke Dashboard';
}

// =================================================================
// HELPER
// =================================================================
/**
 * Bungkus tiap <table> hasil sanitizeRichHtmlQuiz (di pertanyaan, pilihan
 * jawaban, atau pembahasan) dengan div scroll horizontal SENDIRI -- taruh
 * "overflow-x: auto" langsung di elemen <table> (seperti sebelumnya di
 * css/quiz.css) bikin browser mengabaikan lebar kolom <col> dari
 * initTableColumnResize()/sisipTabelMateri() di admin.js (tabelnya jadi
 * menyusut ikut isi, bukan memenuhi lebar kartu soal). Dibungkus div
 * terpisah begini, <table> aslinya tetap bisa width:100% penuh mengikuti
 * lebar kartu, sementara div pembungkusnya yang menangani scroll di layar
 * sempit. Dipanggil manual sesudah tiap `container.innerHTML = ...` yang
 * mungkin memuat tabel (lihat renderQuizQuestions/tampilkanHasilKuisBab/
 * renderQuizDone) -- bukan lewat MutationObserver supaya tidak perlu
 * mengamati seluruh halaman terus-menerus.
 */
// Lebar konten masing-masing tempat teks soal ditampilkan, DI LAYAR
// DESKTOP (lihat css/quiz.css) -- ini yang jadi acuan persentase kolom
// tabel (<col style="width:N%">), jadi juga dipakai sebagai min-width
// tabel supaya di layar sempit (HP) tabelnya TIDAK ikut mengecil dari
// ukuran itu (kalau tidak muat, digeser/scroll, bukan diperas). Beda
// konteks beda lebar -- pertanyaan/penjelasan jauh lebih lega (di dalam
// ".quiz-question-card" yang lebar) dibanding teks pilihan jawaban (cuma
// sebaris sempit di sebelah bulatan radio), jadi tidak bisa dipukul rata.
const QUIZ_TABEL_LEBAR_DESKTOP = {
    'quiz-question-text': 908,
    'quiz-review-question': 908,
    'quiz-review-explanation-text': 908,
    'quiz-option-text': 96,
};

function bungkusTabelScrollQuiz(container) {
    if (!container) return;
    container.querySelectorAll('table').forEach(table => {
        // Cari kelas kontainer teks terdekat supaya tahu lebar desktop mana
        // yang jadi acuan (lihat QUIZ_TABEL_LEBAR_DESKTOP di atas).
        let acuanPx = null;
        let p = table.parentElement;
        while (p && p !== container) {
            const match = Object.keys(QUIZ_TABEL_LEBAR_DESKTOP).find(cls => p.classList.contains(cls));
            if (match) { acuanPx = QUIZ_TABEL_LEBAR_DESKTOP[match]; break; }
            p = p.parentElement;
        }
        if (acuanPx) table.style.minWidth = acuanPx + 'px';
        if (table.parentElement && table.parentElement.classList.contains('quiz-table-scroll')) return;
        const wrap = document.createElement('div');
        wrap.className = 'quiz-table-scroll';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    });
}

function escapeHtmlQuiz(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

/**
 * Bungkus HANYA kata/frasa Bahasa Inggris yang benar-benar ada di layar
 * hasil Tes Diagnostik & Final Tryout (label/deskripsi rubrik
 * klasifikasi, intro rubrik, & teks "Baseline" di Tes Diagnostik) dengan
 * <em> -- SAMA PERSIS pola & sebagian isi frasa dengan
 * ubItalicizeInggris() (js/umpan_balik.js), ubAdminItalicize()
 * (js/admin.js), & cn_sertifikat_italicize() (api/get_sertifikat.php),
 * supaya kata Bahasa Indonesia yang kebetulan nyempil di tengah label
 * campuran (mis. "hingga" di "Practicing hingga Master Thinker") TIDAK
 * ikut miring. Daftar SENGAJA berupa frasa tetap (bukan deteksi bahasa
 * otomatis) karena teks sumbernya konstan -- urutan panjang-ke-pendek
 * supaya frasa yang lebih panjang selalu kena duluan, sebelum frasa
 * pendek yang jadi bagian darinya sempat ke-replace lebih dulu.
 */
const QUIZ_FRASA_INGGRIS = [
    'Paul & Elder Critical Thinking Stages',
    'Challenged / Beginning Thinker',
    'Unreflective Thinker',
    'Master Thinker',
    'logical fallacy',
    'Practicing',
    'Baseline'
];
function quizItalicizeInggris(text) {
    let hasil = escapeHtmlQuiz(text);
    QUIZ_FRASA_INGGRIS.forEach(frasa => {
        const frasaEscaped = escapeHtmlQuiz(frasa);
        hasil = hasil.split(frasaEscaped).join('<em>' + frasaEscaped + '</em>');
    });
    return hasil;
}

/**
 * Markup ikon dekorasi transparan di kartu hasil (.quiz-result-card) --
 * dipakai bareng oleh tampilkanHasilKuisBab/tampilkanHasilTryout/
 * renderQuizDone/renderQuizLocked, supaya keempatnya konsisten. SEKARANG
 * 3 ikon (bukan cuma 1) yang sama, ditebar di 3 posisi & ukuran berbeda
 * (lihat posisi/ukuran/opacity masing-masing lewat urutan "i:nth-of-type"
 * di css/quiz.css) -- biar background kartunya lebih "ramai", bukan cuma
 * 1 ikon besar sendirian di pojok seperti sebelumnya. Ikon utama (yang
 * paling besar, pojok kanan bawah) juga diperbesar dari versi sebelumnya.
 */
function quizDecorHtml(warna, iconClass) {
    return `<div class="quiz-result-decor ${warna}" aria-hidden="true"><i class="fa-solid ${iconClass}"></i><i class="fa-solid ${iconClass}"></i><i class="fa-solid ${iconClass}"></i></div>`;
}

/**
 * Pasang klik-untuk-perbesar (lightbox) di tiap <img> hasil render teks
 * soal/pilihan/penjelasan kuis -- sama seperti initGambarLightboxMateri()
 * di js/materi.js, gambar-gambar ini sengaja ditampilkan mengecil
 * menyesuaikan lebar kotaknya masing-masing (lihat css/quiz.css), jadi
 * peserta perlu cara untuk melihat versi lebih besar/jelasnya kalau perlu.
 */
function initGambarLightboxQuiz(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(img => {
        if (img.dataset.lightboxReady) return;
        img.dataset.lightboxReady = '1';
        img.addEventListener('click', (e) => {
            // Gambar di teks pilihan jawaban (.quiz-option-text) ada di
            // DALAM elemen ".quiz-option" yang punya onclick="pilihJawaban(...)"
            // sendiri -- kalau tidak dihentikan di sini, klik buat
            // memperbesar gambar bakal ikut kepilih jadi jawaban.
            e.stopPropagation();
            bukaLightboxGambarQuiz(img.src, img.alt);
        });
    });
}

function bukaLightboxGambarQuiz(src, alt) {
    if (!src) return;
    Swal.fire({
        html: `<img src="${escapeHtmlQuiz(src)}" alt="${escapeHtmlQuiz(alt || '')}" class="quiz-lightbox-img">`,
        showConfirmButton: false,
        showCloseButton: true,
        background: 'rgba(15, 23, 32, 0.95)',
        backdrop: 'rgba(10, 14, 20, 0.9)',
        width: 'auto',
        padding: '1.4em 1em',
        customClass: { popup: 'quiz-lightbox-popup' },
    });
}

// Pertanyaan, pilihan jawaban & penjelasan diinput admin lewat editor rich
// text (bold/italic/underline/daftar/heading/link/gambar/tabel) di Panel
// Admin, jadi dirender di sini sebagai HTML (bukan di-escape jadi teks
// polos). Tetap disaring dulu (cuma izinkan tag yang benar-benar dipakai
// editor itu) sebagai lapisan aman kedua, jaga-jaga kalau data di database
// pernah diubah lewat jalur lain di luar editor. Daftar tag & aturan
// atributnya HARUS disamakan persis dengan sanitizeRichHtmlAdmin
// (js/admin.js) dan sanitizeRichHtmlMateri (js/materi.js).
function sanitizeRichHtmlQuiz(html) {
    if (!html) return '';
    const allowedTags = new Set([
        'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'SPAN',
        'H2', 'H3', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'COLGROUP', 'COL',
        'STRIKE', 'S', 'SUP', 'SUB'
    ]);
    // Satu-satunya nilai "style" yang boleh lolos di seluruh sanitizer ini:
    // lebar kolom/gambar dalam persen (diisi lewat resize gambar & kolom
    // tabel di Panel Admin, lihat sisipGambarMateri/initTableColumnResize
    // di admin.js) -- format lain (termasuk satuan px, atau properti CSS
    // apapun selain width) dibuang.
    // Dibaca langsung dari child.style.width (properti yang SUDAH di-parse
    // browser dari atribut "style"-nya), BUKAN dari string atribut "style"
    // mentah -- supaya properti CSS lain yang ikut ada di situ (mis.
    // "height: auto" dari resize gambar, atau sisa "cursor: ..." dari hover
    // affordance) otomatis diabaikan, tidak bikin seluruh style ketolak
    // cuma gara-gara ada properti lain yang menyertainya.
    function extractWidthPercentStyle(el) {
        const w = (el && el.style && el.style.width) || '';
        const m = w.match(/^(\d{1,3}(?:\.\d{1,2})?)%$/);
        if (!m) return null;
        const pct = parseFloat(m[1]);
        return (pct >= 1 && pct <= 100) ? ('width:' + pct + '%') : null;
    }
    // Perataan teks & ukuran teks (kontrol "extended-only" khusus kotak
    // teks materi di Panel Admin, lihat ensureRichToolbar di admin.js) --
    // dipertahankan juga di sini (bukan cuma admin.js/materi.js) supaya
    // ketiga sanitizer tetap sinkron, walau soal/pilihan/penjelasan kuis
    // sendiri tidak menampilkan tombol-tombolnya.
    function extractTextAlignStyle(el) {
        const a = (el && el.style && el.style.textAlign) || '';
        return (a === 'left' || a === 'center' || a === 'right' || a === 'justify') ? ('text-align:' + a) : null;
    }
    function extractFontSizeStyle(el) {
        const s = (el && el.style && el.style.fontSize) || '';
        const m = s.match(/^(\d{1,3})px$/);
        if (!m) return null;
        const px = parseInt(m[1], 10);
        return (px >= 8 && px <= 96) ? ('font-size:' + px + 'px') : null;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    (function clean(node) {
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === 1) {
                if (!allowedTags.has(child.tagName)) {
                    node.replaceChild(document.createTextNode(child.textContent), child);
                    return;
                }
                // Kebanyakan tag TIDAK boleh punya atribut apapun -- IMG
                // ("src", + "style" lebar % dari resize gambar), A
                // ("href"), COL ("style" lebar % dari resize kolom tabel),
                // SPAN ("style" ukuran teks), dan elemen blok P/DIV/H2/H3
                // ("style" perataan teks) dikecualikan, disaring khusus
                // supaya tidak bisa disusupi skema berbahaya seperti
                // "javascript:" atau CSS liar.
                if (child.tagName === 'IMG') {
                    const src = child.getAttribute('src') || '';
                    const widthStyle = extractWidthPercentStyle(child);
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (src && !/^\s*javascript:/i.test(src)) {
                        child.setAttribute('src', src);
                        if (widthStyle) child.setAttribute('style', widthStyle);
                    } else {
                        node.removeChild(child);
                        return;
                    }
                } else if (child.tagName === 'A') {
                    const href = child.getAttribute('href') || '';
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (href && !/^\s*javascript:/i.test(href)) {
                        child.setAttribute('href', href);
                        child.setAttribute('target', '_blank');
                        child.setAttribute('rel', 'noopener noreferrer');
                    }
                } else if (child.tagName === 'COL') {
                    const widthStyle = extractWidthPercentStyle(child);
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (widthStyle) child.setAttribute('style', widthStyle);
                } else if (child.tagName === 'SPAN') {
                    const fontSizeStyle = extractFontSizeStyle(child);
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (fontSizeStyle) child.setAttribute('style', fontSizeStyle);
                } else if (child.tagName === 'P' || child.tagName === 'DIV' || child.tagName === 'H2' || child.tagName === 'H3') {
                    const alignStyle = extractTextAlignStyle(child);
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (alignStyle) child.setAttribute('style', alignStyle);
                } else {
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                }
                clean(child);
            }
        });
    })(tmp);
    return tmp.innerHTML;
}