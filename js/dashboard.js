// =================================================================
// DASHBOARD PESERTA - Cakar Nalar
// =================================================================
const API_BASE = 'api/';
let currentUser = null;

// =================================================================
// AUTH GUARD: harus login sebagai peserta, kalau admin -> ke admin.html
// =================================================================
(function checkAuth() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        currentUser = JSON.parse(saved);
        if (!currentUser || !currentUser.id) {
            throw new Error('invalid');
        }
        if (currentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('topbar-username').textContent = currentUser.name;
    document.getElementById('topbar-username-mobile').textContent = currentUser.name;
    document.getElementById('welcome-name').textContent = 'Halo, ' + currentUser.name.split(' ')[0] + '!';

    loadDashboard();
})();

async function logout() {
    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Keluar dari akun?',
        text: 'Kamu perlu login lagi untuk melanjutkan proses belajarmu.',
        showCancelButton: true,
        confirmButtonText: 'Ya, keluar',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#d64550'
    });
    if (!konfirmasi.isConfirmed) return;

    localStorage.removeItem('cn_user');
    cnGoTo('index.html');
}

// =================================================================
// EDIT PROFIL (nama, email, kata sandi)
// =================================================================
async function bukaEditProfil() {
    const { value: formValues } = await Swal.fire({
        title: 'Edit Profil',
        html: `
            <div class="cn-editprofil-form">
                <label class="cn-editprofil-label" for="swal-ep-name">Nama Lengkap</label>
                <input id="swal-ep-name" class="swal2-input" value="${escapeHtml(currentUser.name)}" readonly>

                <label class="cn-editprofil-label" for="swal-ep-email">Email</label>
                <input id="swal-ep-email" type="email" class="swal2-input" value="${escapeHtml(currentUser.email || '')}" readonly>
                <p class="cn-editprofil-hint">Nama dan email tidak bisa diubah sendiri. Hubungi admin kalau perlu diganti.</p>

                <hr class="cn-editprofil-divider">

                <label class="cn-editprofil-label" for="swal-ep-password">Kata Sandi Baru</label>
                <div class="cn-input-wrap">
                    <input id="swal-ep-password" type="password" class="swal2-input has-eye-icon" maxlength="30" placeholder="Kosongkan jika tidak diganti">
                    <i class="fa-regular fa-eye cn-toggle-eye" data-target="swal-ep-password"></i>
                </div>
                <p class="cn-editprofil-hint" id="swal-ep-password-hint">Minimal 8 karakter, kombinasi huruf & angka.</p>

                <label class="cn-editprofil-label" for="swal-ep-password-confirm">Konfirmasi Kata Sandi Baru</label>
                <div class="cn-input-wrap">
                    <input id="swal-ep-password-confirm" type="password" class="swal2-input has-check-icon" maxlength="30" placeholder="Ulangi kata sandi baru">
                    <i class="fa-solid fa-circle-check cn-input-check-icon" id="swal-ep-password-confirm-check"></i>
                </div>
                <p class="cn-editprofil-hint" id="swal-ep-password-confirm-hint"></p>

                <label class="cn-editprofil-label" for="swal-ep-current-password">Kata Sandi Saat Ini</label>
                <div class="cn-input-wrap">
                    <input id="swal-ep-current-password" type="password" class="swal2-input has-eye-icon" placeholder="Wajib diisi kalau mengganti kata sandi">
                    <i class="fa-regular fa-eye cn-toggle-eye" data-target="swal-ep-current-password"></i>
                </div>
                <p class="cn-editprofil-hint" id="swal-ep-current-password-hint"></p>
            </div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Simpan Perubahan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0C7A6E',
        reverseButtons: true,
        scrollbarPadding: false,
        customClass: { popup: 'cn-editprofil-popup' },
        didOpen: () => {
            const passwordEl = document.getElementById('swal-ep-password');
            const passwordHintEl = document.getElementById('swal-ep-password-hint');
            const confirmEl = document.getElementById('swal-ep-password-confirm');
            const confirmHintEl = document.getElementById('swal-ep-password-confirm-hint');
            const confirmCheckEl = document.getElementById('swal-ep-password-confirm-check');
            const currentPasswordEl = document.getElementById('swal-ep-current-password');
            const currentPasswordHintEl = document.getElementById('swal-ep-current-password-hint');

            const TEKS_DEFAULT_PASSWORD = 'Minimal 8 karakter, kombinasi huruf & angka.';

            function cekPassword() {
                const val = passwordEl.value;
                if (!val) {
                    cnSetValidasiInput(passwordEl, null);
                    cnSetValidasiHint(passwordHintEl, TEKS_DEFAULT_PASSWORD, null);
                    return;
                }
                const pesanKesalahan = cnValidasiKekuatanPassword(val);
                cnSetValidasiInput(passwordEl, !pesanKesalahan);
                cnSetValidasiHint(passwordHintEl, pesanKesalahan || 'Kata sandi memenuhi syarat', !pesanKesalahan);
            }

            // Begitu isinya SUDAH cocok, langsung tampilkan ceklis saat itu
            // juga (real-time, tidak perlu menunggu klik Simpan Perubahan).
            // Tapi selama BELUM cocok: sebelum pernah klik Simpan Perubahan
            // cukup ditandai merah saja tanpa keterangan; begitu peserta
            // pernah klik Simpan Perubahan (ditandai lewat
            // confirmEl.dataset.dicoba, diset di preConfirm di bawah),
            // ketikan berikutnya yang masih tidak cocok langsung
            // menampilkan keterangannya juga.
            function cekConfirm() {
                const val = confirmEl.value;
                const sudahDicoba = confirmEl.dataset.dicoba === '1';
                if (!val) {
                    cnSetValidasiInput(confirmEl, null);
                    cnSetValidasiHint(confirmHintEl, '', null);
                    cnToggleCheckIcon(confirmCheckEl, false);
                    return;
                }
                const cocok = val === passwordEl.value;
                if (cocok) {
                    cnSetValidasiInput(confirmEl, true);
                    cnSetValidasiHint(confirmHintEl, '', true);
                    cnToggleCheckIcon(confirmCheckEl, true);
                } else if (sudahDicoba) {
                    cnSetValidasiInput(confirmEl, false);
                    cnSetValidasiHint(confirmHintEl, 'Konfirmasi belum sama dengan kata sandi di atas', false);
                    cnToggleCheckIcon(confirmCheckEl, false);
                } else {
                    cnSetValidasiInput(confirmEl, false);
                    cnSetValidasiHint(confirmHintEl, '', null);
                    cnToggleCheckIcon(confirmCheckEl, false);
                }
            }

            // Begitu peserta mulai mengetik ulang kata sandi saat ini,
            // hapus dulu tanda merah "Kata sandi saat ini salah" dari
            // percobaan sebelumnya.
            function cekCurrentPassword() {
                cnSetValidasiInput(currentPasswordEl, null);
                cnSetValidasiHint(currentPasswordHintEl, '', null);
            }

            passwordEl.addEventListener('input', function () { cekPassword(); cekConfirm(); });
            confirmEl.addEventListener('input', cekConfirm);
            currentPasswordEl.addEventListener('input', cekCurrentPassword);
        },
        preConfirm: async () => {
            const password = document.getElementById('swal-ep-password').value;
            const passwordConfirm = document.getElementById('swal-ep-password-confirm').value;
            const currentPasswordEl = document.getElementById('swal-ep-current-password');
            const currentPasswordHintEl = document.getElementById('swal-ep-current-password-hint');
            const currentPassword = currentPasswordEl.value;

            if (!password) {
                Swal.showValidationMessage('Isi kata sandi baru untuk menyimpan perubahan');
                return false;
            }
            const pesanKesalahanPassword = cnValidasiKekuatanPassword(password);
            if (pesanKesalahanPassword) {
                Swal.showValidationMessage(pesanKesalahanPassword);
                return false;
            }
            // Sejak percobaan simpan ini, konfirmasi kata sandi "sudah
            // dicoba" -- lihat cekConfirm() di didOpen di atas.
            document.getElementById('swal-ep-password-confirm').dataset.dicoba = '1';

            if (password !== passwordConfirm) {
                const confirmEl = document.getElementById('swal-ep-password-confirm');
                const confirmHintEl = document.getElementById('swal-ep-password-confirm-hint');
                const confirmCheckEl = document.getElementById('swal-ep-password-confirm-check');
                cnSetValidasiInput(confirmEl, false);
                cnSetValidasiHint(confirmHintEl, 'Konfirmasi belum sama dengan kata sandi di atas', false);
                cnToggleCheckIcon(confirmCheckEl, false);
                return false;
            }
            cnSetValidasiInput(document.getElementById('swal-ep-password-confirm'), true);
            cnToggleCheckIcon(document.getElementById('swal-ep-password-confirm-check'), true);
            if (!currentPassword) {
                cnSetValidasiInput(currentPasswordEl, false);
                cnSetValidasiHint(currentPasswordHintEl, 'Masukkan kata sandi saat ini untuk mengganti kata sandi', false);
                return false;
            }

            // Kirim ke server di sini (bukan sesudah dialog ini ditutup) --
            // supaya kalau kata sandi saat ini ternyata salah, pesan
            // errornya bisa langsung ditampilkan di jendela yang sama tanpa
            // menutup jendelanya dulu.
            try {
                const res = await fetch(API_BASE + 'update_profile.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUser.id,
                        name: currentUser.name,
                        email: currentUser.email,
                        password: password,
                        current_password: currentPassword
                    })
                });
                const result = await res.json();
                if (result.status !== 'success') {
                    const pesan = result.message || 'Gagal menyimpan perubahan.';
                    if (/kata sandi saat ini salah/i.test(pesan)) {
                        cnSetValidasiInput(currentPasswordEl, false);
                        cnSetValidasiHint(currentPasswordHintEl, pesan, false);
                    } else {
                        Swal.showValidationMessage(pesan);
                    }
                    return false;
                }
                return true;
            } catch (err) {
                Swal.showValidationMessage('Tidak bisa terhubung. Periksa koneksi internet dan coba lagi.');
                return false;
            }
        }
    });

    if (!formValues) return;

    Swal.fire({ icon: 'success', title: 'Kata sandi diperbarui', timer: 1500, showConfirmButton: false });
}

// =================================================================
// MENU HAMBURGER (topbar layar < 992px)
// =================================================================
function positionDashMenu() {
    const menu = document.getElementById('dashMenu');
    const navbar = document.querySelector('.navbar-cakar');
    if (!menu || !navbar) return;
    menu.style.top = (navbar.offsetHeight + 10) + 'px';
}

function toggleDashMenu() {
    const menu = document.getElementById('dashMenu');
    const btn = document.getElementById('dashMenuBtn');
    const backdrop = document.getElementById('dashMenuBackdrop');
    positionDashMenu();
    const isOpen = menu.classList.toggle('open');
    backdrop.classList.toggle('open', isOpen);
    document.body.classList.toggle('mobile-menu-locked', isOpen);
    btn.classList.toggle('is-open', isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
}

function closeDashMenu() {
    const menu = document.getElementById('dashMenu');
    const btn = document.getElementById('dashMenuBtn');
    const backdrop = document.getElementById('dashMenuBackdrop');
    menu.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('mobile-menu-locked');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
}

// =================================================================
// AMBIL DATA DASHBOARD
// =================================================================
async function loadDashboard() {
    try {
        const res = await fetch(API_BASE + 'get_bab.php?user_id=' + currentUser.id);
        const result = await res.json();

        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal memuat data', text: result.message || 'Terjadi kesalahan.' });
            return;
        }

        renderDiagnostik(result.data.diagnostik);
        renderBabList(result.data.bab);
        renderTryout(result.data.tryout);
        renderProgress(result.data);
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// =================================================================
// KARTU TES DIAGNOSTIK
// =================================================================
function renderDiagnostik(diagnostik) {
    const el = document.getElementById('diagnostik-card');
    if (diagnostik.selesai) {
        el.innerHTML = `
            <div class="stage-card status-done">
                <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-flask"></i></div>
                <div class="stage-icon"><i class="fa-solid fa-check"></i></div>
                <div class="stage-body">
                    <h6>Tes Diagnostik Selesai</h6>
                    <p>Baseline kemampuan awalmu sudah tercatat. Selamat belajar!</p>
                </div>
                <button class="btn-bab-action" onclick="cnGoTo('diagnostik.html')">
                    Lihat Hasil
                </button>
            </div>`;
    } else {
        const adaProgres = cekProgresDiagnostikBelumSelesai(diagnostik);
        el.innerHTML = `
            <div class="stage-card status-open">
                <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-flask"></i></div>
                <div class="stage-icon"><i class="fa-solid fa-flask"></i></div>
                <div class="stage-body">
                    <h6>Belum Dikerjakan</h6>
                    <p>Ukur dulu kemampuan awalmu sebelum mulai belajar. Bab 1 terbuka setelah ini selesai.</p>
                </div>
                <button class="btn-bab-action" onclick="konfirmasiMulaiDiagnostik(${adaProgres})">
                    ${adaProgres ? 'Lanjutkan Tes' : 'Mulai Tes Diagnostik'}
                </button>
            </div>`;
    }
}

/**
 * Cek apakah peserta sudah mulai mengerjakan Tes Diagnostik, supaya
 * tombol di dashboard berubah jadi "Lanjutkan Tes".
 *
 * Sumber UTAMA: diagnostik.sedang_dikerjakan dari server (baris
 * diagnostik_waktu, lihat api/get_bab.php & api/get_diagnostik.php) --
 * PERMANEN, jadi tetap akurat walau localStorage peserta hilang/beda
 * browser, DAN otomatis balik ke false begitu admin me-reset Tes
 * Diagnostik peserta ini (baris diagnostik_waktu ikut terhapus lewat
 * cn_hapus_diagnostik() di api/admin/reset_peserta_progres.php).
 *
 * Kalau server bilang TIDAK/BELUM sedang dikerjakan, itu artinya
 * attempt sebelumnya (kalau ada) sudah tidak berlaku lagi (baru
 * direset admin, atau memang belum pernah mulai) -- localStorage lama
 * dari attempt itu dibersihkan di sini juga, supaya tidak nyangkut
 * ketika peserta mulai attempt yang baru.
 */
function cekProgresDiagnostikBelumSelesai(diagnostik) {
    if (diagnostik && diagnostik.sedang_dikerjakan) return true;
    try {
        localStorage.removeItem('cn_attempt_diagnostik_' + currentUser.id);
        localStorage.removeItem('cn_progress_diagnostik_' + currentUser.id);
    } catch (e) {
        // localStorage diblokir -- abaikan, tidak fatal
    }
    return false;
}

/**
 * Tombol "Mulai Tes Diagnostik" -- konfirmasi dulu lewat SweetAlert
 * sebelum benar-benar pindah ke diagnostik.html, SAMA POLA dengan dialog
 * "Mulai Kuis Sekarang?" (konfirmasiMulaiKuisBab() di js/materi.js) dan
 * "Mulai Final Tryout Sekarang?" (konfirmasiLanjutTryout() di
 * js/quiz.js). Kalau tesnya sudah pernah dimulai sebelumnya (tombol
 * sedang menampilkan "Lanjutkan Tes", ditentukan dari server, lihat
 * cekProgresDiagnostikBelumSelesai()), langsung pindah tanpa konfirmasi
 * lagi -- dialog ini cuma buat percobaan pertama (atau percobaan baru
 * setelah admin reset).
 */
async function konfirmasiMulaiDiagnostik(adaProgres) {
    if (adaProgres) {
        cnGoTo('diagnostik.html');
        return;
    }
    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Mulai Tes Diagnostik Sekarang?',
        // "html" (bukan "text") supaya <em>baseline</em> dirender italic --
        // SweetAlert2 merender opsi "text" sebagai teks polos apa adanya
        // (tag HTML tidak diproses), jadi kalau tetap pakai "text" tulisan
        // "<em>" akan muncul mentah, bukan jadi miring.
        html: 'Tes ini cuma bisa dikerjakan sekali dan tidak bisa diulang, jadi jawab sesuai kemampuanmu saat ini. Hasilnya jadi <em>baseline</em> sebelum kamu mulai belajar Bab 1.',
        showCancelButton: true,
        confirmButtonText: 'Ya, kerjakan',
        cancelButtonText: 'Nanti Saja',
        confirmButtonColor: '#0C7A6E'
    });
    if (!konfirmasi.isConfirmed) return;
    cnGoTo('diagnostik.html');
}

// =================================================================
// DAFTAR BAB
// =================================================================
function renderBabList(babList) {
    const el = document.getElementById('bab-list');
    el.innerHTML = babList.map(bab => {
        let statusClass = 'status-locked';
        let badge = '<span class="status-badge locked"><i class="fa-solid fa-lock"></i> Terkunci</span>';
        let footer = `<button class="btn-bab-action" disabled>Terkunci</button>`;

        if (bab.lulus) {
            statusClass = 'status-lulus';
            badge = '<span class="status-badge lulus"><i class="fa-solid fa-check"></i> Lulus</span>';
            footer = `
                <span class="bab-skor">Skor: ${bab.skor_terakhir ?? '-'}</span>
                <button class="btn-bab-action" onclick="bukaMateri(${bab.id})">Lihat Materi</button>`;
        } else if (!bab.locked) {
            statusClass = 'status-open';
            badge = '<span class="status-badge open"><i class="fa-solid fa-unlock"></i> Terbuka</span>';
            footer = `<button class="btn-bab-action" onclick="bukaMateri(${bab.id})">
                ${bab.materi_dibaca ? 'Lanjutkan' : 'Mulai Belajar'}
            </button>`;
        }

        return `
            <div class="col-md-6 col-lg-4 bab-list-col">
                <div class="bab-card ${statusClass}">
                    <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-book-open"></i></div>
                    <div class="bab-card-top">
                        <div class="bab-number-badge">${bab.nomor}</div>
                        ${badge}
                    </div>
                    <h6>${sanitizeRichHtmlDashboard(bab.judul)}</h6>
                    <p class="bab-ringkasan">${sanitizeRichHtmlDashboard(bab.ringkasan)}</p>
                    <div class="bab-card-footer">${footer}</div>
                </div>
            </div>`;
    }).join('');
}

function bukaMateri(babId) {
    cnGoTo('materi.html?bab_id=' + babId);
}

// =================================================================
// KARTU FINAL TRYOUT
// =================================================================
function renderTryout(tryout) {
    const el = document.getElementById('tryout-card');

    if (tryout.selesai) {
        // Tombol "Lihat Hasil" -- SAMA POLA dengan kartu Tes Diagnostik yang
        // sudah selesai (lihat renderDiagnostik) -- angka skor TIDAK lagi
        // ditampilkan langsung di kartu dashboard, peserta klik tombolnya
        // untuk lihat hasil lengkapnya (skor, klasifikasi, riwayat) di
        // tryout.html sendiri.
        el.innerHTML = `
            <div class="stage-card status-done">
                <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
                <div class="stage-icon"><i class="fa-solid fa-trophy"></i></div>
                <div class="stage-body">
                    <h6>Program Selesai!</h6>
                    <p>Kamu sudah menyelesaikan Final Tryout dan seluruh rangkaian Cakar Nalar. Selamat!</p>
                </div>
                <button class="btn-bab-action" onclick="cnGoTo('tryout.html')">
                    Lihat Hasil
                </button>
            </div>`;
    } else if (tryout.terbuka) {
        // Final Tryout BOLEH diulang selama skornya belum mencapai batas
        // minimal (lihat js/quiz.js) -- "belum selesai" DI SINI bisa
        // berarti belum pernah dikerjakan sama sekali, ATAU sudah pernah
        // tapi belum mencapai skor final (jumlah_percobaan > 0). Kalau
        // yang kedua, tampilkan info batas minimalnya (BUKAN angka skor
        // peserta sendiri -- sengaja tidak disebut di kartu ini) supaya
        // peserta tahu kenapa kartunya masih tampil "harus dikerjakan".
        // Angka batas minimalnya diambil dari tryout.passing_score (bukan
        // hardcode) supaya tetap ikut TRYOUT_PASSING_SCORE di
        // api/config.php kalau suatu saat diubah.
        const infoSkorTerakhir = (tryout.jumlah_percobaan > 0 && tryout.skor !== null)
            ? ` Skor percobaan terakhirmu belum mencapai batas minimal ${tryout.passing_score} poin.`
            : '';
        // adaProgres: peserta sempat mengisi sebagian jawaban Final Tryout
        // (percobaan yang SEDANG berjalan) tapi belum submit -- progres
        // disimpan js/quiz.js di localStorage, sama pola dengan Tes
        // Diagnostik (cekProgresDiagnostikBelumSelesai di atas).
        const adaProgres = cekProgresTryoutBelumSelesai();
        // pernahMasuk: peserta sudah PERNAH benar-benar mengerjakan (submit)
        // Final Tryout minimal 1x, ATAU sedang di tengah percobaan yang
        // aktif -- dialog konfirmasi "Mulai Final Tryout Sekarang?" cuma
        // perlu muncul untuk yang benar-benar pertama kali (lihat
        // klikMulaiTryout). SENGAJA dihitung dari tryout.jumlah_percobaan
        // (data server, ikut objek "tryout" yang sama dipakai kartu ini),
        // BUKAN dari penanda localStorage seperti sebelumnya -- penanda
        // localStorage lama ('cn_pernah_masuk_tryout_') diisi begitu
        // tryout.html PERNAH dibuka sekali saja (walau belum dikerjakan)
        // dan tidak pernah terhapus otomatis, termasuk kalau admin
        // me-reset progres tryout peserta ini dari Panel Admin -- efeknya
        // dialognya jadi tidak muncul lagi untuk peserta yang kebetulan
        // pernah membuka halaman ini sebelum di-reset, PADAHAL setelah
        // reset percobaan berikutnya seharusnya kembali dianggap "pertama
        // kali". jumlah_percobaan sendiri otomatis kembali 0 setelah
        // di-reset (lihat cn_hapus_tryout di
        // api/admin/reset_peserta_progres.php), jadi memakainya di sini
        // membuat status "pernah masuk" ini ikut ke-reset juga.
        const pernahMasuk = tryout.jumlah_percobaan > 0 || adaProgres;
        el.innerHTML = `
            <div class="stage-card status-open">
                <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
                <div class="stage-icon"><i class="fa-solid fa-flag-checkered"></i></div>
                <div class="stage-body">
                    <h6>Siap Diselesaikan</h6>
                    <p>Semua bab sudah lulus. Kerjakan Final Tryout untuk menutup rangkaian Program Cakar Nalar.${infoSkorTerakhir}</p>
                </div>
                <button class="btn-bab-action" onclick="klikMulaiTryout(${pernahMasuk})">
                    ${adaProgres ? 'Lanjutkan Final Tryout' : 'Mulai Final Tryout'}
                </button>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="stage-card">
                <div class="card-decor" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
                <div class="stage-icon"><i class="fa-solid fa-lock"></i></div>
                <div class="stage-body">
                    <h6>Masih Terkunci</h6>
                    <p>Selesaikan dan luluskan semua bab terlebih dahulu untuk membuka Final Tryout.</p>
                </div>
            </div>`;
    }
}

/**
 * Cek apakah peserta SEDANG mengerjakan percobaan Final Tryout yang
 * belum disubmit -- dua sinyal, SAMA PERSIS dengan pengecekan
 * "sedangMengerjakan" di js/quiz.js (loadQuizSoal, lihat
 * "Object.keys(quizJawaban).length > 0 || percobaanKuisSudahDimulai()"):
 * 1. cn_progress_tryout_* -- sudah sempat MENJAWAB minimal 1 soal
 *    (diisi lewat saveQuizProgress()).
 * 2. cn_attempt_tryout_* -- soalnya sudah TERTAMPIL/mulai dikerjakan
 *    (diisi lewat tandaiPercobaanKuisSudahDimulai(), PERSIS begitu
 *    peserta klik "mulai/coba lagi" & soal pertama muncul), TERLEPAS
 *    dari sudah menjawab satu soal pun atau belum.
 * Sebelumnya di sini CUMA dicek sinyal (1) -- jadi peserta yang baru
 * masuk & lihat soal tapi belum sempat pilih jawaban apa pun (atau
 * baru pindah halaman lagi) tetap dianggap "belum ada progres" &
 * tombol dashboard-nya salah balik ke "Mulai Final Tryout" padahal
 * percobaannya sudah berjalan.
 */
function cekProgresTryoutBelumSelesai() {
    try {
        if (localStorage.getItem('cn_attempt_tryout_' + currentUser.id) !== null) return true;
        const raw = localStorage.getItem('cn_progress_tryout_' + currentUser.id);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Diklik dari tombol "Mulai/Lanjutkan Final Tryout" di dashboard.
 * Kalau peserta sudah PERNAH mengerjakan Final Tryout sebelumnya (atau
 * sedang di tengah percobaan aktif, lihat "pernahMasuk" di renderTryout),
 * langsung pindah halaman tanpa konfirmasi lagi -- dialog "Mulai Final
 * Tryout Sekarang?" cuma buat yang benar-benar pertama kali (sama pola
 * dengan konfirmasiLanjutTryout() di js/quiz.js untuk tombol "Lanjut ke
 * Final Tryout" di kuis.html).
 */
async function klikMulaiTryout(sudahPernahMasuk) {
    if (sudahPernahMasuk) {
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

// =================================================================
// PROGRES KESELURUHAN (ring SVG)
// =================================================================
function renderProgress(data) {
    const totalTahap = data.bab.length + 2; // + Tes Diagnostik + Final Tryout
    let selesai = 0;
    if (data.diagnostik.selesai) selesai++;
    selesai += data.bab.filter(b => b.lulus).length;
    if (data.tryout.selesai) selesai++;

    const persen = totalTahap > 0 ? Math.round((selesai / totalTahap) * 100) : 0;

    const ring = document.getElementById('progressRing');
    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - persen / 100);

    document.getElementById('progress-percent').textContent = persen + '%';
    document.getElementById('progress-caption').textContent = selesai + ' dari ' + totalTahap + ' tahap selesai';

    // Kalimat sambutan ikut berubah sesuai progres keseluruhan -- BUKAN
    // teks statis lagi: "belum mulai sama sekali" (0%) dapat ajakan buat
    // MULAI, "sudah 100%" dapat ucapan selamat karena rangkaiannya sudah
    // tuntas, sisanya (masih di tengah jalan) tetap teks ajakan LANJUTKAN
    // yang lama.
    const subtitleEl = document.getElementById('welcome-subtitle');
    if (subtitleEl) {
        // Teks statis (tidak ada data dinamis peserta yang diselipkan di
        // sini) -- jadi <em>Digital Citizen</em> ditulis langsung di
        // string-nya lalu dipasang lewat innerHTML (BUKAN textContent lagi,
        // supaya tag <em>-nya benar-benar dirender jadi italic, bukan
        // muncul sebagai teks "<em>" mentah).
        let teksSubtitle;
        if (persen >= 100) {
            teksSubtitle = 'Selamat! Kamu sudah menyelesaikan seluruh rangkaian Program Cakar Nalar dan resmi jadi <em>Digital Citizen</em> yang kritis dan kebal hoaks.';
        } else if (selesai === 0) {
            teksSubtitle = 'Yuk mulai perjalanan belajarmu untuk jadi <em>Digital Citizen</em> yang kritis dan kebal hoaks!';
        } else {
            teksSubtitle = 'Lanjutkan perjalanan belajarmu untuk jadi <em>Digital Citizen</em> yang kritis dan kebal hoaks.';
        }
        subtitleEl.innerHTML = teksSubtitle;
    }

    // Warna ring progres & ikon dekoratif kartu sambutan ikut berubah
    // sesuai progres keseluruhan -- SAMA POLA dengan watermark kartu
    // Bab/Diagnostik/Tryout (lihat .card-decor di css/dashboard.css):
    // abu-abu kalau belum mulai sama sekali, amber kalau masih di
    // tengah jalan, teal kalau sudah 100%. Ditandai lewat class di
    // #welcome-card, bukan inline style, supaya warnanya diatur di CSS
    // (satu tempat, konsisten dengan card-decor lainnya).
    const welcomeCard = document.getElementById('welcome-card');
    if (welcomeCard) {
        welcomeCard.classList.remove('progress-none', 'progress-mid', 'progress-complete');
        if (persen >= 100) {
            welcomeCard.classList.add('progress-complete');
        } else if (selesai === 0) {
            welcomeCard.classList.add('progress-none');
        } else {
            welcomeCard.classList.add('progress-mid');
        }
    }

    // Tombol CTA kartu sambutan (dulu cuma "Lihat Laporan Lengkap" yang
    // muncul begitu 100%, sekarang SELALU ada satu tombol yang mengikuti
    // tahap mana pun yang lagi aktif -- lihat renderWelcomeCta()).
    renderWelcomeCta(data);
}

/**
 * Tombol CTA utama di kartu sambutan Dashboard -- SATU tombol yang
 * berubah mengikuti tahap yang PALING RELEVAN buat peserta saat ini,
 * urutan prioritasnya (dari atas = dicek duluan):
 *   1. Final Tryout sudah selesai (lulus) -- program TUNTAS 100% ->
 *      "Lihat Laporan Lengkap" (SAMA PERSIS tombol yang sama di
 *      laporan.html/js/laporan.js begitu program selesai).
 *   2. Tes Diagnostik belum selesai -- SAMA PERSIS tombol & dialog
 *      konfirmasi di kartu Tes Diagnostik (renderDiagnostik) di bawahnya,
 *      cuma dipanggil ulang di sini supaya peserta tidak perlu scroll ke
 *      bawah dulu buat mulai/lanjut.
 *   3. Diagnostik sudah selesai TAPI masih ada bab yang belum lulus --
 *      "Lanjutkan Belajar", langsung ke bab yang lagi aktif (bab
 *      TERAKHIR yang sudah terbuka -- karena bab terbuka satu-satu
 *      berurutan, "bab terakhir yang terbuka" itu SELALU sama dengan
 *      "bab pertama yang belum lulus", lihat pencarian babAktif di
 *      bawah).
 *   4. Semua bab sudah lulus TAPI Final Tryout belum selesai -- SAMA
 *      PERSIS tombol & dialog konfirmasi di kartu Final Tryout
 *      (renderTryout) di bawahnya.
 * Kalau tidak ada satu pun kondisi di atas yang cocok (harusnya tidak
 * pernah terjadi selama datanya konsisten), tombolnya disembunyikan lagi
 * (html kosong) supaya tidak menampilkan kotak kosong.
 */
function renderWelcomeCta(data) {
    const el = document.getElementById('welcome-cta-actions');
    if (!el) return;

    let html = '';

    if (data.tryout.selesai) {
        html = `
            <button class="btn-bab-action" onclick="cnGoTo('laporan.html')">
                <i class="fa-solid fa-file-lines"></i> Lihat Laporan Lengkap
            </button>`;
    } else if (!data.diagnostik.selesai) {
        const adaProgres = cekProgresDiagnostikBelumSelesai(data.diagnostik);
        html = `
            <button class="btn-bab-action" onclick="konfirmasiMulaiDiagnostik(${adaProgres})">
                <i class="fa-solid fa-flask"></i> ${adaProgres ? 'Lanjutkan Tes Diagnostik' : 'Mulai Tes Diagnostik'}
            </button>`;
    } else {
        // Bab terbuka SATU-SATU berurutan (lihat api/get_bab.php) -- jadi
        // bab pertama yang belum lulus & belum terkunci itu PASTI bab
        // TERAKHIR yang sudah terbuka (semua bab sebelum ini sudah lulus,
        // semua sesudahnya masih terkunci).
        const babAktif = data.bab.find(b => !b.lulus && !b.locked);
        if (babAktif) {
            html = `
                <button class="btn-bab-action" onclick="bukaMateri(${babAktif.id})">
                    <i class="fa-solid fa-book-open"></i> Lanjutkan Belajar
                </button>`;
        } else if (data.tryout.terbuka) {
            const adaProgresTryout = cekProgresTryoutBelumSelesai();
            const pernahMasuk = data.tryout.jumlah_percobaan > 0 || adaProgresTryout;
            html = `
                <button class="btn-bab-action" onclick="klikMulaiTryout(${pernahMasuk})">
                    <i class="fa-solid fa-flag-checkered"></i> ${adaProgresTryout ? 'Lanjutkan Final Tryout' : 'Mulai Final Tryout'}
                </button>`;
        }
    }

    el.innerHTML = html;
    el.style.display = html ? 'flex' : 'none';
}

// =================================================================
// HELPER: escape HTML sederhana (judul/ringkasan bisa diedit admin)
// =================================================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Judul Bab & Ringkasan Singkat diinput admin lewat editor rich text
// (bold/italic/underline) di Panel Admin, jadi dirender di sini sebagai
// HTML (bukan di-escape jadi teks polos). Tetap disaring dulu (cuma
// izinkan tag yang benar-benar dipakai editor itu) sebagai lapisan aman
// kedua, jaga-jaga kalau data di database pernah diubah lewat jalur lain
// di luar editor.
function sanitizeRichHtmlDashboard(html) {
    if (!html) return '';
    const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'SPAN']);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    (function clean(node) {
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === 1) {
                if (!allowedTags.has(child.tagName)) {
                    node.replaceChild(document.createTextNode(child.textContent), child);
                    return;
                }
                Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                clean(child);
            }
        });
    })(tmp);
    return tmp.innerHTML;
}