// =================================================================
// PANEL ADMIN - Cakar Nalar
// =================================================================

// Lebar scrollbar <html> "asli" (waktu belum ada modal terbuka sama
// sekali) -- diukur SEKALI di sini, sebelum "cn-modal-scroll-lock"
// (lihat openAdminModal/closeAdminModal di bawah) sempat menyembunyikan
// scrollbar itu. Dipakai untuk mengompensasi posisi tombol "kembali ke
// atas" di dialog Monitor Peserta (lihat monitorSetupReviewBackToTop):
// begitu modal dibuka, <html> kehilangan lebar scrollbar-nya (di browser
// yang scrollbar-nya memakan ruang layout, mis. Chrome di Windows -- di
// browser dengan scrollbar overlay, mis. Mac, nilainya otomatis 0), jadi
// TANPA kompensasi ini tombolnya bergeser sejauh lebar scrollbar itu ke
// kanan dibanding posisi tombol "kembali ke atas" yang sama di index.html
// (yang <html>-nya tidak pernah dikunci karena tidak ada modal).
const CN_SCROLLBAR_WIDTH = window.innerWidth - document.documentElement.clientWidth;

// Auto-refresh Monitor Peserta (lihat startMonitorAutoRefresh di bawah) --
// dideklarasikan di sini (paling atas, sebelum auth guard IIFE yang
// memanggil startMonitorAutoRefresh()) supaya tidak kena TDZ ("Cannot
// access ... before initialization") -- kalau "let"/"const" ini taruh
// SETELAH IIFE yang memanggilnya, referensinya di dalam fungsi itu masih
// dianggap belum diinisialisasi waktu benar-benar dipanggil, walau
// deklarasi fungsinya sendiri di-hoist duluan.
const MONITOR_AUTO_REFRESH_MS = 30000;
let monitorAutoRefreshTimer = null;

// Tombol "kembali ke atas" khusus halaman Monitor Peserta & Manajemen User
// (dua-duanya sama-sama bisa berisi daftar peserta yang panjang -- lihat
// initAdminBackToTop/updateAdminBackToTop di bawah) -- sama seperti
// MONITOR_AUTO_REFRESH_MS di atas, dideklarasikan di sini (bukan dekat
// definisi fungsinya) supaya tidak kena TDZ waktu dipanggil dari auth
// guard IIFE.
let adminBackToTopRingCircumference = 0;

const API_BASE = 'api/';
let adminUser = null;
let currentJenis = 'diagnostik';
let babListCache = [];
let soalListCache = [];
let soalManagePage = 0; // halaman aktif di daftar Kelola Soal (0-indexed, 10 soal/halaman) -- sama polanya dengan babKuisManagePage di bawah
const SOAL_PER_PAGE = 10;

// Konteks Kuis per Bab yang sedang dikelola DARI DALAM modal Kelola
// Materi Bab (lihat bagian "KUIS PER BAB" di bawah). Terpisah dari
// currentJenis/soalListCache di atas (dipakai halaman Kelola Soal untuk
// Tes Diagnostik/Final Tryout saja) supaya kedua alur ini tidak
// bentrok satu sama lain.
let babKuisBabId = null;
let babKuisSoalCache = [];
let babKuisManagePage = 0; // halaman aktif di modal "Kelola Soal Kuis" (0-indexed, 10 soal/halaman)

// Konteks halaman "Monitor Peserta" (lihat bagian "MONITOR PESERTA" di
// bawah) -- monitorPesertaCache disimpan APA ADANYA dari server (tidak
// difilter di sana), pencarian/filter/urutan cuma memengaruhi RENDER-nya
// lewat renderMonitorTable(), supaya tidak perlu fetch ulang tiap kali
// admin mengetik di kolom cari/ganti filter.
let monitorPesertaCache = [];
let monitorTotalBab = 0;
let monitorSortKey = 'name';
let monitorSortDir = 'asc';

// --- Cache halaman "Umpan Balik" (menu admin) -- daftar respons, dimuat
//     sekali lewat loadUmpanBalikList(), difilter di render-nya saja
//     (SAMA POLA dengan monitorPesertaCache di atas). ---
let umpanBalikListCache = [];

// Ditandai true begitu ada urutan soal yang digeser (drag & drop) tapi
// BELUM disimpan ke server -- urutan baru cuma boleh benar-benar
// tersimpan begitu admin klik "Simpan Bab" (lihat submitBabForm()),
// SAMA seperti field lain di form Bab. Kalau modal Ubah Bab ditutup
// lewat "Batal"/X tanpa simpan, perubahan urutan ini dibuang begitu saja
// (lihat closeBabModal()).
let babKuisUrutanDirty = false;

// =================================================================
// FILE MATERI (PPT/PPTX/PDF) -- BISA LEBIH DARI SATU per bab, jadi
// state pending-nya berbentuk daftar/kumpulan (bukan 1 flag seperti
// urutan soal kuis di atas):
//   - babFileMateriCache        : file yang SUDAH terunggah untuk bab
//                                 yang sedang dibuka (dimuat dari
//                                 babListCache.file_materi waktu modal
//                                 Ubah Bab dibuka).
//   - babFileMateriPendingAdd   : array File baru yang DIPILIH tapi
//                                 belum diunggah.
//   - babFileMateriPendingDeleteIds : Set id file lama yang DITANDAI
//                                 untuk dihapus tapi belum dieksekusi.
// Sama seperti babKuisUrutanDirty, isi ketiganya baru benar-benar
// dikirim ke server begitu admin klik "Simpan" (lihat submitBabForm()),
// dan dibuang lagi kalau modal ditutup lewat "Batal"/X tanpa simpan.
let babFileMateriCache = [];
let babFileMateriPendingAdd = [];
let babFileMateriPendingDeleteIds = new Set();

// =================================================================
// VIDEO BAB -- bisa mode "Link YouTube" (video_url, seperti sebelumnya)
// ATAU mode "Upload File Video" (video_file), cuma salah satu yang
// aktif. Pola pending-nya sama seperti file materi PPT di atas (dulu
// sebelum jadi multi-file): 1 file baru yang dipilih tapi belum
// diunggah (babVideoPendingFile), atau penghapusan file lama yang
// ditandai tapi belum dieksekusi (babVideoPendingDelete) -- baru
// benar-benar dikirim/dihapus di server begitu klik "Simpan".
let babVideoPendingFile = null;
let babVideoPendingDelete = false;

// Penomoran unik untuk baris opsi jawaban dinamis (Kuis per Bab) di
// dalam modal Tambah/Ubah Soal -- dipakai supaya tiap baris opsi bisa
// dibedakan (radio "jawaban benar" & tombol hapus) walau isinya berubah.
let opsiDinamisSeq = 0;

// =================================================================
// AUTH GUARD: harus login sebagai admin
// =================================================================
(function checkAdminAuth() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        adminUser = JSON.parse(saved);
        if (!adminUser || !adminUser.id) throw new Error('invalid');
        if (adminUser.role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('adminName').textContent = adminUser.name;
    document.getElementById('adminAvatar').textContent = adminUser.name.charAt(0).toUpperCase();

    loadBabListCache();
    loadDurasiTes(currentJenis);
    loadPetunjukTes(currentJenis);
    loadSoalList();
    // Monitor Peserta sekarang halaman default yang langsung tampil begitu
    // admin.html dibuka (lihat urutan sidebar & "page-monitor" tanpa
    // display:none di admin.html) -- datanya perlu langsung dimuat di
    // sini juga, bukan cuma nunggu diklik lewat switchAdminPage('monitor').
    loadMonitorPeserta();
    startMonitorAutoRefresh();
    initAdminBackToTop();
    initUserEditFormValidasi();
})();

// =================================================================
// TOMBOL "KEMBALI KE ATAS" -- BEBERAPA HALAMAN ADMIN
// =================================================================
// Replikasi tombol back-to-top yang sama seperti di index.html (lingkaran
// progres scroll + tombol panah mengambang di pojok kanan bawah), tapi
// khusus untuk halaman-halaman admin yang isinya bisa jadi panjang:
// Monitor Peserta, Kelola Soal (Tes Diagnostik & Final Tryout -- satu
// section yang sama, #page-soal, cuma beda tab), Kelola Materi,
// Manajemen User, dan Umpan Balik. Sengaja TIDAK tampil di halaman admin
// lain (mis. Dashboard) yang isinya memang pendek/tidak butuh discroll
// jauh. Beda dari monitorSetupReviewBackToTop (scroll di DALAM modal
// rincian jawaban) -- ini scroll jendela/window biasa.
function initAdminBackToTop() {
    const ring = document.getElementById('adminBackToTopRing');
    if (!ring) return;
    const radius = ring.r.baseVal.value;
    adminBackToTopRingCircumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = adminBackToTopRingCircumference;
    ring.style.strokeDashoffset = adminBackToTopRingCircumference;
    updateAdminBackToTop();
    window.addEventListener('scroll', updateAdminBackToTop, { passive: true });
    window.addEventListener('resize', updateAdminBackToTop);
}

function updateAdminBackToTop() {
    const btn = document.getElementById('adminBackToTopBtn');
    const ring = document.getElementById('adminBackToTopRing');
    if (!btn || !ring) return;
    const halamanDenganTombol = ['page-soal', 'page-materi', 'page-monitor', 'page-user', 'page-umpan-balik'];
    const sedangDiHalamanPanjang = halamanDenganTombol.some((id) => {
        const section = document.getElementById(id);
        return section && section.style.display !== 'none';
    });
    if (!sedangDiHalamanPanjang) {
        btn.classList.remove('show');
        return;
    }
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
    ring.style.strokeDashoffset = adminBackToTopRingCircumference * (1 - progress);
    btn.classList.toggle('show', scrollTop > 320);
}

function scrollAdminToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =================================================================
// AUTO-REFRESH MONITOR PESERTA
// =================================================================
// Bukan realtime beneran (butuh WebSocket, tidak didukung shared hosting
// Rumahweb) -- ini cuma polling berkala tiap MONITOR_AUTO_REFRESH_MS
// supaya data (terutama "Sedang Aktif Mengerjakan") tidak basi kalau
// admin membiarkan tab ini terbuka lama. Jeda 30 detik dipilih sebagai
// titik tengah: cukup responsif untuk kebutuhan monitoring (status
// "sedang mengerjakan" jarang berubah dalam hitungan detik), tapi tidak
// membebani server dengan query berulang terlalu sering. (Konstanta &
// state-nya sendiri dideklarasikan di paling atas file -- lihat catatan
// di sana.)
function startMonitorAutoRefresh() {
    if (monitorAutoRefreshTimer) return;
    monitorAutoRefreshTimer = setInterval(() => {
        // Lewati tick ini (jangan fetch/re-render) kalau:
        // - admin sedang tidak di halaman Monitor Peserta,
        // - tab browser sedang tidak aktif (di-minimize/pindah tab) --
        //   Page Visibility API, biar tidak buang-buang request waktu
        //   tab ditinggal,
        // - ada modal admin yang sedang terbuka (mis. dialog Detail
        //   Peserta/Pembahasan) -- refresh diam-diam di baliknya bisa
        //   bikin data di dalam modal itu jadi tidak sinkron/mengganggu
        //   admin yang lagi baca.
        const monitorSection = document.getElementById('page-monitor');
        if (!monitorSection || monitorSection.style.display === 'none') return;
        if (document.hidden) return;
        if (openAdminModalCount > 0) return;
        loadMonitorPeserta(true); // silent: tanpa status "Memuat..." yang bikin tabelnya kelihatan berkedip
    }, MONITOR_AUTO_REFRESH_MS);
}

async function adminLogout() {
    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Keluar dari akun?',
        text: 'Kamu akan keluar dari Panel Admin.',
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
// MODAL: buka/tutup dengan animasi (fade + scale), dipakai semua modal
// (Bab, Kelola Soal Kuis, Tambah/Ubah Soal) supaya transisinya tidak
// kaku (langsung muncul/hilang tanpa transisi).
//
// Penguncian scroll di belakang modal PAKAI class "cn-modal-scroll-lock"
// yang SAMA dengan yang dipakai modal Masuk/Daftar (lihat style.css +
// main.js) -- bukan bikin mekanisme baru. Situs ini scroll di level
// <html> (bukan <body>, <html> selalu punya "overflow-y: scroll" di
// style.css supaya lebar halaman tidak berubah pindah antar halaman).
// "cn-modal-scroll-lock" mematikan scrollbar <html> itu SEMENTARA modal
// terbuka, supaya cuma ada satu scrollbar aktif (punya modal itu sendiri
// kalau isinya kepanjangan) -- bukan dua scrollbar (html + modal)
// berbarengan seperti sebelumnya. Lebar yang tadinya dipakai scrollbar
// dikompensasi lewat paddingRight persis seperti initModalScrollLockFix()
// di main.js, supaya halaman/dialognya tidak kelihatan geser.
// =================================================================
// Hitung berapa modal yang lagi terbuka bersamaan (modal soal bisa dibuka
// DARI DALAM modal bab/kelola-soal-kuis, jadi bisa lebih dari 1 sekaligus)
// -- lock cuma dilepas begitu SEMUA modal sudah tertutup.
let openAdminModalCount = 0;

function openAdminModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (openAdminModalCount === 0) {
        const html = document.documentElement;
        // Ukur lebar scrollbar SEBELUM disembunyikan (waktu overflow-y masih
        // "scroll", jadi innerWidth - clientWidth = lebar scrollbar yang
        // sebenarnya lagi dipakai browser).
        const scrollbarWidth = window.innerWidth - html.clientWidth;
        if (scrollbarWidth > 0) html.style.paddingRight = scrollbarWidth + 'px';
        html.classList.add('cn-modal-scroll-lock');
    }
    openAdminModalCount++;
    el.classList.add('open');
    // Paksa reflow dulu sebelum menambahkan "show" -- supaya browser
    // benar-benar menganggap perubahan opacity/transform-nya sebagai
    // transisi, bukan cuma lompat ke state akhir tanpa animasi (karena
    // elemennya baru saja berubah dari display:none ke display:flex).
    void el.offsetWidth;
    // Dua "requestAnimationFrame" bertingkat (bukan cuma satu) -- satu
    // rAF saja kadang masih sempat "digabung" browser dalam frame yang
    // SAMA dengan perubahan scrollbar/padding di atas, jadi transisi
    // modal (fade-in) mulai duluan SEBELUM browser benar-benar selesai
    // menggambar ulang halaman tanpa scrollbar lama-nya -- keliatan
    // sebagai scrollbar lama masih nongol sebentar di sebelah modal yang
    // baru muncul, baru sesaat kemudian halamannya "geser" nutup begitu
    // repaint-nya nyusul. rAF kedua memaksa lompat ke frame BERIKUTNYA
    // (setelah repaint pertama itu pasti sudah selesai), baru dari situ
    // animasi fade-in modalnya mulai -- jadi sudah tidak ada lagi
    // scrollbar lama yang sempat kelihatan.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('show'));
    });
}

function closeAdminModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    openAdminModalCount = Math.max(0, openAdminModalCount - 1);
    setTimeout(() => {
        el.classList.remove('open'); // samakan dgn durasi transition CSS
        // Lepas kunci scroll di sini juga (bukan langsung waktu diklik) --
        // supaya scrollbar halaman baru balik muncul SETELAH modalnya
        // benar-benar selesai memudar, bukan nongol duluan sementara
        // modalnya masih kelihatan menutupinya (dua gerakan visual yang
        // sama-sama masih jalan itu yang bikin kesannya "geser"/flicker).
        if (openAdminModalCount === 0) {
            const html = document.documentElement;
            html.classList.remove('cn-modal-scroll-lock');
            html.style.paddingRight = '';
        }
    }, 200);
}

// =================================================================
// SINKRONKAN SweetAlert2 DENGAN PENGUNCI SCROLL DI ATAS
// =================================================================
// Pola yang sering terjadi di sini: tutup modal (mis. closeBabModal())
// LALU langsung tampilkan Swal.fire() sukses -- dua dialog beriringan.
// Tanpa ini, closeAdminModal() di atas tetap melepas kunci scroll
// persis 200ms kemudian (sesuai timer-nya sendiri) TANPA tahu ada
// SweetAlert2 yang masih terbuka menutupi layar -- begitu kuncinya
// lepas, scrollbar <html> yang sempat disembunyikan muncul lagi
// mendadak SAAT dialog Swal masih kelihatan, jadi halaman di
// belakangnya (dan dialognya) seperti "kedut"/geser sedikit ke kiri.
// Perbaikannya: bungkus Swal.fire supaya dia ikut menambah/mengurangi
// "openAdminModalCount" yang SAMA seperti modal admin biasa -- jadi
// closeAdminModal() di atas melihat hitungannya belum 0 (karena Swal
// masih terhitung "terbuka") dan menunda pelepasan kunci sampai
// Swal-nya sendiri betul-betul tertutup -- dipantau lewat "didClose"
// bawaan SweetAlert2 (bukan "willClose", yang terpanggil DUA-AN
// waktu animasi keluarnya baru MULAI, bukan waktu dialognya beneran
// sudah hilang dari layar -- kuncinya jadi sempat lepas sepersekian
// detik lebih awal, pas dialog masih terlihat memudar. "didClose"
// baru terpanggil setelah elemennya benar-benar dibuang dari DOM).
//
// PENTING soal desinkronisasi hitungan (ini penyebab bug "scroll hilang
// permanen" yang dilaporkan): SweetAlert2 itu SATU popup tunggal
// (singleton) -- kalau Swal.fire() dipanggil LAGI sementara dialog
// sebelumnya masih terbuka (mis. toast sukses "Menyimpan..." langsung
// disusul toast lain, atau dua aksi cepat berturut-turut), popup lama
// itu DIGANTI kontennya, bukan ditumpuk jadi dua popup terpisah -- dan
// "didClose" milik pemanggilan yang PERTAMA bisa jadi tidak pernah
// terpanggil sama sekali (karena elemen popupnya tidak benar-benar
// dibuang dari DOM, cuma diperbarui). Kalau setiap panggilan Swal.fire()
// menambah "openAdminModalCount" sendiri-sendiri seperti sebelumnya,
// hitungannya jadi lebih besar dari jumlah "didClose" yang benar-benar
// terpanggil -- hitungan tersangkut di atas 0 SELAMANYA, dan kunci
// scroll tidak pernah lepas lagi sampai halaman di-refresh. Makanya di
// sini dipakai SATU penanda boolean ("swalHitungTerpakai"), bukan
// hitungan per-panggilan -- jadi berapa kali pun Swal.fire() dipanggil
// beruntun sementara popup yang sama masih terbuka, "openAdminModalCount"
// cuma bertambah SEKALI di awal, dan "didClose" (dari panggilan manapun
// yang akhirnya benar-benar terpanggil duluan) yang mengembalikannya.
(function syncSwalScrollLockWithAdminModal() {
    if (typeof Swal === 'undefined') return;
    const originalFire = Swal.fire.bind(Swal);
    let swalHitungTerpakai = false;
    Swal.fire = function (options) {
        if (!swalHitungTerpakai) {
            swalHitungTerpakai = true;
            if (openAdminModalCount === 0) {
                const html = document.documentElement;
                const scrollbarWidth = window.innerWidth - html.clientWidth;
                if (scrollbarWidth > 0) html.style.paddingRight = scrollbarWidth + 'px';
                html.classList.add('cn-modal-scroll-lock');
            }
            openAdminModalCount++;
        }
        const userDidClose = options && options.didClose;
        const patchedOptions = Object.assign({}, options, {
            didClose: function (...args) {
                if (swalHitungTerpakai) {
                    swalHitungTerpakai = false;
                    openAdminModalCount = Math.max(0, openAdminModalCount - 1);
                    if (openAdminModalCount === 0) {
                        const html = document.documentElement;
                        html.classList.remove('cn-modal-scroll-lock');
                        html.style.paddingRight = '';
                    }
                }
                if (typeof userDidClose === 'function') userDidClose(...args);
            }
        });
        return originalFire(patchedOptions);
    };
})();

// =================================================================
// SIDEBAR (mobile)
// =================================================================
function openAdminSidebar() {
    document.getElementById('adminSidebar').classList.add('open');
    document.getElementById('adminSidebarBackdrop').classList.add('open');
}

function closeAdminSidebar() {
    document.getElementById('adminSidebar').classList.remove('open');
    document.getElementById('adminSidebarBackdrop').classList.remove('open');
}

// =================================================================
// SIDEBAR (desktop) -- perkecil/perbesar
// =================================================================
const CN_ADMIN_SIDEBAR_COLLAPSE_KEY = 'cn_admin_sidebar_collapsed';

function terapkanSidebarDiperkecil(diperkecil) {
    document.getElementById('adminSidebar').classList.toggle('collapsed', diperkecil);
    document.body.classList.toggle('admin-sidebar-collapsed', diperkecil);
    const btn = document.getElementById('adminSidebarCollapseBtn');
    if (btn) btn.title = diperkecil ? 'Perbesar sidebar' : 'Perkecil sidebar';
}

function toggleAdminSidebarCollapse() {
    const sudahDiperkecil = document.getElementById('adminSidebar').classList.contains('collapsed');
    const diperkecilBaru = !sudahDiperkecil;
    terapkanSidebarDiperkecil(diperkecilBaru);
    try {
        localStorage.setItem(CN_ADMIN_SIDEBAR_COLLAPSE_KEY, diperkecilBaru ? '1' : '0');
    } catch (e) {
        // localStorage tidak tersedia (mis. mode private browsing yang ketat)
        // -- tidak masalah, sidebar tetap bisa diperkecil/diperbesar, cuma
        // preferensinya tidak diingat lain kali.
    }
}

// Terapkan preferensi tersimpan begitu halaman dimuat.
(function initSidebarDiperkecil() {
    let diperkecil = false;
    try {
        diperkecil = localStorage.getItem(CN_ADMIN_SIDEBAR_COLLAPSE_KEY) === '1';
    } catch (e) {
        // abaikan, anggap belum pernah diperkecil sebelumnya
    }
    terapkanSidebarDiperkecil(diperkecil);
})();

function switchAdminPage(page) {
    document.querySelectorAll('.admin-nav-item[data-page]').forEach(el => el.classList.remove('active'));
    document.querySelector(`.admin-nav-item[data-page="${page}"]`).classList.add('active');

    document.querySelectorAll('.admin-page-section').forEach(el => { el.style.display = 'none'; });
    const target = document.getElementById('page-' + page);
    if (target) target.style.display = '';

    // Reset pencarian/filter Monitor Peserta & Manajemen User begitu admin
    // PINDAH ke halaman lain (bukan pindah ke halaman itu sendiri) --
    // supaya waktu balik lagi ke halaman itu, datanya kelihatan lengkap
    // dari awal lagi. Kalau tidak, pencarian/filter yang sempat diisi bisa
    // kelupaan masih aktif & bikin bingung ("kok datanya cuma segini").
    if (page !== 'monitor') resetMonitorFilters();
    if (page !== 'user') resetUserManagementFilter();
    if (page !== 'umpan-balik') resetUmpanBalikFilter();

    closeAdminSidebar();
    updateAdminBackToTop(); // sembunyikan/tampilkan tombol "kembali ke atas" sesuai halaman yang baru aktif

    if (page === 'materi') loadBabList();
    if (page === 'monitor') loadMonitorPeserta();
    if (page === 'user') {
        // Data peserta (nama/email) dipakai bareng dengan halaman Monitor
        // Peserta -- kalau sudah pernah dimuat (monitorPesertaCache sudah
        // terisi), cukup render ulang dari cache; kalau belum (mis. admin
        // langsung buka halaman ini duluan), muat dari server dulu.
        if (monitorPesertaCache.length > 0) {
            renderUserManagementTable();
        } else {
            loadMonitorPeserta();
        }
    }
    if (page === 'umpan-balik') loadUmpanBalikList();
    if (page === 'soal') {
        // Setiap kali BALIK ke halaman ini (dari Kelola Materi atau
        // halaman lain), buang perubahan yang belum di-"Simpan" di kartu
        // Batas Waktu Pengerjaan/Petunjuk Pengerjaan (muat ulang dari
        // server, timpa isian yang sempat diketik admin) dan tutup lagi
        // dropdown-nya ke kondisi semula (collapsed) -- supaya form-nya
        // tidak "nyangkut" isian belum tersimpan begitu ditinggal pindah
        // halaman lalu balik lagi.
        document.getElementById('timer-collapse-card').classList.add('collapsed');
        document.getElementById('petunjuk-tes-collapse-card').classList.add('collapsed');
        loadDurasiTes(currentJenis);
        loadPetunjukTes(currentJenis);
    }
}

// =================================================================
// DAFTAR BAB (dipakai halaman Kelola Materi Bab)
// =================================================================
async function loadBabListCache() {
    try {
        const res = await fetch(API_BASE + 'admin/get_bab_admin.php');
        const result = await res.json();
        if (result.status === 'success') {
            babListCache = result.data;
        }
    } catch (err) {
        console.error('Gagal memuat daftar bab', err);
    }
}

// =================================================================
// KELOLA MATERI BAB (tambah/ubah/hapus bab -- jumlah bab bebas,
// tidak lagi tetap 6. Soal Kuis per Bab dikelola langsung dari modal
// Ubah/Tambah Bab lewat toggle "Ada Kuis untuk Bab Ini", bukan lagi
// dari menu Kelola Soal.)
// =================================================================
async function loadBabList() {
    const container = document.getElementById('bab-list-container');
    container.innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat bab...</div>`;

    await loadBabListCache();

    if (babListCache.length === 0) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-inbox"></i>Belum ada bab. Klik "Tambah" untuk mulai menambahkan.</div>`;
        return;
    }

    renderBabTable();
}

function renderBabTable() {
    const container = document.getElementById('bab-list-container');

    const rows = babListCache.map(bab => `
        <tr>
            <td style="width:60px; text-align:center;"><span class="bab-nomor-badge">${bab.nomor}</span></td>
            <td class="soal-text">
                <div style="font-weight:600; color:var(--primary-color); margin-bottom:2px;">${sanitizeRichHtmlAdmin(bab.judul)}</div>
                <div style="color:#8a8fa3; font-size:12.5px;">${sanitizeRichHtmlAdmin(bab.ringkasan)}</div>
            </td>
            <td style="width:280px;">
                <div class="admin-materi-status">
                    <span class="${bab.konten_materi ? 'ada' : 'belum'}">Teks ${bab.konten_materi ? 'ada' : 'belum'}</span>
                    <span class="${(bab.video_url || bab.video_file) ? 'ada' : 'belum'}">Video ${(bab.video_url || bab.video_file) ? 'ada' : 'belum'}</span>
                    <span class="${(bab.file_materi && bab.file_materi.length > 0) ? 'ada' : 'belum'}">File materi ${(bab.file_materi && bab.file_materi.length > 0) ? `(${bab.file_materi.length})` : 'belum'}</span>
                    <span class="${bab.ada_kuis ? 'ada' : 'belum'}">${bab.ada_kuis ? 'Ada kuis' : 'Tanpa kuis'}</span>
                </div>
            </td>
            <td style="width:110px;">
                <div class="admin-row-actions">
                    <button class="admin-icon-btn" onclick="openBabModal(${bab.id})" title="Ubah">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="admin-icon-btn danger" onclick="hapusBab(${bab.id})" title="Hapus">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="admin-table bab-table">
            <thead>
                <tr>
                    <th style="text-align:center;">No</th>
                    <th>Bab</th>
                    <th>Kelengkapan Materi</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// =================================================================
// MODAL TAMBAH / UBAH BAB
// =================================================================
function openBabModal(babId) {
    const form = document.getElementById('babForm');
    form.reset();
    document.getElementById('f-bab-form-id').value = '';
    document.getElementById('f-bab-ada-kuis').checked = true;
    document.getElementById('f-bab-nilai-minimal').value = '';
    document.getElementById('f-bab-kuis-pakai-waktu').checked = false;
    document.getElementById('f-bab-kuis-durasi-menit').value = '';
    toggleBabKuisDurasi();
    setRich('f-bab-judul', '');
    setRich('f-bab-ringkasan', '');
    setRich('f-bab-konten', '');
    setRich('f-bab-petunjuk-kuis', '');

    // File materi (PPT/PPTX/PDF) -- buang semua state pending & cache
    // punya bab sebelumnya.
    document.getElementById('f-bab-ppt-file').value = '';
    babFileMateriCache = [];
    babFileMateriPendingAdd = [];
    babFileMateriPendingDeleteIds = new Set();

    // Video -- default ke mode "Link YouTube" & buang state pending.
    document.querySelector('input[name="f-bab-video-mode"][value="link"]').checked = true;
    document.getElementById('f-bab-video-file').value = '';
    babVideoPendingFile = null;
    babVideoPendingDelete = false;

    babKuisBabId = null;
    babKuisSoalCache = [];
    babKuisUrutanDirty = false;

    if (babId) {
        const bab = babListCache.find(b => b.id === babId);
        if (!bab) return;

        document.getElementById('babModalTitle').textContent = 'Ubah Materi';
        document.getElementById('f-bab-form-id').value = bab.id;
        document.getElementById('f-bab-nomor').value = bab.nomor;
        setRich('f-bab-judul', bab.judul || '');
        setRich('f-bab-ringkasan', bab.ringkasan || '');
        setRich('f-bab-konten', bab.konten_materi || '');
        setRich('f-bab-petunjuk-kuis', bab.petunjuk_kuis || '');
        document.getElementById('f-bab-video').value = bab.video_url || '';
        document.getElementById('f-bab-ada-kuis').checked = bab.ada_kuis !== false;
        document.getElementById('f-bab-nilai-minimal').value = (bab.nilai_minimal !== null && bab.nilai_minimal !== undefined) ? bab.nilai_minimal : '';
        const punyaDurasiKuis = bab.durasi_kuis_menit !== null && bab.durasi_kuis_menit !== undefined;
        document.getElementById('f-bab-kuis-pakai-waktu').checked = punyaDurasiKuis;
        document.getElementById('f-bab-kuis-durasi-menit').value = punyaDurasiKuis ? bab.durasi_kuis_menit : '';
        toggleBabKuisDurasi();

        babKuisBabId = bab.id;

        // Upload file materi/video cuma bisa dipakai kalau bab-nya sudah
        // punya id (lihat catatan di api/admin/upload_file_materi.php &
        // upload_video.php).
        document.getElementById('babPptSection').style.display = 'block';
        document.getElementById('babPptHintBaru').style.display = 'none';
        babFileMateriCache = Array.isArray(bab.file_materi) ? bab.file_materi.slice() : [];
        renderBabFileMateriList();

        document.getElementById('babVideoSection').style.display = 'block';
        document.getElementById('babVideoHintBaru').style.display = 'none';

        // Kalau bab ini sudah punya video HASIL UPLOAD, buka modal
        // langsung di mode "Upload File Video" (bukan default "Link").
        if (bab.video_file) {
            document.querySelector('input[name="f-bab-video-mode"][value="upload"]').checked = true;
        }
        ubahModeVideoBab();
        renderBabVideoCurrent(bab);
    } else {
        document.getElementById('babModalTitle').textContent = 'Tambah Materi';
        const nomorBerikutnya = babListCache.length > 0
            ? Math.max(...babListCache.map(b => b.nomor)) + 1
            : 1;
        document.getElementById('f-bab-nomor').value = nomorBerikutnya;

        document.getElementById('babPptSection').style.display = 'none';
        document.getElementById('babPptHintBaru').style.display = 'block';
        renderBabFileMateriList();

        document.getElementById('babVideoSection').style.display = 'none';
        document.getElementById('babVideoHintBaru').style.display = 'block';
        ubahModeVideoBab();
    }

    toggleBabKuisSection();
    openAdminModal('babModalBackdrop');
}

// =================================================================
// KUIS PER BAB (dikelola langsung dari dalam modal Kelola Materi Bab,
// lewat modal "Kelola Soal Kuis" terpisah supaya modal Ubah Bab tidak
// kepanjangan)
// =================================================================
function toggleBabKuisSection() {
    const adaKuis = document.getElementById('f-bab-ada-kuis').checked;
    const section = document.getElementById('babKuisSection');
    const summary = document.getElementById('babKuisSummary');
    const hintBaru = document.getElementById('babKuisHintBaru');
    const nilaiMinimalGroup = document.getElementById('babNilaiMinimalGroup');

    nilaiMinimalGroup.style.display = adaKuis ? '' : 'none';

    if (!adaKuis) {
        // Tidak ada kuis untuk bab ini -- seluruh bagian (termasuk judulnya)
        // tidak relevan, jadi disembunyikan semua, bukan cuma isinya.
        section.style.display = 'none';
        summary.style.display = 'none';
        hintBaru.style.display = 'none';
        return;
    }

    section.style.display = '';

    if (!babKuisBabId) {
        // Bab baru belum punya id -- soal kuis baru bisa ditambahkan
        // setelah bab-nya disimpan (sama seperti aturan upload PPT).
        summary.style.display = 'none';
        hintBaru.style.display = 'block';
        return;
    }

    hintBaru.style.display = 'none';
    summary.style.display = 'block';
    document.getElementById('babKuisSummaryText').textContent = 'Memuat jumlah soal...';
    loadBabKuisSoal(babKuisBabId).then(updateBabKuisSummaryText);
}

function updateBabKuisSummaryText() {
    const el = document.getElementById('babKuisSummaryText');
    if (!el) return;
    el.textContent = babKuisSoalCache.length === 0
        ? 'Belum ada soal kuis untuk bab ini.'
        : `${babKuisSoalCache.length} soal kuis sudah dibuat untuk bab ini.`;
}

// Tampil/sembunyikan kotak isian "Durasi (menit)" mengikuti tombol geser
// "Batas Waktu Pengerjaan" -- mirip pola toggleBabKuisSection() di atas.
// Dipanggil juga dari openBabModal() waktu modal dibuka/direset, bukan
// cuma lewat onchange di HTML.
function toggleBabKuisDurasi() {
    const pakaiWaktu = document.getElementById('f-bab-kuis-pakai-waktu').checked;
    document.getElementById('babKuisDurasiGroup').style.display = pakaiWaktu ? '' : 'none';
}

function openBabKuisManageModal() {
    if (!babKuisBabId) return;
    babKuisManagePage = 0;
    // Kalau ada urutan hasil drag & drop yang belum disimpan (belum klik
    // "Simpan Bab"), JANGAN timpa dengan fetch ulang dari server -- supaya
    // urutan yang belum disimpan itu tetap kelihatan kalau modal ini
    // ditutup lalu dibuka lagi tanpa sempat klik "Simpan Bab".
    if (babKuisUrutanDirty) {
        renderBabKuisSoalList();
    } else {
        loadBabKuisSoal(babKuisBabId);
    }
    openAdminModal('babKuisManageModalBackdrop');
}

function closeBabKuisManageModal() {
    closeAdminModal('babKuisManageModalBackdrop');
}

async function loadBabKuisSoal(babId) {
    const container = document.getElementById('bab-kuis-soal-list');
    container.innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat soal...</div>`;

    try {
        const res = await fetch(API_BASE + 'admin/get_soal.php?jenis=kuis&bab_id=' + babId);
        const result = await res.json();

        if (result.status !== 'success') {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat soal.')}</div>`;
            babKuisSoalCache = [];
            return;
        }

        babKuisSoalCache = result.data;
        renderBabKuisSoalList();
    } catch (err) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
        babKuisSoalCache = [];
    }
}

const BAB_KUIS_SOAL_PER_PAGE = 10;

function renderBabKuisSoalList() {
    const container = document.getElementById('bab-kuis-soal-list');
    const urutanHint = document.getElementById('bab-kuis-urutan-hint');
    if (urutanHint) urutanHint.style.display = babKuisUrutanDirty ? 'block' : 'none';

    if (babKuisSoalCache.length === 0) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-inbox"></i>Belum ada soal kuis untuk bab ini.</div>`;
        renderBabKuisSoalPagination();
        return;
    }

    const totalPages = Math.ceil(babKuisSoalCache.length / BAB_KUIS_SOAL_PER_PAGE);
    if (babKuisManagePage >= totalPages) babKuisManagePage = totalPages - 1;
    if (babKuisManagePage < 0) babKuisManagePage = 0;

    const start = babKuisManagePage * BAB_KUIS_SOAL_PER_PAGE;
    const end = Math.min(start + BAB_KUIS_SOAL_PER_PAGE, babKuisSoalCache.length);

    container.innerHTML = babKuisSoalCache.slice(start, end).map((soal, i) => {
        const idx = start + i;
        return `
        <div class="bab-kuis-soal-row" draggable="true" data-soal-id="${soal.id}">
            <i class="fa-solid fa-grip-vertical bab-kuis-soal-draghandle" title="Geser untuk mengurutkan"></i>
            <span class="bab-kuis-soal-nomor">${idx + 1}</span>
            <div class="bab-kuis-soal-text" title="${escapeHtmlAdmin(stripHtmlAdmin(soal.pertanyaan))}">${sanitizeRichHtmlAdmin(soal.pertanyaan)}</div>
            <div class="admin-row-actions">
                <button type="button" class="admin-icon-btn" onclick="openBabKuisSoalModal(${soal.id})" title="Ubah">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="admin-icon-btn danger" onclick="hapusBabKuisSoal(${soal.id})" title="Hapus">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    renderBabKuisSoalPagination();
    attachBabKuisDragHandlers();
}

// =================================================================
// DRAG & DROP untuk mengurutkan ulang soal kuis di modal "Kelola Soal
// Kuis" -- cuma bisa geser di dalam halaman paginasi yang sama yang
// sedang tampil (drag antar halaman tidak didukung, harus pindah
// halaman dulu). Urutan baru langsung disimpan ke server begitu
// dilepas (drop), tanpa perlu tombol "Simpan" terpisah.
// =================================================================
let babKuisDragSoalId = null;
// Ditandai lewat "mousedown" (BUKAN dicek di dalam "dragstart") -- soalnya
// target event "dragstart" versi HTML5 selalu ikut elemen yang
// draggable="true" (baris-nya), BUKAN elemen asli yang diklik/ditekan
// (ikon gagangnya), jadi e.target.closest(...) di dalam dragstart TIDAK
// PERNAH cocok dan drag jadi ke-cancel terus walau sudah pegang gagangnya.
// "mousedown" tidak punya masalah itu -- targetnya tetap elemen asli yang
// ditekan -- jadi dipakai untuk menandai izin drag SEBELUM dragstart
// (mousedown selalu terjadi lebih dulu) dijalankan browser.
let babKuisDragArmed = false;

function attachBabKuisDragHandlers() {
    const rows = document.querySelectorAll('#bab-kuis-soal-list .bab-kuis-soal-row');
    rows.forEach(row => {
        row.addEventListener('mousedown', (e) => {
            babKuisDragArmed = !!e.target.closest('.bab-kuis-soal-draghandle');
        });
        row.addEventListener('dragstart', (e) => {
            // Cuma boleh mulai drag dari ikon gagang di sebelah kiri --
            // supaya klik tombol Ubah/Hapus di baris yang sama tidak
            // kepicu jadi drag.
            if (!babKuisDragArmed) {
                e.preventDefault();
                return;
            }
            babKuisDragSoalId = Number(row.dataset.soalId);
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(babKuisDragSoalId)); // wajib diisi supaya drag jalan konsisten di semua browser (terutama Firefox)
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            babKuisDragArmed = false;
            document.querySelectorAll('#bab-kuis-soal-list .bab-kuis-soal-row.drag-over')
                .forEach(r => r.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (e) => {
            if (babKuisDragSoalId === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (Number(row.dataset.soalId) !== babKuisDragSoalId) row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-over');
            const targetId = Number(row.dataset.soalId);
            if (babKuisDragSoalId === null || targetId === babKuisDragSoalId) return;
            reorderBabKuisSoal(babKuisDragSoalId, targetId);
            babKuisDragSoalId = null;
        });
    });
}

function reorderBabKuisSoal(draggedId, targetId) {
    const fromIdx = babKuisSoalCache.findIndex(s => s.id === draggedId);
    const toIdx = babKuisSoalCache.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = babKuisSoalCache.splice(fromIdx, 1);
    babKuisSoalCache.splice(toIdx, 0, moved);
    // Urutan baru cuma diubah di memori dulu -- baru benar-benar dikirim
    // ke server begitu admin klik "Simpan Bab" (lihat submitBabForm()).
    babKuisUrutanDirty = true;
    renderBabKuisSoalList();
}

async function simpanUrutanBabKuisSoal() {
    if (!babKuisUrutanDirty) return;
    try {
        const res = await fetch(API_BASE + 'admin/reorder_soal_kuis.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bab_id: babKuisBabId,
                urutan: babKuisSoalCache.map(s => s.id)
            })
        });
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan urutan', text: result.message || 'Terjadi kesalahan.' });
            return;
        }
        babKuisUrutanDirty = false;
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Gagal menyimpan urutan', text: 'Tidak bisa terhubung ke server.' });
    }
}

function renderBabKuisSoalPagination() {
    const el = document.getElementById('bab-kuis-soal-pagination');
    if (!el) return;

    const totalPages = Math.ceil(babKuisSoalCache.length / BAB_KUIS_SOAL_PER_PAGE);
    if (totalPages <= 1) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    el.style.display = 'flex';
    el.innerHTML = `
        <button type="button" class="admin-btn-secondary" onclick="gantiHalamanBabKuisSoal(-1)" ${babKuisManagePage === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span>Halaman ${babKuisManagePage + 1}/${totalPages}</span>
        <button type="button" class="admin-btn-secondary" onclick="gantiHalamanBabKuisSoal(1)" ${babKuisManagePage === totalPages - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;
}

function gantiHalamanBabKuisSoal(delta) {
    const totalPages = Math.ceil(babKuisSoalCache.length / BAB_KUIS_SOAL_PER_PAGE);
    const next = babKuisManagePage + delta;
    if (next < 0 || next >= totalPages) return;
    babKuisManagePage = next;
    renderBabKuisSoalList();
}

function openBabKuisSoalModal(soalId) {
    const form = document.getElementById('soalForm');
    form.reset();
    document.getElementById('f-soal-id').value = '';
    document.getElementById('f-soal-jenis').value = 'kuis';
    document.getElementById('f-soal-babid').value = babKuisBabId;
    setSoalPilihanMode('kuis');
    setRich('f-pertanyaan', '');
    setRich('f-penjelasan', '');
    // Judulnya sendiri sudah bilang "Soal Kuis", jadi keterangan jenis di
    // bawah judul (yang dipakai Kelola Soal untuk Tes Diagnostik/Final
    // Tryout) tidak perlu ditampilkan di sini.
    document.getElementById('soalModalJenisHint').textContent = '';

    if (soalId) {
        const soal = babKuisSoalCache.find(s => s.id === soalId);
        if (!soal) return;

        document.getElementById('soalModalTitle').textContent = 'Ubah Soal Kuis';
        document.getElementById('f-soal-id').value = soal.id;
        setRich('f-pertanyaan', soal.pertanyaan);
        document.getElementById('f-urutan').value = soal.urutan;
        document.getElementById('f-poin').value = soal.poin !== null && soal.poin !== undefined ? soal.poin : '';
        setRich('f-penjelasan', soal.penjelasan || '');
        resetOpsiDinamis(soal.pilihan);
    } else {
        document.getElementById('soalModalTitle').textContent = 'Tambah Soal Kuis';
        resetOpsiDinamis(null);
    }

    openAdminModal('soalModalBackdrop');
}

async function hapusBabKuisSoal(soalId) {
    const konfirmasi = await Swal.fire({
        icon: 'warning',
        title: 'Hapus soal ini?',
        text: 'Soal yang dihapus tidak bisa dikembalikan.',
        showCancelButton: true,
        confirmButtonText: 'Ya, hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#d64550'
    });
    if (!konfirmasi.isConfirmed) return;

    try {
        const res = await fetch(API_BASE + 'admin/delete_soal.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis: 'kuis', id: soalId })
        });
        const result = await res.json();

        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Soal dihapus', timer: 1200, showConfirmButton: false });
            await loadBabKuisSoal(babKuisBabId);
            updateBabKuisSummaryText();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menghapus', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

function closeBabModal() {
    // Buang perubahan urutan soal kuis yang belum tersimpan (kalau ada) --
    // baik karena modal ditutup lewat "Batal"/X (memang harus dibuang),
    // maupun karena baru saja tersimpan lewat submitBabForm() (sudah
    // false duluan di situ, jadi baris ini tidak berpengaruh).
    babKuisUrutanDirty = false;
    // Sama halnya, buang semua state pending file materi (bisa lebih
    // dari satu, lihat catatan di deklarasi babFileMateriPendingAdd &
    // babFileMateriPendingDeleteIds) maupun video (babVideoPendingFile &
    // babVideoPendingDelete) yang belum sempat tersimpan.
    babFileMateriPendingAdd = [];
    babFileMateriPendingDeleteIds = new Set();
    document.getElementById('f-bab-ppt-file').value = '';
    babVideoPendingFile = null;
    babVideoPendingDelete = false;
    document.getElementById('f-bab-video-file').value = '';
    closeAdminModal('babModalBackdrop');
}

// Kunci/buka semua field form Tambah/Ubah Materi (bukan cuma tombol
// Simpan-nya) -- dipanggil dari submitBabForm() di awal (locked=true,
// tepat sebelum mulai simpan) dan di blok "finally"-nya (locked=false,
// baik berhasil, gagal, maupun error koneksi). Tombol "Batal"/X di
// header SENGAJA tidak ikut dikunci (ada di luar kedua fieldset ini)
// supaya admin tetap bisa menutup modalnya kalau berubah pikiran di
// tengah proses.
//
// Ada BEBERAPA <fieldset class="admin-babform-lockable"> terpisah (bukan
// satu fieldset besar) yang dikunci bareng di sini -- lihat catatan
// panjang di admin.html (persis di atas <form id="babForm">) soal
// KENAPA dipecah jadi beberapa fieldset kecil yang masing2 berdiri
// sendiri: intinya supaya area progress bar & persentase upload video
// (#babUploadProgressLabel/#babUploadProgressWrap) yang duduk DI LUAR
// fieldset manapun tidak ikut buram -- CSS "opacity" pada elemen induk
// (dipakai buat efek buram pas dikunci, lihat .admin-fieldset-reset:disabled
// di admin.css) otomatis berlaku ke SEMUA anak-turunannya tanpa bisa
// "dibatalkan" lagi oleh elemen anak manapun.
//
// fieldset.disabled = true otomatis mengunci semua elemen form ASLI di
// dalamnya (input, textarea, select, button) sekaligus -- tapi TIDAK
// berlaku untuk kolom Judul/Ringkasan/Teks Materi/Petunjuk Kuis yang
// sebenarnya berupa <div contenteditable> (lihat richify()), karena itu
// bukan elemen form biasa. Makanya contentEditable-nya masing-masing
// ikut dimatikan/dinyalakan manual di sini juga.
function setBabFormLocked(locked) {
    const form = document.getElementById('babForm');
    if (!form) return;

    form.querySelectorAll('fieldset.admin-babform-lockable').forEach((fs) => {
        fs.disabled = locked;
    });
    form.querySelectorAll('.rich-editable').forEach((editor) => {
        editor.contentEditable = locked ? 'false' : 'true';
    });
}

async function submitBabForm(event) {
    event.preventDefault();

    // Validasi wajib-isi manual untuk Judul Bab & Ringkasan Singkat --
    // atribut "required" bawaan tidak berlaku lagi karena elemen aslinya
    // sekarang disembunyikan (dipakai cuma sebagai penyimpan nilai rich
    // text), lihat catatan di richify().
    if (richTextIsEmpty(document.getElementById('f-bab-judul').value)) {
        Swal.fire({ icon: 'warning', title: 'Judul Bab belum diisi', text: 'Isi judul bab terlebih dahulu.' });
        return;
    }
    if (richTextIsEmpty(document.getElementById('f-bab-ringkasan').value)) {
        Swal.fire({ icon: 'warning', title: 'Ringkasan Singkat belum diisi', text: 'Isi ringkasan singkat bab terlebih dahulu.' });
        return;
    }

    // Validasi link YouTube -- kalau mode video-nya "Link YouTube" & link
    // itu diisi, wajib beneran link YouTube (youtube.com/youtu.be dengan
    // ID video yang bisa dikenali lewat isYoutubeUrlAdmin()), bukan
    // sembarang URL. Sebelumnya cuma dicek "berbentuk URL yang valid"
    // lewat <input type="url"> bawaan browser -- itu tidak menjamin
    // link-nya beneran dari YouTube, jadi admin bisa gak sadar salah
    // tempel link lain (mis. link Google Drive) dan baru ketauan
    // videonya gak ke-embed nanti di sisi peserta. Field-nya sendiri
    // tetap boleh dikosongkan (video opsional) -- yang divalidasi cuma
    // kalau memang diisi.
    const videoModeDicek = document.querySelector('input[name="f-bab-video-mode"]:checked').value;
    const videoUrlDicek = document.getElementById('f-bab-video').value.trim();
    if (videoModeDicek === 'link' && videoUrlDicek !== '' && !isYoutubeUrlAdmin(videoUrlDicek)) {
        Swal.fire({ icon: 'warning', title: 'Link YouTube tidak valid', text: 'Pastikan link-nya beneran dari YouTube (youtube.com atau youtu.be), bukan link lain.' });
        return;
    }

    // Validasi durasi kuis per bab -- kalau tombol geser "Batas Waktu
    // Pengerjaan" dinyalakan, durasinya wajib diisi angka menit yang
    // valid (bilangan bulat positif), bukan dikosongkan/negatif/nol.
    const kuisPakaiWaktu = document.getElementById('f-bab-kuis-pakai-waktu').checked;
    const kuisDurasiRaw = document.getElementById('f-bab-kuis-durasi-menit').value.trim();
    let durasiKuisMenit = null;
    if (kuisPakaiWaktu) {
        const angka = parseInt(kuisDurasiRaw, 10);
        if (kuisDurasiRaw === '' || isNaN(angka) || angka <= 0) {
            Swal.fire({ icon: 'warning', title: 'Durasi kuis belum diisi', text: 'Isi dulu durasinya, atau matikan togglenya.' });
            return;
        }
        durasiKuisMenit = angka;
    }

    const payload = {
        id: document.getElementById('f-bab-form-id').value || null,
        nomor: document.getElementById('f-bab-nomor').value,
        judul: sanitizeRichHtmlAdmin(document.getElementById('f-bab-judul').value).trim(),
        ringkasan: sanitizeRichHtmlAdmin(document.getElementById('f-bab-ringkasan').value).trim(),
        // richOrEmpty() -- kalau isinya cuma sisa markup kosong ("<div><br></div>"
        // dst setelah admin menghapus semua teksnya), dikirim '' apa adanya,
        // bukan markup kosong itu, supaya badge "Teks Ada/Teks Belum" di
        // tabel benar (lihat catatan di richOrEmpty()).
        konten_materi: richOrEmpty(sanitizeRichHtmlAdmin(document.getElementById('f-bab-konten').value)),
        petunjuk_kuis: richOrEmpty(sanitizeRichHtmlAdmin(document.getElementById('f-bab-petunjuk-kuis').value)),
        // Link video cuma dikirim kalau mode-nya "Link YouTube" -- di mode
        // "Upload File Video" nilai input link ini diabaikan (dikosongkan)
        // biar tidak nyangkut walau kotaknya sempat pernah diisi sebelum
        // admin pindah mode, karena cuma salah satu yang boleh aktif.
        video_url: document.querySelector('input[name="f-bab-video-mode"]:checked').value === 'link'
            ? document.getElementById('f-bab-video').value.trim()
            : '',
        ada_kuis: document.getElementById('f-bab-ada-kuis').checked,
        nilai_minimal: document.getElementById('f-bab-nilai-minimal').value === '' ? null : document.getElementById('f-bab-nilai-minimal').value,
        durasi_kuis_menit: durasiKuisMenit
    };

    const btn = document.getElementById('babFormSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';
    // Kunci semua field lain di form ini (judul, ringkasan, video, file
    // materi, toggle kuis, dst) selama proses simpan berjalan -- termasuk
    // selagi masih mengunggah video/file materi di belakang layar
    // setelah data bab-nya sendiri berhasil tersimpan (lihat langkah2 di
    // bawah). Ini supaya admin tidak bisa gak sengaja (atau ada yang
    // iseng) ubah isian lain di tengah proses, yang bisa bikin data yang
    // sedang disimpan jadi tidak sinkron. Tombol "Batal"/X sengaja
    // dibiarkan tetap aktif (ada di luar fieldset ini) supaya modalnya
    // tetap bisa ditutup kalau admin mau membatalkan.
    setBabFormLocked(true);

    try {
        const res = await fetch(API_BASE + 'admin/save_bab.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'success') {
            // Urutan soal kuis yang sempat digeser (drag & drop) tapi belum
            // tersimpan baru benar-benar dikirim ke server DI SINI, bareng
            // dengan berhasilnya simpan bab -- lihat catatan di
            // babKuisUrutanDirty.
            await simpanUrutanBabKuisSoal();
            const savedBabId = payload.id || (result.data && result.data.id);
            // Sama halnya, file materi (bisa lebih dari satu) yang sempat
            // dipilih/ditandai-hapus tapi belum dieksekusi baru benar-benar
            // dikirim ke server DI SINI, begitu juga video (upload/hapus) --
            // lihat catatan di deklarasi babFileMateriPendingAdd,
            // babFileMateriPendingDeleteIds, babVideoPendingFile & babVideoPendingDelete.
            //
            // Teks tombol dibiarkan "Menyimpan..." generik dari awal sampai
            // akhir (tidak diganti-ganti per tahap upload file materi/video)
            // -- progress upload video sendiri sudah kelihatan lewat progress
            // bar terpisah (#babUploadProgressWrap/#babUploadProgressBar),
            // jadi teks tombol tidak perlu ikut menyebut "file" atau "video".
            await unggahFileMateriBabPending(savedBabId);
            await hapusFileMateriBabPending();
            await unggahFileVideoBabPending(savedBabId);
            await hapusFileVideoBabPending(savedBabId);
            closeBabModal();
            Swal.fire({ icon: 'success', title: 'Berhasil', text: result.message, timer: 1500, showConfirmButton: false });
            await loadBabList();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Simpan';
        // Kalau modalnya sudah ditutup duluan (closeBabModal() di atas,
        // pas berhasil), fieldset-nya sudah tidak ada lagi di DOM --
        // setBabFormLocked() sendiri sudah jaga-jaga null-check ini, jadi
        // aman dipanggil lagi di sini tanpa perlu dicek dulu.
        setBabFormLocked(false);
    }
}

// =================================================================
// HAPUS BAB
// =================================================================
async function hapusBab(babId) {
    const konfirmasi = await Swal.fire({
        icon: 'warning',
        title: 'Hapus Materi Ini?',
        html: 'Menghapus materi ini juga akan menghapus seluruh soal Kuis per Bab, progres baca/lulus, dan riwayat hasil kuis peserta untuk materi ini. Tindakan ini tidak bisa dibatalkan.',
        showCancelButton: true,
        confirmButtonText: 'Ya, hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#d64550'
    });
    if (!konfirmasi.isConfirmed) return;

    try {
        const res = await fetch(API_BASE + 'admin/delete_bab.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: babId })
        });
        const result = await res.json();

        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Materi dihapus', timer: 1200, showConfirmButton: false });
            await loadBabList();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menghapus', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// =================================================================
// FILE MATERI (PPT/PPTX/PDF) BAB -- BISA LEBIH DARI SATU FILE
// =================================================================
// Render ulang daftar file materi: file yang SUDAH terunggah
// (babFileMateriCache, dicoret/ditandai kalau ada di
// babFileMateriPendingDeleteIds) diikuti file BARU yang dipilih tapi
// belum diunggah (babFileMateriPendingAdd). Semuanya cuma tampilan --
// belum ada yang benar-benar dikirim ke server sampai "Simpan" diklik.
function renderBabFileMateriList() {
    const el = document.getElementById('babPptList');
    if (!el) return;

    const items = [];

    babFileMateriCache.forEach(file => {
        if (babFileMateriPendingDeleteIds.has(file.id)) {
            items.push(`
                <div class="admin-ppt-current">
                    <i class="fa-solid fa-clock"></i>
                    <span class="admin-ppt-nama">${escapeHtmlAdmin(file.nama_asli)}</span>
                    <span class="admin-ppt-pending-hint">(Akan dihapus)</span>
                    <button type="button" class="admin-ppt-hapus" onclick="batalkanHapusFileMateriBab(${file.id})">Batalkan</button>
                </div>`);
        } else {
            items.push(`
                <div class="admin-ppt-current">
                    <i class="fa-solid fa-file-lines"></i>
                    <span class="admin-ppt-nama">${escapeHtmlAdmin(file.nama_asli)}</span>
                    <button type="button" class="admin-ppt-hapus" onclick="hapusFileMateriBab(${file.id})">Hapus</button>
                </div>`);
        }
    });

    babFileMateriPendingAdd.forEach((file, index) => {
        items.push(`
            <div class="admin-ppt-current">
                <i class="fa-solid fa-clock"></i>
                <span class="admin-ppt-nama">${escapeHtmlAdmin(file.name)}</span>
                <span class="admin-ppt-pending-hint">(Menunggu)</span>
                <button type="button" class="admin-ppt-hapus" onclick="batalkanFileMateriPendingAdd(${index})">Batalkan</button>
            </div>`);
    });

    el.innerHTML = items.length > 0
        ? items.join('')
        : `<span style="color:#8a8fa3; font-size:13px;">Belum ada file materi diunggah.</span>`;
}

// Dipanggil begitu admin MEMILIH satu/beberapa file sekaligus di kotak
// file (atribut "multiple") -- TIDAK langsung mengunggah. File-filenya
// cuma ditambahkan ke daftar pending (babFileMateriPendingAdd) dan baru
// benar-benar dikirim ke server begitu admin klik "Simpan" lewat
// unggahFileMateriBabPending().
function pilihFileMateriBab() {
    const fileInput = document.getElementById('f-bab-ppt-file');
    if (!fileInput.files.length) return;

    Array.from(fileInput.files).forEach(file => babFileMateriPendingAdd.push(file));
    // Dikosongkan lagi supaya kalau admin buka kotak file yang sama
    // sekali lagi buat menambah file lain, "onchange" tetap kepicu.
    fileInput.value = '';
    renderBabFileMateriList();
}

function batalkanFileMateriPendingAdd(index) {
    babFileMateriPendingAdd.splice(index, 1);
    renderBabFileMateriList();
}

// Klik "Hapus" di salah satu file materi yang sudah terunggah TIDAK
// langsung memanggil server -- cuma menandai id-nya (masuk ke
// babFileMateriPendingDeleteIds) & mengganti tampilannya. Baru
// benar-benar dihapus dari server begitu admin klik "Simpan" lewat
// hapusFileMateriBabPending().
function hapusFileMateriBab(fileId) {
    babFileMateriPendingDeleteIds.add(fileId);
    renderBabFileMateriList();
}

function batalkanHapusFileMateriBab(fileId) {
    babFileMateriPendingDeleteIds.delete(fileId);
    renderBabFileMateriList();
}

// Dipanggil dari submitBabForm() SETELAH bab-nya berhasil tersimpan --
// baru di titik ini file-file yang sempat dipilih admin benar-benar
// diunggah, SATU PER SATU (bukan bersamaan) supaya urutannya rapi &
// tidak membebani server sekaligus.
//
// Progress upload-nya dibuat SAMA PERSIS caranya seperti video (lihat
// unggahFileVideoBabPending() -- XMLHttpRequest, bukan fetch(), supaya
// bisa dengar event "progress" dari xhr.upload). Bedanya cuma di sini
// bisa ada LEBIH DARI SATU file yang diunggah bergantian, jadi label
// teksnya (#babPptUploadProgressPrefix) ikut disebutkan file ke berapa
// dari berapa total kalau memang lebih dari satu ("(ke-2/3)" dst),
// supaya admin tau progress bar-nya lagi ngukur file yang mana, bukan
// keseluruhan proses.
async function unggahFileMateriBabPending(babId) {
    if (babFileMateriPendingAdd.length === 0 || !babId) return;

    const files = babFileMateriPendingAdd.slice();
    babFileMateriPendingAdd = [];
    document.getElementById('f-bab-ppt-file').value = '';

    const progressWrap = document.getElementById('babPptUploadProgressWrap');
    const progressBar = document.getElementById('babPptUploadProgressBar');
    const progressLabel = document.getElementById('babPptUploadProgressLabel');
    const progressPrefix = document.getElementById('babPptUploadProgressPrefix');
    const progressPercent = document.getElementById('babPptUploadProgressPercent');
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressLabel) progressLabel.style.display = 'block';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressPrefix) {
            progressPrefix.textContent = files.length > 1
                ? `Mengunggah file materi (ke-${i + 1}/${files.length})...`
                : 'Mengunggah file materi...';
        }

        const formData = new FormData();
        formData.append('bab_id', babId);
        formData.append('file', file);

        try {
            const result = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', API_BASE + 'admin/upload_file_materi.php');

                xhr.upload.addEventListener('progress', (e) => {
                    if (!progressBar || !e.lengthComputable) return;
                    const persen = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = persen + '%';
                    if (progressPercent) progressPercent.textContent = persen + '%';
                });

                xhr.onload = () => {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new Error('Respons server tidak valid'));
                    }
                };
                xhr.onerror = () => reject(new Error('Gagal terhubung ke server'));
                xhr.send(formData);
            });

            if (result.status !== 'success') {
                Swal.fire({ icon: 'error', title: `Bab tersimpan, tapi "${file.name}" gagal diunggah`, text: result.message || 'Coba unggah lagi lewat "Ubah".' });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: `Bab tersimpan, tapi "${file.name}" gagal diunggah`, text: 'Periksa koneksi internet, lalu coba unggah lagi lewat "Ubah".' });
        }
    }

    if (progressWrap) progressWrap.style.display = 'none';
    if (progressLabel) progressLabel.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
}

// Dipanggil dari submitBabForm() SETELAH bab-nya berhasil tersimpan --
// baru di titik ini file-file materi yang sempat ditandai untuk dihapus
// benar-benar dihapus dari server, satu per satu.
async function hapusFileMateriBabPending() {
    if (babFileMateriPendingDeleteIds.size === 0) return;

    const ids = Array.from(babFileMateriPendingDeleteIds);
    babFileMateriPendingDeleteIds = new Set();

    for (const fileId of ids) {
        try {
            const res = await fetch(API_BASE + 'admin/delete_file_materi.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_id: fileId })
            });
            const result = await res.json();
            if (result.status !== 'success') {
                Swal.fire({ icon: 'error', title: 'Gagal menghapus salah satu file materi', text: result.message || 'Coba hapus lagi lewat "Ubah".' });
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Gagal menghapus salah satu file materi', text: 'Periksa koneksi internet, lalu coba hapus lagi lewat "Ubah".' });
        }
    }
}

// Cek apakah sebuah string beneran link YouTube yang ID videonya bisa
// dikenali -- dipakai buat validasi di submitBabForm() sebelum bab
// disimpan. Logikanya SENGAJA disamakan persis dengan
// konversiYoutubeEmbed() di js/materi.js (sisi peserta, buat nentuin
// video bisa di-embed lewat iframe atau tidak) supaya "valid menurut
// admin" = "beneran bisa ke-embed di peserta", bukan dua standar
// terpisah yang bisa beda hasil. Pola link yang dikenali: youtu.be/<id>,
// youtube.com/watch?v=<id>, youtube.com/shorts/<id>, dan
// youtube.com/embed/<id> (termasuk subdomain m.youtube.com & dengan
// atau tanpa "www.").
function isYoutubeUrlAdmin(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace('www.', '');
        let videoId = null;

        if (host === 'youtu.be') {
            videoId = u.pathname.slice(1);
        } else if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (u.pathname === '/watch') {
                videoId = u.searchParams.get('v');
            } else if (u.pathname.startsWith('/shorts/')) {
                videoId = u.pathname.split('/')[2];
            } else if (u.pathname.startsWith('/embed/')) {
                videoId = u.pathname.split('/')[2];
            }
        }

        return !!videoId;
    } catch (e) {
        return false;
    }
}

// =================================================================
// VIDEO BAB -- mode "Link YouTube" (video_url) ATAU "Upload File
// Video" (video_file), cuma salah satu yang aktif per bab.
// =================================================================
function ubahModeVideoBab() {
    const mode = document.querySelector('input[name="f-bab-video-mode"]:checked').value;
    document.getElementById('babVideoLinkMode').style.display = mode === 'link' ? 'block' : 'none';
    document.getElementById('babVideoUploadMode').style.display = mode === 'upload' ? 'block' : 'none';

    const babId = parseInt(document.getElementById('f-bab-form-id').value, 10);
    const bab = babListCache.find(b => b.id === babId);

    if (mode === 'link') {
        // Pindah ke mode Link -- buang file video baru yang sempat
        // dipilih (kalau ada), dan tandai file yang SUDAH terunggah
        // sebelumnya untuk dihapus begitu "Simpan" diklik (cuma salah
        // satu mode video yang boleh aktif per bab).
        babVideoPendingFile = null;
        document.getElementById('f-bab-video-file').value = '';
        babVideoPendingDelete = !!(bab && bab.video_file);
    } else {
        // Pindah ke mode Upload -- batalkan rencana penghapusan file
        // video yang sempat ditandai (kalau ada), dipakai lagi.
        babVideoPendingDelete = false;
    }

    renderBabVideoCurrent(bab);
}

function renderBabVideoCurrent(bab) {
    const el = document.getElementById('babVideoCurrent');
    if (!el) return;

    if (babVideoPendingFile) {
        el.innerHTML = `
            <i class="fa-solid fa-clock"></i>
            <span class="admin-ppt-nama">${escapeHtmlAdmin(babVideoPendingFile.name)}</span>
            <span class="admin-ppt-pending-hint">(Menunggu)</span>
            <button type="button" class="admin-ppt-hapus" onclick="batalkanFileVideoBabPending()">Batalkan</button>`;
        return;
    }
    if (babVideoPendingDelete) {
        el.innerHTML = `
            <i class="fa-solid fa-clock"></i>
            <span class="admin-ppt-nama">${escapeHtmlAdmin((bab && (bab.video_file_nama_asli || bab.video_file)) || '')}</span>
            <span class="admin-ppt-pending-hint">(Akan dihapus)</span>
            <button type="button" class="admin-ppt-hapus" onclick="batalkanHapusFileVideoBab()">Batalkan</button>`;
        return;
    }
    if (bab && bab.video_file) {
        el.innerHTML = `
            <i class="fa-solid fa-file-video"></i>
            <span class="admin-ppt-nama">${escapeHtmlAdmin(bab.video_file_nama_asli || bab.video_file)}</span>
            <button type="button" class="admin-ppt-hapus" onclick="hapusFileVideoBab()">Hapus</button>`;
    } else {
        el.innerHTML = `<span style="color:#8a8fa3; font-size:13px;">Belum ada file video diunggah.</span>`;
    }
}

function pilihFileVideoBab() {
    const fileInput = document.getElementById('f-bab-video-file');
    if (!fileInput.files.length) return;

    babVideoPendingFile = fileInput.files[0];
    babVideoPendingDelete = false;
    const babId = parseInt(document.getElementById('f-bab-form-id').value, 10);
    const bab = babListCache.find(b => b.id === babId);
    renderBabVideoCurrent(bab);
}

function batalkanFileVideoBabPending() {
    babVideoPendingFile = null;
    document.getElementById('f-bab-video-file').value = '';
    const babId = parseInt(document.getElementById('f-bab-form-id').value, 10);
    const bab = babListCache.find(b => b.id === babId);
    renderBabVideoCurrent(bab);
}

function hapusFileVideoBab() {
    babVideoPendingDelete = true;
    const babId = parseInt(document.getElementById('f-bab-form-id').value, 10);
    const bab = babListCache.find(b => b.id === babId);
    renderBabVideoCurrent(bab);
}

function batalkanHapusFileVideoBab() {
    babVideoPendingDelete = false;
    const babId = parseInt(document.getElementById('f-bab-form-id').value, 10);
    const bab = babListCache.find(b => b.id === babId);
    renderBabVideoCurrent(bab);
}

// Dipanggil dari submitBabForm() SETELAH bab-nya berhasil tersimpan --
// baru di titik ini file video yang sempat dipilih admin benar-benar
// diunggah.
//
// Dipakai XMLHttpRequest DI SINI (bukan fetch() seperti request lain di
// seluruh file ini) -- KHUSUS buat upload video, karena file-nya bisa
// besar (sampai 100MB) & makan waktu. fetch() TIDAK punya cara buat tahu
// progress upload-nya sudah sampai berapa persen (Streams API buat body
// upload belum didukung luas di semua browser) -- XMLHttpRequest,
// walau API-nya lebih lawas, punya event "progress" bawaan lewat
// xhr.upload yang justru pas buat kebutuhan ini, jadi admin bisa lihat
// persentase upload-nya berjalan (bukan cuma teks statis "Mengunggah
// video..." yang bikin was-was kayak macet kalau videonya besar/koneksi
// lambat).
//
// Persentasenya divisualkan lewat progress bar + label angka terpisah
// (#babUploadProgressWrap/#babUploadProgressBar/#babUploadProgressLabel
// di admin.html), BUKAN ditulis di teks tombol Simpan -- percobaan
// pertama nulis persentase di teks tombol ("Mengunggah video... 42%")
// bikin lebar tombolnya ikut berubah-ubah tiap event "progress" &
// meluber/terpotong di layar sempit begitu angkanya jadi 2-3 digit.
// Label & bar ini ditaruh di dalam batas lebar modal yang sudah tetap,
// jadi bisa berubah lebar/angka tanpa mengganggu lebar tombol; teks
// tombolnya sendiri tetap pendek & tidak pernah berubah ukuran.
async function unggahFileVideoBabPending(babId) {
    if (!babVideoPendingFile || !babId) return;

    const formData = new FormData();
    formData.append('bab_id', babId);
    formData.append('file', babVideoPendingFile);

    const progressWrap = document.getElementById('babUploadProgressWrap');
    const progressBar = document.getElementById('babUploadProgressBar');
    const progressLabel = document.getElementById('babUploadProgressLabel');
    const progressPercent = document.getElementById('babUploadProgressPercent');
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressLabel) progressLabel.style.display = 'block';
    if (progressPercent) progressPercent.textContent = '0%';

    try {
        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_BASE + 'admin/upload_video.php');

            // "lengthComputable" bisa false kalau server/browser tidak
            // kasih tahu ukuran total body-nya -- jarang terjadi buat
            // upload file biasa begini, tapi tetap dijaga supaya progress
            // bar-nya tidak diupdate ke angka ngawur (mis. NaN%) kalau itu
            // sampai kejadian; bar-nya cukup diam di 0% (tetap kelihatan
            // aktif lewat animasi spinner di ikon teks tombol) sebagai
            // fallback-nya.
            xhr.upload.addEventListener('progress', (e) => {
                if (!progressBar || !e.lengthComputable) return;
                const persen = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = persen + '%';
                if (progressPercent) progressPercent.textContent = persen + '%';
            });

            xhr.onload = () => {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(new Error('Respons server tidak valid'));
                }
            };
            xhr.onerror = () => reject(new Error('Gagal terhubung ke server'));
            xhr.send(formData);
        });

        if (result.status === 'success') {
            const bab = babListCache.find(b => b.id === parseInt(babId, 10));
            if (bab) {
                bab.video_file = result.data.video_file;
                bab.video_file_nama_asli = result.data.video_file_nama_asli;
                bab.video_url = null;
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Bab tersimpan, tapi video gagal diunggah', text: result.message || 'Coba unggah lagi lewat "Ubah".' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Bab tersimpan, tapi video gagal diunggah', text: 'Periksa koneksi internet, lalu coba unggah lagi lewat "Ubah".' });
    } finally {
        babVideoPendingFile = null;
        document.getElementById('f-bab-video-file').value = '';
        if (progressWrap) progressWrap.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (progressLabel) progressLabel.style.display = 'none';
    }
}

// Dipanggil dari submitBabForm() SETELAH bab-nya berhasil tersimpan --
// baru di titik ini file video yang sempat ditandai untuk dihapus
// benar-benar dihapus dari server.
async function hapusFileVideoBabPending(babId) {
    if (!babVideoPendingDelete || !babId) return;

    try {
        const res = await fetch(API_BASE + 'admin/delete_video.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bab_id: babId })
        });
        const result = await res.json();

        if (result.status === 'success') {
            const bab = babListCache.find(b => b.id === parseInt(babId, 10));
            if (bab) {
                bab.video_file = null;
                bab.video_file_nama_asli = null;
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Bab tersimpan, tapi video gagal dihapus', text: result.message || 'Coba hapus lagi lewat "Ubah".' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Bab tersimpan, tapi video gagal dihapus', text: 'Periksa koneksi internet, lalu coba hapus lagi lewat "Ubah".' });
    } finally {
        babVideoPendingDelete = false;
    }
}

// =================================================================
// TAB JENIS SOAL
// =================================================================
function switchJenisSoal(jenis) {
    currentJenis = jenis;
    soalManagePage = 0; // ganti tab (diagnostik/tryout) = daftar soal beda, mulai lagi dari halaman 1

    document.querySelectorAll('.admin-tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`.admin-tab-btn[data-jenis="${jenis}"]`).classList.add('active');

    loadDurasiTes(jenis);
    loadPetunjukTes(jenis);
    loadSoalList();
}

// =================================================================
// BATAS WAKTU PENGERJAAN (Tes Diagnostik / Final Tryout) -- tombol
// geser on/off, sama pola/komponennya dengan toggle "Batas Waktu
// Pengerjaan" di modal Kelola Soal Kuis per Bab (f-bab-kuis-pakai-waktu/
// toggleBabKuisDurasi() di bagian "KUIS PER BAB"). Bedanya di sini
// tersimpannya tetap lewat tombol "Simpan" terpisah (bukan bagian dari
// form Bab yang punya tombol Simpan sendiri), jadi menyalakan/mematikan
// tombol gesernya BELUM langsung tersimpan sebelum "Simpan" diklik.
// =================================================================
function toggleTimerDurasi() {
    const pakaiWaktu = document.getElementById('f-timer-pakai-waktu').checked;
    // Form durasi (input + "menit") TETAP ditampilkan terus, aktif atau
    // tidaknya batas waktu -- cuma dibuat abu-abu & tidak bisa diisi
    // waktu dimatikan (bukan disembunyikan lewat "display:none" seperti
    // sebelumnya). Alasannya: kalau formnya hilang-muncul, tombol
    // "Simpan" di sebelahnya ikut "loncat" posisi tiap kali togglenya
    // diklik -- disamakan supaya tombolnya diam di tempat.
    const group = document.getElementById('timerDurasiGroup');
    const input = document.getElementById('timer-durasi-input');
    group.classList.toggle('admin-timer-durasi-nonaktif', !pakaiWaktu);
    input.disabled = !pakaiWaktu;
    // Batas waktu dimatikan -> kosongkan lagi isian durasinya (bukan
    // cuma dibuat abu-abu) -- supaya kalau dinyalakan lagi, adminnya
    // memang mengisi durasi baru sendiri, bukan malah kelihatan seperti
    // durasi lama masih "aktif" padahal togglenya sempat dimatikan.
    if (!pakaiWaktu) input.value = '';
}

// Buka/tutup kartu dropdown generik di panel admin (dipakai buat "Batas
// Waktu Pengerjaan" supaya tidak selalu tampil sebagai bar polos yang
// makan tempat) -- klik headernya untuk toggle. Sengaja tanpa animasi
// tinggi (beda dari toggleQuizCollapse di sisi peserta), lihat catatan
// di CSS .admin-collapse-card.
function toggleAdminCollapse(id) {
    const card = document.getElementById(id);
    if (card) card.classList.toggle('collapsed');
}

// PENTING: elemen (checkbox/input/hint) sengaja TIDAK direset ke kosong
// dulu sebelum fetch selesai -- kalau direset duluan lalu diisi lagi
// begitu data datang, tampilannya sekilas "kedip" (flicker) dari isi tab
// sebelumnya -> kosong -> isi tab yang baru, terutama waktu pindah tab
// Tes Diagnostik <-> Final Tryout yang keduanya sama-sama cepat dimuat.
// Sama filosofinya dengan perbaikan flicker footer Kelola Materi:
// hindari state visual "salah sesaat" di tengah proses, cukup satu kali
// update begitu data final (bukan pengaturan tab lama) sudah didapat.
async function loadDurasiTes(jenis) {
    const hint = document.getElementById('timer-hint');
    const input = document.getElementById('timer-durasi-input');
    const checkbox = document.getElementById('f-timer-pakai-waktu');

    let durasiMenit = null;
    let hintText = '';

    try {
        const res = await fetch(API_BASE + 'admin/get_pengaturan_tes.php?jenis=' + jenis);
        const result = await res.json();
        if (result.status === 'success') {
            durasiMenit = result.data.durasi_menit;
            hintText = durasiMenit !== null ? `Saat ini: ${durasiMenit} menit` : 'Saat ini: tanpa batas waktu';
        } else {
            hintText = 'Gagal memuat pengaturan waktu';
        }
    } catch (err) {
        hintText = 'Gagal memuat pengaturan waktu';
    }

    // Satu-satunya titik di mana DOM diubah -- update sekali, atomik.
    input.value = durasiMenit !== null ? durasiMenit : '';
    checkbox.checked = durasiMenit !== null;
    hint.textContent = hintText;
    toggleTimerDurasi();
}

async function simpanDurasiTes() {
    const checkbox = document.getElementById('f-timer-pakai-waktu');
    const input = document.getElementById('timer-durasi-input');
    const hint = document.getElementById('timer-hint');

    let durasi = null;
    if (checkbox.checked) {
        durasi = input.value.trim() === '' ? NaN : parseInt(input.value, 10);
        if (!durasi || durasi < 1) {
            Swal.fire({ icon: 'warning', title: 'Durasi belum diisi', text: 'Isi durasi (menit) terlebih dahulu, atau matikan "Batas Waktu Pengerjaan" kalau soal ini tanpa batas waktu.' });
            return;
        }
    }

    try {
        const res = await fetch(API_BASE + 'admin/save_pengaturan_tes.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis: currentJenis, durasi_menit: durasi })
        });
        const result = await res.json();

        if (result.status === 'success') {
            hint.textContent = result.data.durasi_menit !== null
                ? `Saat ini: ${result.data.durasi_menit} menit`
                : 'Saat ini: tanpa batas waktu';
            Swal.fire({ icon: 'success', title: 'Tersimpan', text: result.message, timer: 1500, showConfirmButton: false });
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// =================================================================
// PETUNJUK PENGERJAAN (Tes Diagnostik / Final Tryout) -- opsional,
// ditampilkan ke peserta di atas daftar soal (lihat quizPetunjuk di
// js/quiz.js), sama polanya dengan "Petunjuk Pengerjaan" di modal
// Kelola Soal Kuis per Bab (f-bab-petunjuk-kuis). Disimpan lewat
// tombol "Simpan" sendiri (endpoint yang sama dengan Batas Waktu
// Pengerjaan, api/admin/save_pengaturan_tes.php, tapi field yang
// dikirim independen -- lihat catatan di file itu).
// =================================================================
async function loadPetunjukTes(jenis) {
    try {
        const res = await fetch(API_BASE + 'admin/get_pengaturan_tes.php?jenis=' + jenis);
        const result = await res.json();
        setRich('f-petunjuk-tes', result.status === 'success' ? (result.data.petunjuk_pengerjaan || '') : '');
    } catch (err) {
        setRich('f-petunjuk-tes', '');
    }
}

async function simpanPetunjukTes() {
    const petunjuk = richOrEmpty(sanitizeRichHtmlAdmin(document.getElementById('f-petunjuk-tes').value));

    try {
        const res = await fetch(API_BASE + 'admin/save_pengaturan_tes.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis: currentJenis, petunjuk_pengerjaan: petunjuk })
        });
        const result = await res.json();

        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Tersimpan', text: result.message, timer: 1500, showConfirmButton: false });
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// =================================================================
// AMBIL & RENDER DAFTAR SOAL
// =================================================================
async function loadSoalList() {
    const container = document.getElementById('soal-list-container');
    container.innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat soal...</div>`;

    const url = API_BASE + 'admin/get_soal.php?jenis=' + currentJenis;

    try {
        const res = await fetch(url);
        const result = await res.json();

        if (result.status !== 'success') {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat soal.')}</div>`;
            return;
        }

        soalListCache = result.data;

        if (soalListCache.length === 0) {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-inbox"></i>Belum ada soal. Klik "Tambah" untuk mulai menambahkan.</div>`;
            return;
        }

        renderSoalTable();
    } catch (err) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
    }
}

// Sama polanya dengan renderBabKuisSoalList()/renderBabKuisSoalPagination()
// di bagian "KUIS PER BAB" (drag & drop urut ulang + paginasi 10/halaman) --
// bedanya di sini urutan baru langsung tersimpan ke server begitu
// dilepas (drop), TIDAK menunggu tombol "Simpan" terpisah, karena halaman
// Kelola Soal ini bukan bagian dari form/modal yang punya tombol Simpan
// sendiri (beda dengan modal Kelola Soal Kuis per Bab).
function renderSoalTable() {
    const container = document.getElementById('soal-list-container');

    const totalPages = Math.ceil(soalListCache.length / SOAL_PER_PAGE);
    if (soalManagePage >= totalPages) soalManagePage = totalPages - 1;
    if (soalManagePage < 0) soalManagePage = 0;

    const start = soalManagePage * SOAL_PER_PAGE;
    const end = Math.min(start + SOAL_PER_PAGE, soalListCache.length);

    const rows = soalListCache.slice(start, end).map((soal, i) => {
        const idx = start + i;
        return `
        <tr draggable="true" data-soal-id="${soal.id}">
            <td class="admin-soal-draghandle-cell" style="width:26px;">
                <i class="fa-solid fa-grip-vertical bab-kuis-soal-draghandle" title="Geser untuk mengurutkan"></i>
            </td>
            <td class="admin-soal-nomor-cell" style="width:44px;">${idx + 1}</td>
            <td class="soal-text" title="${escapeHtmlAdmin(stripHtmlAdmin(soal.pertanyaan))}"><div class="soal-text-clamp">${sanitizeRichHtmlAdmin(soal.pertanyaan)}</div></td>
            <td class="admin-soal-poin-cell" style="width:70px; text-align:center;">${soal.poin !== null ? soal.poin : '<span style="color:#c3c8d4;">auto</span>'}</td>
            <td style="width:110px;">
                <div class="admin-row-actions">
                    <button class="admin-icon-btn" onclick="openSoalModal(${soal.id})" title="Edit">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="admin-icon-btn danger" onclick="hapusSoal(${soal.id})" title="Hapus">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="admin-table soal-table">
            <thead>
                <tr>
                    <th style="width:26px;"></th>
                    <th>No</th>
                    <th>Pertanyaan</th>
                    <th style="text-align:center;">Poin</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div id="soal-pagination" class="bab-kuis-pagination" style="display:none;"></div>`;

    renderSoalPagination();
    attachSoalDragHandlers();
}

function renderSoalPagination() {
    const el = document.getElementById('soal-pagination');
    if (!el) return;

    const totalPages = Math.ceil(soalListCache.length / SOAL_PER_PAGE);
    if (totalPages <= 1) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    el.style.display = 'flex';
    el.innerHTML = `
        <button type="button" class="admin-btn-secondary" onclick="gantiHalamanSoal(-1)" ${soalManagePage === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span>Halaman ${soalManagePage + 1}/${totalPages}</span>
        <button type="button" class="admin-btn-secondary" onclick="gantiHalamanSoal(1)" ${soalManagePage === totalPages - 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;
}

function gantiHalamanSoal(delta) {
    const totalPages = Math.ceil(soalListCache.length / SOAL_PER_PAGE);
    const next = soalManagePage + delta;
    if (next < 0 || next >= totalPages) return;
    soalManagePage = next;
    renderSoalTable();
}

// =================================================================
// DRAG & DROP untuk mengurutkan ulang soal di halaman Kelola Soal
// (Tes Diagnostik/Final Tryout) -- sama persis mekanismenya dengan
// attachBabKuisDragHandlers() (gagang di kolom pertama, drag cuma bisa
// dimulai dari situ, dibatasi ke baris yang sedang tampil di halaman
// paginasi yang sama), lihat catatan lengkap di fungsi itu.
// =================================================================
let soalDragId = null;
let soalDragArmed = false;

function attachSoalDragHandlers() {
    const rows = document.querySelectorAll('#soal-list-container tbody tr[data-soal-id]');
    rows.forEach(row => {
        row.addEventListener('mousedown', (e) => {
            soalDragArmed = !!e.target.closest('.bab-kuis-soal-draghandle');
        });
        row.addEventListener('dragstart', (e) => {
            if (!soalDragArmed) {
                e.preventDefault();
                return;
            }
            soalDragId = Number(row.dataset.soalId);
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(soalDragId)); // wajib diisi supaya drag jalan konsisten di semua browser (terutama Firefox)
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            soalDragArmed = false;
            document.querySelectorAll('#soal-list-container tbody tr.drag-over')
                .forEach(r => r.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (e) => {
            if (soalDragId === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (Number(row.dataset.soalId) !== soalDragId) row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-over');
            const targetId = Number(row.dataset.soalId);
            if (soalDragId === null || targetId === soalDragId) return;
            reorderSoal(soalDragId, targetId);
            soalDragId = null;
        });
    });
}

function reorderSoal(draggedId, targetId) {
    const fromIdx = soalListCache.findIndex(s => s.id === draggedId);
    const toIdx = soalListCache.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = soalListCache.splice(fromIdx, 1);
    soalListCache.splice(toIdx, 0, moved);
    renderSoalTable();
    simpanUrutanSoal();
}

async function simpanUrutanSoal() {
    try {
        const res = await fetch(API_BASE + 'admin/reorder_soal.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jenis: currentJenis,
                urutan: soalListCache.map(s => s.id)
            })
        });
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan urutan', text: result.message || 'Terjadi kesalahan.' });
            loadSoalList(); // urutan lokal terlanjur berubah tapi gagal tersimpan -- muat ulang dari server supaya tidak nyasar
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Gagal menyimpan urutan', text: 'Tidak bisa terhubung ke server.' });
        loadSoalList();
    }
}

// =================================================================
// PILIHAN JAWABAN DINAMIS -- dipakai oleh KETIGA jenis soal (Kuis per
// Bab, Tes Diagnostik, Final Tryout). Jumlah opsinya bebas (minimal 2),
// disimpan di tabel {jenis}_soal_pilihan (lihat FASE 9 di schema.sql).
// =================================================================

// Dulu ada dua grup (fixed A-D vs dinamis) yang saling ditukar tampil/
// sembunyi tergantung jenis soal -- sekarang ketiga jenis soal sama-sama
// pakai grup dinamis, jadi fungsi ini sengaja dipertahankan (dipanggil
// dari openSoalModal()/openBabKuisSoalModal()) tapi cuma untuk
// membersihkan sisa baris opsi dari sesi modal sebelumnya sebelum
// resetOpsiDinamis() mengisi ulang.
function setSoalPilihanMode(jenis) {
    document.getElementById('soalPilihanDinamisList').innerHTML = '';
}

function renderOpsiDinamisRow(key, teks, benar) {
    return `
        <div class="admin-option-row admin-option-row-dinamis" data-opsi-key="${key}">
            <input type="radio" name="f-opsi-benar" value="${key}" ${benar ? 'checked' : ''}>
            <input type="text" class="admin-opsi-teks" value="${escapeHtmlAdmin(teks || '')}" placeholder="Teks pilihan jawaban" required>
            <button type="button" class="admin-icon-btn danger" onclick="hapusOpsiDinamis(${key})" title="Hapus opsi">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>`;
}

function tambahOpsiDinamis(teks, benar) {
    const key = opsiDinamisSeq++;
    const container = document.getElementById('soalPilihanDinamisList');
    container.insertAdjacentHTML('beforeend', renderOpsiDinamisRow(key, teks || '', benar || false));
    const row = container.querySelector(`[data-opsi-key="${key}"]`);
    richify(row.querySelector('.admin-opsi-teks'), false);
}

function hapusOpsiDinamis(key) {
    const container = document.getElementById('soalPilihanDinamisList');
    const jumlahBaris = container.querySelectorAll('.admin-option-row-dinamis').length;
    if (jumlahBaris <= 2) {
        Swal.fire({ icon: 'warning', title: 'Minimal 2 opsi', text: 'Soal kuis wajib punya paling sedikit 2 pilihan jawaban.' });
        return;
    }
    const row = container.querySelector(`[data-opsi-key="${key}"]`);
    if (row) row.remove();
}

// pilihanArray: array [{teks, benar}] dari soal yang sedang diubah, atau
// null/kosong untuk soal baru (default 2 baris kosong).
function resetOpsiDinamis(pilihanArray) {
    opsiDinamisSeq = 0;
    const container = document.getElementById('soalPilihanDinamisList');
    container.innerHTML = '';
    if (pilihanArray && pilihanArray.length > 0) {
        pilihanArray.forEach(p => tambahOpsiDinamis(p.teks, p.benar));
    } else {
        tambahOpsiDinamis('', false);
        tambahOpsiDinamis('', false);
    }
}

// =================================================================
// MODAL TAMBAH / EDIT SOAL
// =================================================================
function openSoalModal(soalId) {
    const form = document.getElementById('soalForm');
    form.reset();
    document.getElementById('f-soal-id').value = '';
    document.getElementById('f-soal-jenis').value = currentJenis;
    document.getElementById('f-soal-babid').value = '';
    setSoalPilihanMode(currentJenis);
    setRich('f-pertanyaan', '');
    setRich('f-penjelasan', '');
    // Keterangan jenis tes di bawah judul modal, supaya jelas soal ini
    // sedang ditambah/diubah untuk Tes Diagnostik atau Final Tryout --
    // berguna terutama karena judul modalnya sendiri ("Tambah Soal"/"Ubah
    // Soal") tidak menyebutkan jenisnya.
    document.getElementById('soalModalJenisHint').textContent =
        currentJenis === 'tryout' ? 'Final Tryout' : 'Tes Diagnostik';

    if (soalId) {
        const soal = soalListCache.find(s => s.id === soalId);
        if (!soal) return;

        document.getElementById('soalModalTitle').textContent = 'Ubah Soal';
        document.getElementById('f-soal-id').value = soal.id;
        setRich('f-pertanyaan', soal.pertanyaan);
        document.getElementById('f-urutan').value = soal.urutan;
        document.getElementById('f-poin').value = soal.poin !== null && soal.poin !== undefined ? soal.poin : '';
        setRich('f-penjelasan', soal.penjelasan || '');
        resetOpsiDinamis(soal.pilihan);
    } else {
        document.getElementById('soalModalTitle').textContent = 'Tambah Soal';
        resetOpsiDinamis(null);
    }

    openAdminModal('soalModalBackdrop');
}

function closeSoalModal() {
    closeAdminModal('soalModalBackdrop');
}

async function submitSoalForm(event) {
    event.preventDefault();

    const jenis = document.getElementById('f-soal-jenis').value;
    let payload;

    // Validasi wajib-isi manual untuk field pertanyaan/pilihan -- atribut
    // "required" bawaan tidak bisa dipakai lagi karena elemen aslinya
    // sekarang disembunyikan (dipakai cuma sebagai penyimpan nilai rich
    // text), lihat catatan di richify().
    if (richTextIsEmpty(document.getElementById('f-pertanyaan').value)) {
        Swal.fire({ icon: 'warning', title: 'Pertanyaan belum diisi', text: 'Isi teks pertanyaan terlebih dahulu.' });
        return;
    }

    // Ketiga jenis soal (kuis/diagnostik/tryout) sekarang sama-sama pakai
    // pilihan jawaban dinamis (lihat FASE 9 di schema.sql) -- bedanya
    // cuma jenis "kuis" yang wajib menyertakan bab_id.
    const rows = Array.from(document.querySelectorAll('#soalPilihanDinamisList .admin-option-row-dinamis'));
    const pilihan = rows.map(row => ({
        teks: sanitizeRichHtmlAdmin(row.querySelector('.admin-opsi-teks').value).trim(),
        benar: row.querySelector('input[type="radio"]').checked
    })).filter(p => !richTextIsEmpty(p.teks));

    if (pilihan.length < 2) {
        Swal.fire({ icon: 'warning', title: 'Pilihan kurang', text: 'Minimal 2 pilihan jawaban wajib diisi.' });
        return;
    }
    if (pilihan.filter(p => p.benar).length !== 1) {
        Swal.fire({ icon: 'warning', title: 'Kunci jawaban belum tepat', text: 'Tandai TEPAT SATU pilihan sebagai jawaban benar.' });
        return;
    }

    payload = {
        jenis: jenis,
        id: document.getElementById('f-soal-id').value || null,
        pertanyaan: sanitizeRichHtmlAdmin(document.getElementById('f-pertanyaan').value).trim(),
        pilihan: pilihan,
        poin: document.getElementById('f-poin').value || null,
        penjelasan: richOrEmpty(sanitizeRichHtmlAdmin(document.getElementById('f-penjelasan').value)).trim(),
        urutan: document.getElementById('f-urutan').value || null
    };
    if (jenis === 'kuis') {
        payload.bab_id = document.getElementById('f-soal-babid').value;
    }

    const btn = document.getElementById('soalFormSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';

    try {
        const res = await fetch(API_BASE + 'admin/save_soal.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'success') {
            closeSoalModal();
            Swal.fire({ icon: 'success', title: 'Berhasil', text: result.message, timer: 1500, showConfirmButton: false });
            if (jenis === 'kuis') {
                await loadBabKuisSoal(payload.bab_id);
                updateBabKuisSummaryText();
            } else {
                loadSoalList();
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menyimpan', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Simpan Soal';
    }
}

// =================================================================
// HAPUS SOAL
// =================================================================
async function hapusSoal(soalId) {
    const konfirmasi = await Swal.fire({
        icon: 'warning',
        title: 'Hapus soal ini?',
        text: 'Soal yang dihapus tidak bisa dikembalikan.',
        showCancelButton: true,
        confirmButtonText: 'Ya, hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#d64550'
    });
    if (!konfirmasi.isConfirmed) return;

    try {
        const res = await fetch(API_BASE + 'admin/delete_soal.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis: currentJenis, id: soalId })
        });
        const result = await res.json();

        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Soal dihapus', timer: 1200, showConfirmButton: false });
            loadSoalList();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal menghapus', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// =================================================================
// HELPER
// =================================================================
function escapeHtmlAdmin(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Ambil versi teks polos (tanpa tag) dari nilai rich text -- dipakai buat
// pratinjau singkat di daftar (tabel Kelola Soal / Kelola Soal Kuis) biar
// tidak menampilkan tag HTML mentah di situ.
function stripHtmlAdmin(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
}

// =================================================================
// RICH TEXT EDITOR (Bold/Italic/Underline/Daftar)
// =================================================================
// Dipakai di field: Pertanyaan, Pilihan Jawaban (baku A-D & dinamis),
// Penjelasan Jawaban, dan Teks Materi Bab. Lihat komentar CSS
// ".rich-source-hidden" di admin.css untuk penjelasan polanya.

// Cuma izinkan tag & tanpa atribut yang benar-benar dihasilkan toolbar
// (bold/italic/underline/list) -- buang semua yang lain (termasuk
// script, event handler, style/href) sebelum data ini dikirim ke server.
// Tag tambahan (gambar/heading/link/tabel) DITARUH JUGA di dua salinan
// fungsi ini yang lain -- sanitizeRichHtmlMateri (js/materi.js) dan
// sanitizeRichHtmlQuiz (js/quiz.js) -- karena toolbar rich text yang
// sama dipakai di semua field block (Teks Materi, Pertanyaan Soal,
// Penjelasan Jawaban). Kalau daftar tag/atribut di sini diubah, ubah
// juga persis sama di kedua salinan itu.
function sanitizeRichHtmlAdmin(html) {
    if (!html) return '';
    const allowedTags = new Set([
        'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'SPAN',
        'H2', 'H3', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'COLGROUP', 'COL',
        // STRIKE (hasil execCommand("strikeThrough") di sebagian besar
        // browser) + S (tag modern setara) buat tombol "Coret", SUP/SUB
        // buat tombol superscript/subscript -- semuanya tanpa atribut sama
        // sekali (masuk cabang "else" di clean() di bawah).
        'STRIKE', 'S', 'SUP', 'SUB'
    ]);
    // Satu-satunya nilai "style" yang boleh lolos di seluruh sanitizer ini:
    // lebar kolom/gambar dalam persen (lihat resize gambar & kolom tabel di
    // sisipGambarMateri/initTableColumnResize) -- format lain (termasuk
    // satuan px, atau properti CSS apapun selain width) dibuang.
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
    // Perataan teks (rata kiri/tengah/kanan/kanan-kiri, tombol
    // justifyLeft/Center/Right/Full) -- dibaca dari el.style.textAlign yang
    // sudah diparse browser, hanya 4 nilai baku ini yang lolos.
    function extractTextAlignStyle(el) {
        const a = (el && el.style && el.style.textAlign) || '';
        return (a === 'left' || a === 'center' || a === 'right' || a === 'justify') ? ('text-align:' + a) : null;
    }
    // Ukuran teks (kontrol dropdown "Ukuran teks") -- hanya nilai px wajar
    // (8-96) yang lolos, mencegah nilai CSS liar (mis. "calc(...)" atau
    // satuan lain) ikut nyelip.
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
                // Div pembungkus scroll horizontal (".rich-table-scroll",
                // lihat pastikanTabelBisaScroll()) HANYA untuk kebutuhan
                // tampilan SELAGI diedit -- kalau ikut tersimpan, dia akan
                // dipasangi lagi (dobel) tiap kali bab ini dibuka ulang untuk
                // diedit, karena classnya sudah pasti kebuang begitu style/
                // attributenya disaring di bawah. Makanya dilepas/di-unwrap
                // total di sini setiap kali disimpan -- toh nanti otomatis
                // dipasang lagi oleh pastikanTabelBisaScroll() begitu
                // kontennya dimuat ulang.
                if (child.tagName === 'DIV' && child.classList.contains('rich-table-scroll') &&
                    child.children.length === 1 && child.children[0].tagName === 'TABLE') {
                    const table = child.children[0];
                    node.replaceChild(table, child);
                    // <table> sendiri tidak boleh punya atribut apapun (mis.
                    // "style=min-width:...px" yang dipasang sementara oleh
                    // pastikanTabelBisaScroll() cuma buat tampilan editor) --
                    // itu murni bantuan tampilan yang dihitung ulang tiap
                    // kali dirender, jadi jangan ikut tersimpan permanen.
                    Array.from(table.attributes).forEach(attr => table.removeAttribute(attr.name));
                    clean(table); // lanjut bersihkan isi tabelnya sendiri
                    return;
                }
                if (!allowedTags.has(child.tagName)) {
                    node.replaceChild(document.createTextNode(child.textContent), child);
                    return;
                }
                // Kebanyakan tag TIDAK boleh punya atribut apapun sama
                // sekali (buang semua, termasuk style/onerror/onclick dkk).
                // IMG (butuh "src", + "style" lebar % dari resize gambar),
                // A (butuh "href"), dan COL (butuh "style" lebar % dari
                // resize kolom tabel) jadi pengecualian, masing-masing
                // disaring khusus supaya tidak bisa disusupi skema
                // berbahaya seperti "javascript:" atau CSS liar.
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
                    // SPAN cuma boleh bawa "font-size" (dari kontrol ukuran
                    // teks) -- lihat terapkanUkuranFontMateri().
                    const fontSizeStyle = extractFontSizeStyle(child);
                    Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                    if (fontSizeStyle) child.setAttribute('style', fontSizeStyle);
                } else if (child.tagName === 'P' || child.tagName === 'DIV' || child.tagName === 'H2' || child.tagName === 'H3') {
                    // Elemen blok (paragraf/baris/judul) cuma boleh bawa
                    // "text-align" (dari tombol rata kiri/tengah/kanan/
                    // kanan-kiri).
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

// Cek apakah nilai rich text (HTML) kosong secara isi (bukan cuma string
// HTML-nya kosong) -- contenteditable yang "dikosongkan" admin sering
// masih menyisakan markup semacam "<div><br></div>", jadi tidak cukup
// dicek dengan .trim() === '' langsung ke string HTML-nya.
function richTextIsEmpty(html) {
    return stripHtmlAdmin(html).trim() === '';
}

// Lebar konten ".materi-teks" di sisi peserta pada layar desktop (lihat
// MATERI_TABEL_LEBAR_DESKTOP di js/materi.js -- HARUS selalu sama dengan
// nilai itu). Field ini (f-bab-konten) memang satu-satunya field materi
// yang tabelnya dirender ke sana, jadi acuan lebarnya harus identik
// supaya lebar kolom (%) yang diatur admin di sini kelihatan SAMA PERSIS
// waktu ditampilkan ke peserta.
const RICH_TABEL_LEBAR_DESKTOP = 740;

/**
 * Bungkus tiap <table> di dalam kotak edit teks materi dengan div scroll
 * horizontal SENDIRI (".rich-table-scroll"), sama seperti yang dipasang
 * otomatis di sisi peserta (lihat bungkusTabelScrollMateri/Quiz di
 * js/materi.js & js/quiz.js) -- supaya di layar sempit (HP) admin juga
 * bisa geser tabelnya kalau kolomnya tidak cukup muat, bukan malah
 * teksnya "diperas" jadi berantakan. table-layout:fixed (dipakai supaya
 * lebar kolom <col> dari initTableColumnResize() dihormati) normalnya
 * bikin tabel TIDAK PERNAH melebihi lebar kotak edit, jadi tidak akan
 * pernah perlu di-scroll -- makanya tabelnya juga diberi min-width YANG
 * SAMA DENGAN lebar kotak materi di layar lebar (bukan dihitung dari
 * jumlah kolom) supaya begitu kotaknya terlalu sempit (HP), tabel TIDAK
 * ikut mengecil dari ukuran itu dan malah memicu scroll di
 * pembungkusnya -- bukan menyusut sampai teksnya tidak kebaca.
 * Dipanggil tiap kali isi editor berubah total (bukan tiap resize kolom):
 * sisipTabelMateri (tabel baru), syncHiddenToRich (buka modal Ubah Bab
 * dengan konten lama), dan richify (nilai awal field, kalau ada).
 */
function pastikanTabelBisaScroll(container) {
    if (!container) return;
    container.querySelectorAll('table').forEach(table => {
        table.style.minWidth = RICH_TABEL_LEBAR_DESKTOP + 'px';
        if (table.parentElement && table.parentElement.classList.contains('rich-table-scroll')) return;
        const wrap = document.createElement('div');
        wrap.className = 'rich-table-scroll';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    });
}

let richToolbarEl = null;
let richToolbarTarget = null;

// Modal Tambah/Ubah Bab discroll lewat elemen sendiri (".admin-modal-
// backdrop", position:fixed + overflow-y:auto), bukan window -- toolbar
// cuma diposisikan ulang waktu field-nya baru difokus (lihat listener
// "focus" di richify()), jadi kalau user SCROLL LAGI modalnya sesudah
// itu (misalnya sambil masih fokus di kotak teks materi), toolbar bisa
// ketinggalan/tidak lagi pas di atas field-nya. "scroll" tidak bubble,
// tapi kalau didengarkan di fase CAPTURE di document, tetap kedeteksi
// scroll dari elemen manapun (termasuk modal ini) -- jadi toolbar ikut
// mengikuti terus selama field-nya masih fokus.
document.addEventListener('scroll', () => {
    if (richToolbarTarget && document.activeElement === richToolbarTarget) {
        positionRichToolbar(richToolbarTarget);
    }
}, true);

// Lebar toolbar sengaja dipaksa PAS sama dengan lebar kotak edit-nya
// (lihat "toolbar.style.width = rect.width" di positionRichToolbar) --
// tapi itu cuma dihitung ULANG waktu field-nya baru difokus/discroll.
// Kalau user melebarkan/mengecilkan jendela browser SELAGI field-nya
// masih fokus (mis. drag resize di desktop, atau putar orientasi HP),
// lebar kotak edit ikut berubah tapi lebar toolbar yang sudah kepasang
// duluan itu tidak otomatis menyesuaikan -- makanya perlu didengarkan
// juga event "resize" di window, sama seperti "scroll" di atas.
window.addEventListener('resize', () => {
    if (richToolbarTarget && document.activeElement === richToolbarTarget) {
        positionRichToolbar(richToolbarTarget);
    }
});

// Tombol tambah/hapus baris & kolom (lihat data-table-only di
// ensureRichToolbar) cuma boleh tampil kalau kursor SEDANG di dalam sel
// tabel -- ini bisa berubah kapan saja kursor dipindah TANPA field-nya
// sempat blur (klik dari luar tabel ke dalam sel tabel yang sama, atau
// sebaliknya, atau geser pakai tombol panah keyboard). "selectionchange"
// dipantau di document (bukan di tiap editor satu-satu) supaya kepantau
// juga tabel-only ini langsung ikut update begitu posisi kursor berubah.
document.addEventListener('selectionchange', () => {
    if (richToolbarTarget && document.activeElement === richToolbarTarget) {
        positionRichToolbar(richToolbarTarget);
    }
});

function ensureRichToolbar() {
    if (richToolbarEl) return richToolbarEl;
    richToolbarEl = document.createElement('div');
    richToolbarEl.className = 'rich-toolbar';
    richToolbarEl.innerHTML = `
        <button type="button" data-cmd="bold" title="Tebal (Ctrl+B)"><i class="fa-solid fa-bold"></i></button>
        <button type="button" data-cmd="italic" title="Miring (Ctrl+I)"><i class="fa-solid fa-italic"></i></button>
        <button type="button" data-cmd="underline" title="Garis bawah (Ctrl+U)"><i class="fa-solid fa-underline"></i></button>
        <button type="button" data-cmd="strikeThrough" title="Coret"><i class="fa-solid fa-strikethrough"></i></button>
        <button type="button" data-cmd="superscript" title="Pangkat atas (superscript)"><i class="fa-solid fa-superscript"></i></button>
        <button type="button" data-cmd="subscript" title="Pangkat bawah (subscript)"><i class="fa-solid fa-subscript"></i></button>
        <span class="rich-toolbar-sep" data-block-only="1"></span>
        <button type="button" data-cmd="insertUnorderedList" title="Daftar bertitik" data-block-only="1"><i class="fa-solid fa-list-ul"></i></button>
        <button type="button" data-cmd="insertOrderedList" title="Daftar bernomor" data-block-only="1"><i class="fa-solid fa-list-ol"></i></button>
        <span class="rich-toolbar-sep" data-block-only="1" data-extended-only="1"></span>
        <button type="button" class="rich-toolbar-text-btn" data-cmd="formatBlock" data-cmd-value="H2" title="Judul bagian" data-block-only="1" data-extended-only="1">H2</button>
        <button type="button" class="rich-toolbar-text-btn" data-cmd="formatBlock" data-cmd-value="H3" title="Sub judul bagian" data-block-only="1" data-extended-only="1">H3</button>
        <button type="button" data-action="link" title="Sisip link" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-link"></i></button>
        <button type="button" data-action="image" title="Sisip gambar" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-image"></i></button>
        <button type="button" data-action="table" title="Sisip tabel" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-table"></i></button>
        <span class="rich-toolbar-sep" data-block-only="1" data-extended-only="1"></span>
        <button type="button" data-cmd="justifyLeft" title="Rata kiri" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-align-left"></i></button>
        <button type="button" data-cmd="justifyCenter" title="Rata tengah" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-align-center"></i></button>
        <button type="button" data-cmd="justifyRight" title="Rata kanan" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-align-right"></i></button>
        <button type="button" data-cmd="justifyFull" title="Rata kanan-kiri" data-block-only="1" data-extended-only="1"><i class="fa-solid fa-align-justify"></i></button>
        <select class="rich-toolbar-fontsize" data-action="fontsize" title="Ukuran teks" data-block-only="1" data-extended-only="1">
            <option value="">Ukuran</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="20">20</option>
            <option value="24">24</option>
            <option value="28">28</option>
            <option value="32">32</option>
        </select>
        <span class="rich-toolbar-sep" data-block-only="1" data-extended-only="1" data-table-only="1"></span>
        <button type="button" class="rich-toolbar-text-btn" data-action="tambah-baris" title="Tambah baris di bawah" data-block-only="1" data-extended-only="1" data-table-only="1">B+</button>
        <button type="button" class="rich-toolbar-text-btn" data-action="hapus-baris" title="Hapus baris ini" data-block-only="1" data-extended-only="1" data-table-only="1">B−</button>
        <button type="button" class="rich-toolbar-text-btn" data-action="tambah-kolom" title="Tambah kolom di kanan" data-block-only="1" data-extended-only="1" data-table-only="1">K+</button>
        <button type="button" class="rich-toolbar-text-btn" data-action="hapus-kolom" title="Hapus kolom ini" data-block-only="1" data-extended-only="1" data-table-only="1">K−</button>
    `;
    // mousedown (bukan click) yang dicegah default-nya, supaya fokus &
    // seleksi teks di editor tidak hilang duluan sebelum tombol diklik.
    // Pengecualian: <select> ukuran teks butuh mousedown APA ADANYA (tidak
    // dicegah) supaya dropdown-nya bisa terbuka beneran -- makanya seleksi
    // teks yang sedang aktif di editor disimpan dulu di sini (sebelum fokus
    // sempat berpindah ke select), supaya nanti waktu ukurannya dipilih
    // (event "change" di bawah) masih tahu persis teks mana yang mau
    // diubah ukurannya.
    let selUkuranFontTersimpan = null;
    richToolbarEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('select')) {
            if (richToolbarTarget) selUkuranFontTersimpan = saveEditorSelection(richToolbarTarget);
            return;
        }
        e.preventDefault();
    });
    richToolbarEl.addEventListener('change', (e) => {
        const select = e.target.closest('select[data-action="fontsize"]');
        if (!select || !richToolbarTarget) return;
        const px = select.value;
        select.value = '';
        if (!px) return;
        terapkanUkuranFontMateri(richToolbarTarget, selUkuranFontTersimpan, px);
    });
    richToolbarEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !richToolbarTarget) return;
        const editor = richToolbarTarget;

        if (btn.dataset.cmd) {
            if (btn.dataset.cmd === 'formatBlock') {
                // Toggle: kalau baris yang lagi difokus SUDAH pakai heading
                // ini, kembalikan jadi paragraf biasa -- supaya tombolnya
                // juga berfungsi untuk "membatalkan" heading.
                const nilaiSekarang = (document.queryCommandValue('formatBlock') || '').toUpperCase();
                const target = nilaiSekarang === (btn.dataset.cmdValue || '').toUpperCase() ? 'P' : btn.dataset.cmdValue;
                document.execCommand('formatBlock', false, target);
            } else {
                document.execCommand(btn.dataset.cmd, false, null);
            }
            syncRichToHidden(editor);
            editor.focus();
            return;
        }

        // Tombol sisip link/gambar/tabel butuh dialog (SweetAlert) atau
        // file picker yang mengambil alih fokus sebentar -- posisi kursor
        // di dalam editor disimpan dulu (lihat saveEditorSelection) supaya
        // bisa dikembalikan tepat di situ begitu proses sisipnya selesai.
        if (btn.dataset.action === 'link') sisipLinkMateri(editor);
        else if (btn.dataset.action === 'image') sisipGambarMateri(editor);
        else if (btn.dataset.action === 'table') sisipTabelMateri(editor);
        else if (btn.dataset.action === 'tambah-baris') tambahBarisDariKursor(editor);
        else if (btn.dataset.action === 'hapus-baris') hapusBarisDariKursor(editor);
        else if (btn.dataset.action === 'tambah-kolom') tambahKolomDariKursor(editor);
        else if (btn.dataset.action === 'hapus-kolom') hapusKolomDariKursor(editor);
    });
    document.body.appendChild(richToolbarEl);
    return richToolbarEl;
}

// Simpan posisi kursor/seleksi SEKARANG di dalam editor tertentu, supaya
// bisa dikembalikan lagi nanti (lihat restoreEditorSelection) setelah
// fokus sempat berpindah ke dialog SweetAlert atau file picker native
// (keduanya butuh waktu/interaksi, jadi tidak instan seperti bold/italic).
function saveEditorSelection(editor) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        return sel.getRangeAt(0).cloneRange();
    }
    return null;
}

// Kebalikan dari saveEditorSelection -- fokus balik ke editor lalu pasang
// lagi Range yang tersimpan (atau taruh kursor di akhir teks kalau tidak
// ada Range tersimpan, mis. editor sebelumnya kosong sama sekali).
function restoreEditorSelection(editor, range) {
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range) {
        sel.addRange(range);
        return;
    }
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    sel.addRange(r);
}

// Terapkan ukuran teks (dalam px) ke seleksi yang tersimpan di dalam
// editor teks materi. document.execCommand tidak punya perintah "ukuran
// dalam px" langsung -- yang ada cuma "fontSize" dengan 7 tingkatan bawaan
// HTML (1-7), yang menghasilkan tag <font size="7">. Makanya dipakai
// "teknik penanda": selalu terapkan size="7" (nilai yang jarang dipakai
// wajar, gampang dikenali lagi), lalu SEGERA cari semua <font size="7">
// yang baru saja dihasilkan itu di dalam editor dan gantikan dengan
// <span style="font-size:Npx"> (ukuran beneran yang dipilih user) --
// <font> sendiri tidak ada di daftar tag yang diizinkan sanitizer
// (allowedTags di sanitizeRichHtmlAdmin), jadi kalau tidak diganti akan
// langsung kebuang begitu disimpan.
function terapkanUkuranFontMateri(editor, savedRange, px) {
    restoreEditorSelection(editor, savedRange);
    document.execCommand('fontSize', false, '7');
    editor.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement('span');
        span.style.fontSize = px + 'px';
        while (f.firstChild) span.appendChild(f.firstChild);
        f.parentNode.replaceChild(span, f);
    });
    syncRichToHidden(editor);
    editor.focus();
}

// Sisipkan satu node DOM (bukan string HTML) tepat di posisi kursor
// sekarang -- pakai node DOM langsung (bukan digabung jadi string lalu
// insertHTML) supaya nilai atribut seperti "src"/"href" tidak perlu
// di-escape manual sama sekali (risiko salah escape hilang).
function insertNodeAtCursor(editor, node) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(node);
    }
}

/**
 * Tombol "Sisip Link" di toolbar rich text -- kalau ada teks yang
 * diseleksi, teks itu dijadikan link; kalau tidak, URL-nya sendiri
 * dipakai jadi teks link yang disisipkan baru.
 */
async function sisipLinkMateri(editor) {
    const savedRange = saveEditorSelection(editor);
    const adaSeleksi = !!(savedRange && !savedRange.collapsed);

    const { value: url } = await Swal.fire({
        title: 'Sisip Link',
        input: 'url',
        inputLabel: adaSeleksi ? 'Teks yang diseleksi akan dijadikan link' : 'Alamat link (URL)',
        inputPlaceholder: 'https://...',
        showCancelButton: true,
        confirmButtonText: 'Sisipkan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0C7A6E',
        inputValidator: (value) => {
            if (!value) return 'Alamat link wajib diisi';
            if (!/^https?:\/\//i.test(value)) return 'Alamat link harus diawali http:// atau https://';
        }
    });
    if (!url) return;

    restoreEditorSelection(editor, savedRange);
    if (adaSeleksi) {
        document.execCommand('createLink', false, url);
    } else {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        insertNodeAtCursor(editor, a);
    }
    syncRichToHidden(editor);
    editor.focus();
}

/**
 * Tombol "Sisip Gambar" di toolbar rich text -- buka file picker, unggah
 * ke server lewat upload_gambar_materi.php, lalu sisipkan tag <img> di
 * posisi kursor begitu URL-nya didapat.
 */
async function sisipGambarMateri(editor) {
    const savedRange = saveEditorSelection(editor);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        Swal.fire({ title: 'Mengunggah gambar...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const res = await fetch(API_BASE + 'admin/upload_gambar_materi.php', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.status !== 'success') {
                Swal.fire({ icon: 'error', title: 'Gagal mengunggah gambar', text: result.message || 'Terjadi kesalahan.' });
                return;
            }
            const img = document.createElement('img');
            img.src = result.data.url;
            img.alt = '';
            restoreEditorSelection(editor, savedRange);
            insertNodeAtCursor(editor, img);
            syncRichToHidden(editor);
            Swal.close();
            editor.focus();
            // Kotak editor bisa jadi tinggi kalau sudah banyak isinya --
            // scroll otomatis supaya gambar yang baru disisipkan langsung
            // kelihatan, tidak perlu discroll manual dulu.
            img.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
        }
    };
    input.click();
}

/**
 * Tombol "Sisip Tabel" di toolbar rich text -- tanya jumlah baris/kolom
 * dulu, lalu sisipkan tabel kosong (baris pertama jadi header <th>) yang
 * langsung bisa diisi teksnya satu-satu oleh admin.
 */
async function sisipTabelMateri(editor) {
    const savedRange = saveEditorSelection(editor);

    const result = await Swal.fire({
        title: 'Sisip Tabel',
        // Dialog ini cuma butuh 2 kotak angka kecil -- lebar default
        // SweetAlert2 (32em) kelihatan kebesaran & aneh kalau dipaksakan
        // di layar HP, jadi dibatasi sendiri di sini.
        width: 'min(320px, 92vw)',
        html: `
            <div style="text-align:left;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Jumlah baris (termasuk baris judul)</label>
                <input id="swal-tabel-baris" type="number" min="1" max="20" value="3" class="swal2-input" style="margin:0 0 12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Jumlah kolom</label>
                <input id="swal-tabel-kolom" type="number" min="1" max="10" value="3" class="swal2-input" style="margin:0;">
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Sisipkan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0C7A6E',
        preConfirm: () => {
            const baris = parseInt(document.getElementById('swal-tabel-baris').value, 10);
            const kolom = parseInt(document.getElementById('swal-tabel-kolom').value, 10);
            if (!baris || !kolom || baris < 1 || kolom < 1) {
                Swal.showValidationMessage('Isi jumlah baris & kolom yang valid');
                return false;
            }
            return { baris: Math.min(baris, 20), kolom: Math.min(kolom, 10) };
        }
    });
    if (!result.isConfirmed || !result.value) return;

    const { baris, kolom } = result.value;
    const table = document.createElement('table');
    // <colgroup> dengan lebar kolom awal SAMA RATA (100/kolom% masing-
    // masing) -- lebarnya nanti bisa digeser satu-satu lewat drag di tepi
    // kanan sel judul (TH), lihat initTableColumnResize().
    const colgroup = document.createElement('colgroup');
    const pctAwal = (100 / kolom).toFixed(4);
    for (let c = 0; c < kolom; c++) {
        const col = document.createElement('col');
        col.style.width = pctAwal + '%';
        colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < baris; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < kolom; c++) {
            const cell = document.createElement(r === 0 ? 'th' : 'td');
            cell.innerHTML = '<br>'; // sel awalnya kosong tapi tetap punya tinggi baris, gampang diklik
            tr.appendChild(cell);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    restoreEditorSelection(editor, savedRange);
    insertNodeAtCursor(editor, table);
    // Paragraf kosong sesudah tabel supaya kursor tidak "terjebak" terus
    // di dalam sel tabel begitu selesai disisipkan.
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    editor.appendChild(p);
    // Bungkus tabel baru dengan wrapper scroll (kalau di layar sempit/HP
    // supaya tabel lebar tidak merusak layout kotak edit) sebelum disimpan
    // ke hidden textarea.
    pastikanTabelBisaScroll(editor);
    syncRichToHidden(editor);
    editor.focus();
    // Sama seperti sisip gambar -- pastikan tabel yang baru disisipkan
    // langsung kelihatan tanpa perlu discroll manual dulu.
    table.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// =================================================================
// TAMBAH/HAPUS BARIS & KOLOM di tabel yang SUDAH ADA di kotak teks
// materi -- lewat 4 tombol toolbar "B+"/"B−"/"K+"/"K−" (tambah/hapus
// baris/kolom), yang cuma tampil kalau kursor sedang di dalam sel tabel
// (lihat data-table-only di ensureRichToolbar & positionRichToolbar).
// Jadi tidak perlu hapus tabel lama & bikin ulang dari nol cuma buat
// menambah/mengurangi baris/kolomnya.
// =================================================================

// Cari elemen <td>/<th> tempat kursor SEKARANG berada (kalau ada) di
// dalam editor tertentu -- dipakai 4 fungsi "...DariKursor" di bawah
// supaya tahu baris/kolom MANA yang dimaksud, dan juga dipakai
// positionRichToolbar() buat tahu kapan tombol B+/B−/K+/K− perlu tampil.
function cariSelDalamTabel(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    if (node.nodeType !== 1) node = node.parentElement;
    return node ? node.closest('td, th') : null;
}

// Tambah satu baris baru TEPAT SETELAH baris ber-index "indexSetelah" di
// dalam <tbody> tabel ini (indexSetelah -1 berarti disisipkan paling
// atas/sebelum baris pertama) -- jumlah sel disamakan dengan baris
// lain yang sudah ada supaya tabelnya tetap rapi.
function tambahBarisPadaIndex(editor, table, indexSetelah) {
    const tbody = table.querySelector('tbody') || table;
    const baris = Array.from(tbody.children);
    const jumlahKolom = baris[0] ? baris[0].children.length : 1;
    const trBaru = document.createElement('tr');
    for (let i = 0; i < jumlahKolom; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        trBaru.appendChild(td);
    }
    if (indexSetelah < 0) tbody.insertBefore(trBaru, tbody.firstChild);
    else tbody.insertBefore(trBaru, baris[indexSetelah] ? baris[indexSetelah].nextSibling : null);
    syncRichToHidden(editor);
}

// Hapus baris ber-index "index" di dalam <tbody> tabel ini. Kalau itu
// satu-satunya baris yang tersisa di tabel (tabel tanpa baris sama
// sekali tidak masuk akal dilihat), sekalian hapus seluruh tabelnya
// (plus pembungkus scroll-nya kalau ada, lihat pastikanTabelBisaScroll).
function hapusBarisPadaIndex(editor, table, index) {
    const tbody = table.querySelector('tbody') || table;
    const baris = Array.from(tbody.children);
    if (baris.length <= 1) {
        (table.closest('.rich-table-scroll') || table).remove();
    } else if (baris[index]) {
        baris[index].remove();
    }
    syncRichToHidden(editor);
}

// Tambah satu kolom baru TEPAT SETELAH kolom ber-index "indexSetelah"
// (-1 berarti di paling kiri) -- ditambahkan ke SEMUA baris tabel
// (memakai tag TH/TD yang sama seperti kolom lain di baris itu, supaya
// baris judul tetap dapat sel TH), dan <colgroup>-nya (kalau ada)
// disesuaikan juga: satu <col> baru ditambah, lalu semua lebar kolom
// dibagi ulang sama rata (lebih sederhana & konsisten daripada coba
// "mempertahankan" proporsi lebar lama yang sudah tidak relevan lagi
// begitu jumlah kolomnya berubah).
function tambahKolomPadaIndex(editor, table, indexSetelah) {
    const tbody = table.querySelector('tbody') || table;
    Array.from(tbody.children).forEach(row => {
        const cells = Array.from(row.children);
        const tagName = (cells[0] ? cells[0].tagName : 'TD').toLowerCase();
        const baru = document.createElement(tagName);
        baru.innerHTML = '<br>';
        if (indexSetelah < 0) row.insertBefore(baru, row.firstChild);
        else row.insertBefore(baru, cells[indexSetelah] ? cells[indexSetelah].nextSibling : null);
    });
    const colgroup = table.querySelector(':scope > colgroup');
    if (colgroup) {
        const cols = Array.from(colgroup.children);
        const colBaru = document.createElement('col');
        if (indexSetelah < 0) colgroup.insertBefore(colBaru, colgroup.firstChild);
        else colgroup.insertBefore(colBaru, cols[indexSetelah] ? cols[indexSetelah].nextSibling : null);
        const jumlahKolomBaru = colgroup.children.length;
        const pct = (100 / jumlahKolomBaru).toFixed(4);
        Array.from(colgroup.children).forEach(col => { col.style.width = pct + '%'; });
    }
    syncRichToHidden(editor);
}

// Hapus kolom ber-index "index" -- dihapus dari SEMUA baris tabel
// sekaligus. Kalau itu satu-satunya kolom yang tersisa, sekalian hapus
// seluruh tabelnya (sama seperti hapusBarisPadaIndex).
function hapusKolomPadaIndex(editor, table, index) {
    const tbody = table.querySelector('tbody') || table;
    const barisPertama = tbody.children[0];
    if (!barisPertama || barisPertama.children.length <= 1) {
        (table.closest('.rich-table-scroll') || table).remove();
        syncRichToHidden(editor);
        return;
    }
    Array.from(tbody.children).forEach(row => {
        if (row.children[index]) row.children[index].remove();
    });
    const colgroup = table.querySelector(':scope > colgroup');
    if (colgroup && colgroup.children[index]) {
        colgroup.children[index].remove();
        const jumlahKolomBaru = colgroup.children.length;
        if (jumlahKolomBaru > 0) {
            const pct = (100 / jumlahKolomBaru).toFixed(4);
            Array.from(colgroup.children).forEach(col => { col.style.width = pct + '%'; });
        }
    }
    syncRichToHidden(editor);
}

// 4 fungsi di atas (tambah/hapusBarisPadaIndex, tambah/hapusKolomPadaIndex)
// butuh index baris/kolom secara eksplisit -- pembungkus di bawah ini
// yang menerjemahkan "posisi kursor SEKARANG" jadi index tersebut,
// dipakai langsung oleh tombol toolbar "B+"/"B−"/"K+"/"K−".
function tambahBarisDariKursor(editor) {
    const cell = cariSelDalamTabel(editor);
    if (!cell) return;
    const tr = cell.closest('tr');
    const table = cell.closest('table');
    if (!tr || !table) return;
    const tbody = table.querySelector('tbody') || table;
    const index = Array.from(tbody.children).indexOf(tr);
    tambahBarisPadaIndex(editor, table, index);
    editor.focus();
}

function hapusBarisDariKursor(editor) {
    const cell = cariSelDalamTabel(editor);
    if (!cell) return;
    const tr = cell.closest('tr');
    const table = cell.closest('table');
    if (!tr || !table) return;
    const tbody = table.querySelector('tbody') || table;
    const index = Array.from(tbody.children).indexOf(tr);
    hapusBarisPadaIndex(editor, table, index);
    editor.focus();
}

function tambahKolomDariKursor(editor) {
    const cell = cariSelDalamTabel(editor);
    if (!cell) return;
    const table = cell.closest('table');
    const tr = cell.closest('tr');
    if (!table || !tr) return;
    const index = Array.from(tr.children).indexOf(cell);
    tambahKolomPadaIndex(editor, table, index);
    editor.focus();
}

function hapusKolomDariKursor(editor) {
    const cell = cariSelDalamTabel(editor);
    if (!cell) return;
    const table = cell.closest('table');
    const tr = cell.closest('tr');
    if (!table || !tr) return;
    const index = Array.from(tr.children).indexOf(cell);
    hapusKolomPadaIndex(editor, table, index);
    editor.focus();
}

// =================================================================
// RESIZE GAMBAR & KOLOM TABEL di dalam kotak edit teks materi
// -----------------------------------------------------------------
// Keduanya dibuat lewat drag TANPA elemen handle terpisah (supaya tidak
// perlu tag tambahan yang harus diloloskan sanitizer) -- cukup deteksi
// posisi kursor mouse relatif ke tepi gambar/sel lewat getBoundingClientRect
// di listener "mousedown" level dokumen. Lebar akhir SELALU disimpan dalam
// PERSEN (bukan px) supaya proporsinya konsisten dipakai ulang di halaman
// peserta (materi.html/kuis.html) walau lebar kartu materi di sana beda
// dengan lebar kotak edit di sini -- lihat sanitizeRichHtmlAdmin/Materi/
// Quiz yang meloloskan "style" HANYA untuk pola "width: N%" ini.
// =================================================================

/**
 * Resize gambar -- drag pojok kanan-bawah gambar di dalam kotak edit
 * materi. Lebar baru dihitung relatif terhadap lebar kotak edit
 * (editor.clientWidth), dibatasi 15%-100%, tinggi mengikuti otomatis
 * (height tidak diisi eksplisit) supaya rasio gambar tidak berubah.
 */
(function initImageResize() {
    const ZONA_POJOK = 14; // radius (px) area pojok kanan-bawah yang dianggap "pegangan" drag
    let drag = null;

    function dekatPojokKananBawah(img, x, y) {
        const r = img.getBoundingClientRect();
        return (r.right - x) <= ZONA_POJOK && (r.right - x) >= -4 &&
            (r.bottom - y) <= ZONA_POJOK && (r.bottom - y) >= -4;
    }

    document.addEventListener('mousedown', (e) => {
        const img = e.target.closest('.rich-editable img');
        if (!img || !dekatPojokKananBawah(img, e.clientX, e.clientY)) return;
        const editor = img.closest('.rich-editable');
        if (!editor) return;
        e.preventDefault();
        drag = {
            img, editor,
            startX: e.clientX,
            startWidthPx: img.getBoundingClientRect().width,
            editorWidth: editor.clientWidth
        };
        document.body.style.cursor = 'nwse-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (drag) {
            const deltaPx = e.clientX - drag.startX;
            const minPx = Math.max(60, drag.editorWidth * 0.15);
            let widthPx = Math.min(Math.max(drag.startWidthPx + deltaPx, minPx), drag.editorWidth);
            const pct = Math.max(1, Math.min(100, Math.round((widthPx / drag.editorWidth) * 100)));
            // cssText (bukan .style.width/.style.height satu-satu) supaya
            // "style" gambar SELALU cuma berisi width+height -- kalau
            // ditambah lewat .style.width= saja, properti lain yang
            // ketinggalan (mis. cursor, lihat catatan di bawah) bisa ikut
            // kebawa sampai ke sanitizeRichHtmlAdmin waktu disimpan, dan
            // gagal lolos filternya (yang cuma menerima persis "width:N%"),
            // membuat hasil resize-nya hilang lagi begitu disimpan.
            drag.img.style.cssText = 'width:' + pct + '%; height:auto;';
            return;
        }
        // Bukan lagi drag -- cuma kasih kursor "bisa di-resize" waktu mouse
        // lewat pojok kanan-bawah gambar. Sengaja pakai CLASS (bukan
        // langsung .style.cursor = ...) supaya atribut "style" gambar tidak
        // ikut kotor dengan "cursor: ..." -- lihat catatan cssText di atas.
        const hoverImg = e.target.closest('.rich-editable img');
        if (hoverImg) {
            hoverImg.classList.toggle('rich-img-resize-hover', dekatPojokKananBawah(hoverImg, e.clientX, e.clientY));
        }
    });

    document.addEventListener('mouseup', () => {
        if (!drag) return;
        syncRichToHidden(drag.editor);
        drag = null;
        document.body.style.cursor = '';
    });
})();

/**
 * Resize lebar kolom tabel -- drag tepi kanan sel judul (TH). Tabel yang
 * belum punya <colgroup> (mis. tabel lama sebelum fitur ini ada) dibuatkan
 * dulu secara otomatis (lebar sama rata) begitu admin mencoba nge-drag.
 * Menggeser satu batas kolom memindahkan lebar dari kolom kiri ke kanan
 * (atau sebaliknya) supaya total lebar tabel tetap 100%.
 */
(function initTableColumnResize() {
    const ZONA_TEPI = 8; // radius (px) area tepi kanan sel yang dianggap "pegangan" drag
    const MIN_PERSEN = 8; // batas minimal lebar 1 kolom, supaya tidak sampai hilang/gepeng
    let drag = null;

    function ambilColgroup(table, jumlahKolom) {
        let colgroup = table.querySelector(':scope > colgroup');
        if (!colgroup && jumlahKolom > 0) {
            colgroup = document.createElement('colgroup');
            const pct = (100 / jumlahKolom).toFixed(4);
            for (let i = 0; i < jumlahKolom; i++) {
                const col = document.createElement('col');
                col.style.width = pct + '%';
                colgroup.appendChild(col);
            }
            table.insertBefore(colgroup, table.firstChild);
        }
        return colgroup;
    }

    function cariBatasKananSel(e) {
        const th = e.target.closest('.rich-editable table th');
        if (!th) return null;
        const row = th.parentElement;
        const cellIndex = Array.prototype.indexOf.call(row.children, th);
        if (cellIndex >= row.children.length - 1) return null; // kolom terakhir tidak punya tepi kanan yang bisa digeser
        const rect = th.getBoundingClientRect();
        if ((rect.right - e.clientX) > ZONA_TEPI) return null;
        return { th, row, cellIndex };
    }

    document.addEventListener('mousedown', (e) => {
        const target = cariBatasKananSel(e);
        if (!target) return;
        const table = target.th.closest('table');
        const jumlahKolom = target.row.children.length;
        const colgroup = ambilColgroup(table, jumlahKolom);
        if (!colgroup) return;
        e.preventDefault();
        const cols = colgroup.querySelectorAll('col');
        const colKiri = cols[target.cellIndex];
        const colKanan = cols[target.cellIndex + 1];
        if (!colKiri || !colKanan) return;
        const tableWidth = table.getBoundingClientRect().width;
        drag = {
            colKiri, colKanan,
            startX: e.clientX,
            tableWidth,
            pctKiriAwal: parseFloat(colKiri.style.width) || (100 / jumlahKolom),
            pctKananAwal: parseFloat(colKanan.style.width) || (100 / jumlahKolom),
            editor: table.closest('.rich-editable')
        };
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (drag) {
            const deltaPct = ((e.clientX - drag.startX) / drag.tableWidth) * 100;
            let pctKiri = drag.pctKiriAwal + deltaPct;
            let pctKanan = drag.pctKananAwal - deltaPct;
            if (pctKiri < MIN_PERSEN) { pctKanan -= (MIN_PERSEN - pctKiri); pctKiri = MIN_PERSEN; }
            if (pctKanan < MIN_PERSEN) { pctKiri -= (MIN_PERSEN - pctKanan); pctKanan = MIN_PERSEN; }
            drag.colKiri.style.width = pctKiri.toFixed(2) + '%';
            drag.colKanan.style.width = pctKanan.toFixed(2) + '%';
            return;
        }
        // Bukan lagi drag -- cuma kasih kursor "bisa di-resize" waktu
        // mouse lewat tepi kanan sel judul tabel.
        const th = e.target.closest('.rich-editable table th');
        if (th) th.style.cursor = cariBatasKananSel(e) ? 'col-resize' : '';
    });

    document.addEventListener('mouseup', () => {
        if (!drag) return;
        if (drag.editor) syncRichToHidden(drag.editor);
        drag = null;
        document.body.style.cursor = '';
    });
})();

function positionRichToolbar(editorEl) {
    const toolbar = ensureRichToolbar();
    const isBlock = editorEl.dataset.richBlock === '1';
    // Tombol Judul/Link/Gambar/Tabel ("extended") sengaja dibatasi HANYA
    // muncul di kolom teks materi (lihat richify(..., extended) &
    // initRichFields) -- kolom pertanyaan/pilihan/penjelasan soal cukup
    // bold/italic/underline/daftar seperti semula.
    const isExtended = editorEl.dataset.richExtended === '1';
    // Tombol tambah/hapus baris & kolom ("table-only") cuma masuk akal
    // kalau kursor SEDANG di dalam sel tabel -- disembunyikan begitu
    // kursor ada di teks biasa di luar tabel, supaya tidak membingungkan
    // ("hapus baris" yang mana kalau memang tidak lagi di dalam tabel?).
    const selDiDalamTabel = isExtended && !!cariSelDalamTabel(editorEl);
    toolbar.querySelectorAll('[data-block-only]').forEach(el => {
        let show = isBlock && (!el.hasAttribute('data-extended-only') || isExtended);
        if (show && el.hasAttribute('data-table-only')) show = selDiDalamTabel;
        el.style.display = show ? '' : 'none';
    });
    const rect = editorEl.getBoundingClientRect();
    toolbar.style.display = 'flex';
    // Modal Tambah/Ubah Bab (".admin-modal-backdrop") itu sendiri yang
    // discroll (position:fixed + overflow-y:auto), BUKAN window/dokumen --
    // jadi kalau kotak teks materinya tinggi (banyak isi) dan modalnya
    // discroll sampai bagian TENGAH/BAWAH kotak itu yang kelihatan, bagian
    // ATAS kotaknya sudah lewat di luar layar (rect.top jadi kecil/negatif).
    // Kalau toolbar tetap dipaksa nempel "di atas kotak" (rect.top -
    // tinggi toolbar), dia ikut kebawa ke luar layar juga -- makanya
    // posisinya dibatasi supaya tidak pernah lebih tinggi dari beberapa
    // pixel dari batas atas layar yang SEDANG kelihatan, biar toolbar
    // selalu kelihatan walau lagi di tengah-tengah kotak yang tinggi.
    let top = window.scrollY + rect.top - toolbar.offsetHeight - 6;
    const batasAtasTerlihat = window.scrollY + 8;
    if (top < batasAtasTerlihat) top = batasAtasTerlihat;
    toolbar.style.top = top + 'px';
    // Posisi & LEBAR samping: cuma kotak Teks Materi ("extended") yang
    // tombolnya banyak (rata teks, ukuran teks, Judul/Link/Gambar/Tabel,
    // dst.) sampai bisa lebih lebar dari field-nya sendiri di layar
    // sempit -- makanya KHUSUS untuk field itu, toolbar dipaksa selebar
    // kotak edit-nya sendiri (tepi kiri & kanannya jadi PAS sama dengan
    // tepi kiri & kanan field, di layar seberapa pun lebarnya; kalau
    // tombolnya tidak muat satu baris, lanjut ke baris berikutnya --
    // lihat flex-wrap di CSS .rich-toolbar). Field lain (pertanyaan/
    // pilihan/penjelasan soal) tombolnya jauh lebih sedikit dan selalu
    // muat, jadi dibiarkan seperti semula: toolbar cuma serata kiri ke
    // field, lebarnya menyesuaikan isi tombolnya sendiri (tidak perlu
    // dipaksa selebar field).
    if (isExtended) {
        toolbar.style.width = rect.width + 'px';
    } else {
        toolbar.style.width = '';
    }
    toolbar.style.left = (window.scrollX + rect.left) + 'px';
}

function hideRichToolbar() {
    if (richToolbarEl) richToolbarEl.style.display = 'none';
    richToolbarTarget = null;
}

// Sinkronisasi editor<->field tersembunyi PAKAI REFERENSI ELEMEN LANGSUNG
// (properti custom "_richHidden"/"_richEditor"), bukan lewat id -- baris
// opsi jawaban dinamis (Kuis per Bab) dibuat lewat template string dan
// TIDAK punya atribut "id" sama sekali, jadi pola berbasis id akan gagal
// diam-diam khusus untuk field itu.
function syncRichToHidden(editorEl) {
    const hidden = editorEl._richHidden;
    if (hidden) hidden.value = editorEl.innerHTML.trim();
}

function syncHiddenToRich(hiddenEl) {
    const editor = hiddenEl && hiddenEl._richEditor;
    if (editor) {
        editor.innerHTML = hiddenEl.value || '';
        // Bungkus ulang tabel (kalau ada) dengan wrapper scroll setiap
        // kali konten lama dimuat ulang ke kotak edit (mis. saat buka
        // modal edit bab yang sudah ada tabelnya).
        pastikanTabelBisaScroll(editor);
    }
}

// Set nilai field rich text sekaligus (field tersembunyi + tampilan
// editornya) -- dipakai gantinya "elemen.value = ..." langsung supaya
// dua-duanya selalu sinkron.
function setRich(id, html) {
    const hidden = document.getElementById(id);
    if (!hidden) return;
    hidden.value = html || '';
    syncHiddenToRich(hidden);
}

// Ubah <textarea>/<input> asli jadi editor rich text. block=true untuk
// field multi-baris (boleh Enter + tombol daftar), block=false untuk
// field 1 baris seperti pilihan jawaban (Enter dicegah supaya tinggi
// field tetap konsisten).
function richify(hiddenEl, block, extended) {
    if (!hiddenEl || hiddenEl.dataset.richified) return;
    hiddenEl.dataset.richified = '1';
    hiddenEl.classList.add('rich-source-hidden');
    // "required" di elemen yang disembunyikan bikin submit form gagal
    // ("An invalid form control is not focusable") -- validasi wajib-isi
    // buat field ini sekarang dicek manual lewat richTextIsEmpty().
    hiddenEl.removeAttribute('required');

    const editor = document.createElement('div');
    editor.className = 'rich-editable' + (block ? '' : ' rich-editable-inline');
    editor.contentEditable = 'true';
    editor.dataset.richBlock = block ? '1' : '0';
    // "extended" (Judul/Link/Gambar/Tabel) sengaja dibatasi hanya untuk
    // kolom teks materi -- lihat catatan di positionRichToolbar().
    editor.dataset.richExtended = extended ? '1' : '0';
    editor.innerHTML = hiddenEl.value || '';
    if (block) pastikanTabelBisaScroll(editor);
    if (hiddenEl.placeholder) editor.dataset.placeholder = hiddenEl.placeholder;

    // Referensi dua arah langsung ke elemen (lihat catatan di
    // syncRichToHidden/syncHiddenToRich di atas).
    editor._richHidden = hiddenEl;
    hiddenEl._richEditor = editor;

    hiddenEl.insertAdjacentElement('afterend', editor);

    editor.addEventListener('focus', () => {
        richToolbarTarget = editor;
        positionRichToolbar(editor);
    });
    editor.addEventListener('blur', () => {
        // delay dikit supaya klik tombol toolbar sempat kepencet dulu
        // sebelum toolbar-nya disembunyikan. Selain cek richToolbarTarget,
        // WAJIB juga cek document.activeElement -- kalau tidak, ada race
        // condition: begitu editor sempat blur lalu SEGERA fokus lagi
        // (mis. gara-gara klik cepat berturut-turut di editor yang sama,
        // atau interaksi lain yang memicu blur+focus singkat), event
        // 'focus' sudah menyalakan toolbar lagi duluan, tapi timeout blur
        // yang tertunda ini tetap jalan 150ms kemudian dan ikut menyembunyikan
        // toolbar itu lagi -- padahal editornya masih (atau sudah kembali)
        // fokus. Ini penyebab laporan "toolbar bold/italic dll suka hilang
        // sendiri padahal masih ngedit teks".
        setTimeout(() => {
            // Kontrol ukuran teks di toolbar adalah <select> asli (bukan
            // <button>), yang MEMANG butuh fokus browser beneran supaya
            // dropdown-nya bisa dibuka -- beda dari tombol lain yang selalu
            // mencegah fokus pindah lewat mousedown (lihat listener
            // "mousedown" di ensureRichToolbar()). Jadi begitu select itu
            // diklik, editor ini otomatis blur duluan. Supaya toolbar tidak
            // ikut disembunyikan padahal user masih pilih ukuran teks di
            // situ, cek juga: kalau fokus sekarang ada DI DALAM toolbar itu
            // sendiri, jangan sembunyikan.
            const fokusMasihDiToolbar = richToolbarEl && richToolbarEl.contains(document.activeElement);
            if (richToolbarTarget === editor && document.activeElement !== editor && !fokusMasihDiToolbar) hideRichToolbar();
        }, 150);
    });
    editor.addEventListener('input', () => syncRichToHidden(editor));
    editor.addEventListener('keydown', (e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            document.execCommand('bold');
            syncRichToHidden(editor);
        } else if (ctrl && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            document.execCommand('italic');
            syncRichToHidden(editor);
        } else if (ctrl && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            document.execCommand('underline');
            syncRichToHidden(editor);
        } else if (!block && e.key === 'Enter') {
            e.preventDefault();
        }
    });
    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, bersihkanTeksTempel(text, block));
    });
}

/**
 * Rapikan teks yang ditempel (paste) dari Word/PDF sebelum dimasukkan ke
 * kotak edit. Sudah diambil versi POLOS-nya saja (text/plain, lihat
 * listener "paste" di atas) supaya style/HTML asli Word tidak ikut
 * kebawa -- tapi teks polosnya sendiri masih sering "berantakan" karena:
 * 1. Word/PDF sering pakai macam-macam karakter spasi Unicode (spasi
 *    tidak putus/non-breaking space, spasi lebar tetap dari tabel/kolom,
 *    dst) yang TIDAK dirapatkan otomatis oleh browser seperti spasi
 *    biasa berturut-turut -- makanya kelihatan ada jarak/spasi aneh yang
 *    tidak wajar padahal sumbernya rapi.
 * 2. PDF terutama sering menyisipkan spasi GANDA/lebih di tengah kalimat
 *    buat rata kiri-kanan kolom di halaman aslinya, dan baris kosong
 *    berlebih di antar paragraf.
 * Diselaraskan di sini: semua jenis spasi disamakan jadi spasi biasa,
 * karakter tak-kelihatan dibuang, spasi & baris kosong berturun dirapatkan.
 */
function bersihkanTeksTempel(text, block) {
    if (!text) return '';
    let hasil = text
        // Berbagai spasi Unicode (non-breaking, spasi lebar tetap dari
        // tabel/kolom Word/PDF, dst) disamakan jadi spasi ASCII biasa.
        .replace(/[   -   　]/g, ' ')
        // Karakter tak-kelihatan (zero-width space/joiner, BOM) yang
        // kadang ikut kebawa dari PDF -- dibuang total, bukan diganti spasi.
        .replace(/[​‌‍﻿]/g, '')
        // Tab (biasa dari indentasi Word) disamakan jadi spasi biasa.
        .replace(/\t/g, ' ')
        // Baris baru gaya Windows (\r\n) disamakan ke \n biasa dulu.
        .replace(/\r\n?/g, '\n');

    // Rapatkan spasi BERUNTUN dalam satu baris (bukan baris barunya) jadi
    // satu spasi, dan buang spasi nyempil di awal/akhir tiap baris.
    hasil = hasil.split('\n').map(baris => baris.trim().replace(/ {2,}/g, ' ')).join('\n');

    if (!block) {
        // Field satu baris (tanpa Enter, mis. pilihan jawaban) -- gabung
        // semua jadi satu baris, sama seperti perilaku sebelumnya.
        return hasil.replace(/\n+/g, ' ').trim();
    }

    // PDF menyimpan teks PER-BARIS TAMPILAN HALAMAN ASLINYA -- jadi satu
    // kalimat/paragraf yang di PDF cuma "kepanjangan" & melipir ke baris
    // berikutnya (bukan baris/paragraf baru beneran) ikut kebawa sebagai
    // baris terpisah waktu di-copy (mis. "...pandangan seragam" lalu
    // "(Wilson, 2019)." jadi baris sendiri, padahal itu sambungan kalimat
    // yang sama). Disambung lagi di sini SEBELUM baris kosong berlebih
    // dirapatkan di bawah.
    hasil = sambungBarisTerputusPdf(hasil);

    // Field multi-baris -- baris kosong beruntun (2+ baris kosong sekaligus,
    // sering muncul dari PDF) dirapatkan jadi maksimal SATU baris kosong,
    // supaya jarak antar paragraf tidak ikut melebar berantakan.
    return hasil.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Sambung baris-baris yang "keputus di tengah kalimat" akibat cara PDF
 * menyimpan teks (per baris tampilan halaman, bukan per paragraf
 * beneran). Baris SEBELUMNYA disambung ke baris berikutnya (dipisah satu
 * spasi) KECUALI baris sebelumnya itu:
 * - memang kosong (batas paragraf -- sengaja, jangan disentuh), ATAU
 * - sudah diakhiri tanda baca akhir kalimat (. ! ? : dst, termasuk kalau
 *   diikuti tanda kutip/kurung penutup) -- berarti kalimatnya memang
 *   sudah selesai di situ, ATAU
 * - kelihatan seperti judul/sub-judul bernomor (mis. "5.1 ...") atau
 *   poin daftar ("- ...", "• ...") -- baris seperti ini sengaja berdiri
 *   sendiri, jangan ikut ditarik ke baris berikutnya;
 * baris BERIKUTNYA yang kelihatan seperti judul/poin baru juga tidak
 * ditarik naik ke baris sebelumnya, dengan alasan yang sama.
 */
function sambungBarisTerputusPdf(teks) {
    const barisMentah = teks.split('\n');
    const akhirKalimat = /[.!?:;"'”’)\]]$/;
    const judulAtauPoin = /^(\d+([.)]|(\.\d+)+\.?)\s|[-•*]\s)/;
    // Baris "judul/poin" (mis. "A. ...", "1. ...") SENGAJA tidak disambung
    // ke baris sesudahnya -- supaya judul singkat atau item baru daftar
    // tidak ketelan ke paragraf berikutnya. TAPI kalau baris "judul/poin"
    // itu sendiri sudah panjang (mendekati/melewati lebar baris wajar di
    // PDF) dan belum diakhiri tanda baca, kemungkinan besar itu BUKAN judul
    // pendek yang disengaja, melainkan pilihan jawaban/kalimat panjang yang
    // kepotong di tengah oleh lebar halaman PDF -- kasus ini sering muncul
    // di soal pilihan ganda ("A. kalimat panjang..." lanjut ke baris
    // berikutnya). Baris pendek (di bawah ambang batas ini) tetap
    // diperlakukan sebagai judul/poin yang sengaja berdiri sendiri.
    const AMBANG_JUDUL_TERPOTONG = 70;

    // Tahap 1: buang baris kosong yang "palsu". Sebagian PDF/situs malah
    // menyisipkan baris kosong DI ANTARA baris-baris yang sebenarnya masih
    // satu kalimat yang sama (bukan cuma kepotong tanpa baris kosong sama
    // sekali seperti yang ditangani tahap 2 di bawah) -- ciri baris kosong
    // yang palsu seperti ini: baris SEBELUM baris kosong itu belum diakhiri
    // tanda baca kalimat (berarti kalimatnya memang belum selesai) dan
    // bukan judul/poin pendek yang sengaja berdiri sendiri. Baris kosong
    // asli (pemisah paragraf yang wajar, muncul setelah kalimat yang sudah
    // selesai atau setelah judul pendek) tetap dipertahankan apa adanya.
    const baris = [];
    for (let i = 0; i < barisMentah.length; i++) {
        const b = barisMentah[i];
        if (b === '') {
            const sebelumnya = baris.length ? baris[baris.length - 1] : null;
            const sebelumnyaJudulPendek = sebelumnya !== null &&
                judulAtauPoin.test(sebelumnya) && sebelumnya.length < AMBANG_JUDUL_TERPOTONG;
            const barisKosongPalsu = sebelumnya !== null && sebelumnya !== '' &&
                !akhirKalimat.test(sebelumnya) && !sebelumnyaJudulPendek;
            if (barisKosongPalsu) continue; // dibuang, tidak ikut disimpan
        }
        baris.push(b);
    }

    // Tahap 2: sambung baris yang kepotong tanpa baris kosong di antaranya.
    const hasil = [];
    for (let i = 0; i < baris.length; i++) {
        const b = baris[i];
        const sebelumnya = hasil.length ? hasil[hasil.length - 1] : null;
        const sebelumnyaJudulPendek = sebelumnya !== null &&
            judulAtauPoin.test(sebelumnya) && sebelumnya.length < AMBANG_JUDUL_TERPOTONG;
        const bolehSambung = sebelumnya !== null && sebelumnya !== '' && b !== '' &&
            !akhirKalimat.test(sebelumnya) && !sebelumnyaJudulPendek && !judulAtauPoin.test(b);
        if (bolehSambung) {
            hasil[hasil.length - 1] = sebelumnya + ' ' + b;
        } else {
            hasil.push(b);
        }
    }
    return hasil.join('\n');
}

// Dipasang sekali di semua field rich text statis yang ada di modal
// (elemennya sudah ada di DOM begitu admin.js jalan, karena <script>
// admin.js ditaruh di akhir <body>). Opsi jawaban dinamis (dipakai
// ketiga jenis soal sejak FASE 9) di-richify() masing-masing sendiri
// waktu barisnya dibuat, lihat tambahOpsiDinamis().
(function initRichFields() {
    richify(document.getElementById('f-pertanyaan'), true);
    richify(document.getElementById('f-penjelasan'), true);
    richify(document.getElementById('f-bab-judul'), false);
    richify(document.getElementById('f-bab-ringkasan'), false);
    // Tombol Judul/Link/Gambar/Tabel HANYA di sini (teks materi) -- lihat
    // catatan "extended" di richify()/positionRichToolbar().
    richify(document.getElementById('f-bab-konten'), true, true);
    richify(document.getElementById('f-bab-petunjuk-kuis'), true);
    richify(document.getElementById('f-petunjuk-tes'), true);
})();

// Nilai rich text kosong secara VISUAL (mis. cuma sisa "<div><br></div>"
// setelah admin menghapus semua isinya) HARUS dikirim sebagai string kosong
// ke server, bukan markup kosong itu apa adanya -- kalau tidak, badge
// "Teks Ada/Teks Belum" di tabel Kelola Materi (dan pengecekan
// "item.penjelasan ?" di quiz.js) salah mengira field itu masih terisi.
function richOrEmpty(html) {
    return richTextIsEmpty(html) ? '' : html;
}

// =================================================================
// MONITOR PESERTA
// =================================================================
const MONITOR_STATUS_LABEL = {
    belum: 'Belum Mulai',
    sedang: 'Sedang Mengerjakan',
    waktu_habis: 'Waktu Habis',
    selesai: 'Selesai',
    // Khusus Final Tryout (multi-attempt) -- peserta sudah pernah coba
    // minimal 1x tapi skor percobaan terakhirnya belum mencapai passing
    // score, & sedang tidak ada percobaan baru yang aktif. Lihat catatan
    // status di api/admin/get_peserta_monitor.php.
    belum_lulus: 'Belum Lulus'
};

// Harus SAMA dengan TRYOUT_PASSING_SCORE di api/config.php -- dipakai
// murni buat menandai baris "lulus" (hijau) di dialog "Riwayat Percobaan
// Final Tryout" (lihat monitorShowTryoutRiwayatDialog), bukan buat
// hitung ulang status/skor (itu semua sudah dihitung backend).
const MONITOR_TRYOUT_PASSING_SCORE = 51;

function monitorStatusPillHtml(status) {
    const label = MONITOR_STATUS_LABEL[status] || status;
    return `<span class="monitor-status-pill ${status}">${label}</span>`;
}

function monitorFormatTanggal(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return iso;
    }
}

// silent: true kalau dipanggil dari auto-refresh (lihat
// startMonitorAutoRefresh) -- kalau true, LEWATI status "Memuat..."/error
// yang biasanya menimpa seluruh tabel (itu yang bikin tampilannya
// "berkedip" tiap 30 detik). Data lama tetap ditampilkan apa adanya
// sampai data baru benar-benar siap, baru tabelnya ditimpa SEKALI dengan
// hasil terbaru -- tanpa fase kosong/spinner di antaranya. Kalau request
// auto-refresh gagal, dibiarkan diam-diam (data lama yang masih tampil
// tidak masalah, dicoba lagi 30 detik berikutnya) -- beda dengan
// pemanggilan BIASA (klik "Refresh", buka halaman ini) yang tetap
// menampilkan status Memuat/error seperti biasa karena memang aksi yang
// disengaja admin.
async function loadMonitorPeserta(silent) {
    const container = document.getElementById('monitor-list-container');
    if (!silent) {
        container.innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat data peserta...</div>`;
    }

    try {
        const res = await fetch(API_BASE + 'admin/get_peserta_monitor.php');
        const result = await res.json();
        if (result.status === 'success') {
            monitorPesertaCache = result.data.peserta;
            monitorTotalBab = result.data.total_bab;
            renderMonitorStatCards();
            renderMonitorTable();
            renderUserManagementTable();
        } else if (!silent) {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat data peserta.')}</div>`;
        }
    } catch (err) {
        if (!silent) {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
        }
    }
}

function renderMonitorStatCards() {
    const total = monitorPesertaCache.length;
    const diagnostikSelesai = monitorPesertaCache.filter(p => p.diagnostik.status === 'selesai');
    const tryoutSelesai = monitorPesertaCache.filter(p => p.tryout.status === 'selesai');
    const sedangAktif = monitorPesertaCache.filter(p =>
        p.diagnostik.status === 'sedang' || p.tryout.status === 'sedang' ||
        (p.kuis_sedang_dikerjakan && p.kuis_sedang_dikerjakan.some(k => k.status === 'sedang'))
    ).length;
    const rataDiagnostik = diagnostikSelesai.length
        ? Math.round(diagnostikSelesai.reduce((a, p) => a + p.diagnostik.skor, 0) / diagnostikSelesai.length)
        : null;
    const rataTryout = tryoutSelesai.length
        ? Math.round(tryoutSelesai.reduce((a, p) => a + p.tryout.skor, 0) / tryoutSelesai.length)
        : null;

    // Tiap kartu dikasih 1 ikon FontAwesome yang cocok sama isinya, dipasang
    // besar & transparan di pojok kartu (lihat ".monitor-stat-icon" di
    // admin.css) -- cuma dekorasi biar kartunya gak kosong banget, gak
    // ganggu angka/labelnya.
    const cards = [
        { value: total, label: 'Total Peserta', icon: 'fa-users', onclick: "monitorOpenAllScoresModal()" },
        { value: sedangAktif, label: 'Sedang Aktif Mengerjakan', icon: 'fa-bolt', onclick: "monitorOpenSedangAktifModal()" },
        { value: `${diagnostikSelesai.length}/${total}`, label: 'Selesai Tes Diagnostik', icon: 'fa-clipboard-check', onclick: "monitorOpenSkorListModal('diagnostik')" },
        { value: `${tryoutSelesai.length}/${total}`, label: 'Selesai Final Tryout', icon: 'fa-flag-checkered', onclick: "monitorOpenSkorListModal('tryout')" },
        { value: rataDiagnostik !== null ? rataDiagnostik : '–', label: 'Rata-rata Skor Diagnostik', icon: 'fa-chart-line' },
        { value: rataTryout !== null ? rataTryout : '–', label: 'Rata-rata Skor Tryout', icon: 'fa-trophy' }
    ];

    document.getElementById('monitor-stat-row').innerHTML = cards.map(c => `
        <div class="monitor-stat-card${c.onclick ? ' clickable' : ''}"${c.onclick ? ` onclick="${c.onclick}" role="button" tabindex="0"` : ''}>
            <i class="fa-solid ${c.icon} monitor-stat-icon" aria-hidden="true"></i>
            <div class="monitor-stat-value">${c.value}</div>
            <div class="monitor-stat-label">${c.label}</div>
        </div>
    `).join('');
}

// --- List peserta + skor per kartu "Rata-rata Skor Diagnostik"/"Rata-rata
//     Skor Tryout" -- dibuka lewat dialog BIASA yang sama dengan dialog
//     rincian jawaban (monitorOpenReviewModal/#monitorReviewModalBackdrop),
//     supaya bisa diurutkan (klik header "Skor") tanpa membuka modal
//     berlapis-lapis (cukup render ulang isinya, bukan panggil
//     openAdminModal lagi). ---
let monitorSkorListJenis = null; // 'diagnostik' | 'tryout'
let monitorSkorListSortDir = 'desc';

function monitorOpenSkorListModal(jenis) {
    monitorSkorListJenis = jenis;
    monitorSkorListSortDir = 'desc';
    const label = jenis === 'diagnostik' ? 'Tes Diagnostik' : 'Final Tryout';
    monitorOpenReviewModal(`Skor ${label}`, monitorBuildSkorListHtml(), false);
}

function monitorToggleSkorListSort() {
    monitorSkorListSortDir = monitorSkorListSortDir === 'asc' ? 'desc' : 'asc';
    document.getElementById('monitorReviewBody').innerHTML = monitorBuildSkorListHtml();
}

function monitorBuildSkorListHtml() {
    const jenis = monitorSkorListJenis;
    const label = jenis === 'diagnostik' ? 'Tes Diagnostik' : 'Final Tryout';
    const list = monitorPesertaCache
        .filter(p => p[jenis].status === 'selesai')
        .map(p => ({ name: p.name, skor: p[jenis].skor }))
        .sort((a, b) => monitorSkorListSortDir === 'asc' ? a.skor - b.skor : b.skor - a.skor);

    const sortIcon = monitorSkorListSortDir === 'asc' ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>';

    const rows = list.map((p, i) => `
        <tr>
            <td class="monitor-skor-rank-cell">${i + 1}</td>
            <td style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(p.name)}</td>
            <td class="monitor-skor-value-cell">${p.skor}</td>
        </tr>`).join('');

    return `
        <div class="monitor-table-scroll">
            <table class="admin-table monitor-table monitor-skor-table">
                <thead>
                    <tr>
                        <th class="monitor-skor-rank-cell">No</th>
                        <th>Peserta</th>
                        <th class="sortable active monitor-skor-value-cell" onclick="monitorToggleSkorListSort()">Skor ${sortIcon}</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="3" class="monitor-empty-row">Belum ada peserta yang menyelesaikan ${label}.</td></tr>`}</tbody>
            </table>
        </div>`;
}

// --- Dialog "Sedang Aktif Mengerjakan" (dibuka lewat kartu di atas) --
//     daftar peserta yang lagi "sedang" (Tes Diagnostik/Final Tryout/kuis
//     per Bab) BESERTA SEDANG NGERJAIN APA -- kriteria "sedang aktif"
//     SENGAJA disamakan PERSIS dengan yang dipakai buat hitung angka kartu
//     (lihat "sedangAktif" di renderMonitorStatCards) supaya isi dialog ini
//     KONSISTEN dengan angka di kartunya -- peserta yang statusnya
//     "waktu_habis" (bukan "sedang") SENGAJA tidak diikutkan, sama seperti
//     angka kartunya. Teks "(sedang dikerjakan)" TIDAK diikutkan di sini
//     (beda dari "kuisAktifHtml" di renderMonitorTable) -- di dialog ini
//     sudah ada label "Sedang Mengerjakan:" & judul dialog sendiri, jadi
//     nambahin "(sedang dikerjakan)" di tiap baris cuma jadi pengulangan.
function monitorOpenSedangAktifModal() {
    monitorOpenReviewModal('Sedang Aktif Mengerjakan', monitorBuildSedangAktifHtml(), false);
    // Dilebarkan sama seperti dialog "Semua Nilai Peserta" (lihat
    // monitorOpenAllScoresModal) -- kolom "Sedang Mengerjakan" isinya bisa
    // banyak baris (Tes Diagnostik/Final Tryout/nama Bab sekaligus), jadi
    // lebih enak dibaca kalau ruangnya lebih lega. Class ini dilepas lagi
    // otomatis di closeMonitorReviewModal() begitu dialog ditutup.
    const modalEl = document.querySelector('#monitorReviewModalBackdrop .admin-modal');
    if (modalEl) modalEl.classList.add('admin-modal-xl');
}

function monitorBuildSedangAktifHtml() {
    const list = monitorPesertaCache.map(p => {
        const items = [];
        if (p.diagnostik.status === 'sedang') items.push('Tes Diagnostik');
        if (p.tryout.status === 'sedang') items.push('Final Tryout');
        (p.kuis_sedang_dikerjakan || []).forEach(k => {
            if (k.status === 'sedang') items.push(stripHtmlAdmin(k.bab_judul));
        });
        return { name: p.name, email: p.email, items };
    }).filter(p => p.items.length > 0);

    // Tabel ini SENGAJA TIDAK pakai kelas ".monitor-skor-table" (beda dari
    // dialog "Skor Tes Diagnostik"/"Skor Final Tryout") -- itu memaksa
    // tabel tetap tampil ringkas di layar kecil, cocok buat kolom "Skor"
    // yang isinya cuma 1 angka pendek. Kolom "Sedang Mengerjakan" di sini
    // bisa berisi beberapa baris teks (bisa panjang, nama Bab dst), jadi
    // dibiarkan pakai perilaku DEFAULT ".admin-table" -- berubah jadi
    // kartu bertumpuk di layar kecil (SAMA seperti tabel utama Monitor
    // Peserta), bukan tabel sempit yang harus digeser ke samping. Kolom
    // "No" juga SENGAJA dihilangkan (beda dari dialog Skor) -- nomor urut
    // gak terlalu penting di sini & bikin kartu mobile lebih rapi tanpa
    // baris angka yang berdiri sendiri.
    const rows = list.map(p => `
        <tr>
            <td>
                <div style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(p.name)}</div>
                <div style="color:#8a8fa3; font-size:12.5px;">${escapeHtmlAdmin(p.email)}</div>
            </td>
            <td>
                <span class="monitor-status-mobile-label">Sedang Mengerjakan:</span>
                ${p.items.map(it => `
                <div class="monitor-skor-text">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:9px;"></i>
                    ${escapeHtmlAdmin(it)}
                </div>`).join('')}
            </td>
        </tr>`).join('');

    return `
        <div class="monitor-table-scroll">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Peserta</th>
                        <th>Sedang Mengerjakan</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="2" class="monitor-empty-row">Tidak ada peserta yang sedang aktif mengerjakan saat ini.</td></tr>`}</tbody>
            </table>
        </div>`;
}

// --- Dialog "Semua Nilai Peserta" (dibuka lewat kartu "Total Peserta") --
//     matriks SEMUA peserta x SEMUA penilaian (Tes Diagnostik, tiap Bab,
//     Final Tryout) dalam satu tabel, supaya admin bisa lihat sekilas
//     tanpa buka modal Detail Peserta satu-satu. Dipakai bareng dialog
//     BIASA yang sama dengan Skor Diagnostik/Tryout & Detail Peserta
//     (monitorOpenReviewModal/#monitorReviewModalBackdrop) -- bukan modal
//     baru. Skor tiap Bab yang ditampilkan = PERCOBAAN TERAKHIR (bukan
//     tertinggi), SAMA seperti kolom "Skor Terakhir" di modal Detail
//     Peserta & api/get_bab.php (peserta boleh mengulang kuis berkali-kali).
//     Tabelnya dibiarkan lebar (tidak dipaksa 1 kolom = 1 bab kecil-kecil)
//     & scroll ke samping lewat ".monitor-table-scroll" kalau bab-nya
//     banyak -- style tabelnya PAKAI ULANG ".monitor-bab-progress-table"
//     yang sudah ada (dipakai juga di tabel Progres Materi modal Detail
//     Peserta), bukan bikin CSS baru. Kolom "No" mengikuti URUTAN
//     TAMPILAN saat ini (jadi angkanya ikut berubah kalau diurutkan ulang
//     lewat header kolom), BUKAN id tetap. Setiap kolom skor (Tes
//     Diagnostik/tiap Bab/Final Tryout) & kolom Peserta bisa diklik buat
//     urutkan, sama seperti header tabel Monitor Peserta yang utama. ---
let monitorAllScoresSortKey = 'name';
let monitorAllScoresSortDir = 'asc';

function monitorOpenAllScoresModal() {
    // Reset urutan tabelnya ke default (nama, A-Z) tiap dialog ini DIBUKA --
    // sama seperti monitorOpenSkorListModal() di atas -- supaya urutan yang
    // sempat diubah admin sebelumnya (klik salah satu header kolom) tidak
    // "nyangkut" begitu dialog ditutup lalu dibuka lagi.
    monitorAllScoresSortKey = 'name';
    monitorAllScoresSortDir = 'asc';
    monitorOpenReviewModal('Semua Nilai Peserta', monitorBuildAllScoresHtml(), false);
    // Dialog ini kolomnya bisa banyak (Tes Diagnostik + tiap Bab + Final
    // Tryout), jadi khusus di sini modalnya dilebarkan (lihat ".admin-modal-xl"
    // di admin.css) -- class ini dilepas lagi di closeMonitorReviewModal()
    // supaya dialog LAIN yang pakai #monitorReviewModalBackdrop yang sama
    // (rincian jawaban, riwayat percobaan, skor list) tidak ikut melebar.
    const modalEl = document.querySelector('#monitorReviewModalBackdrop .admin-modal');
    if (modalEl) modalEl.classList.add('admin-modal-xl');
}

function monitorAllScoresSetSort(key) {
    if (monitorAllScoresSortKey === key) {
        monitorAllScoresSortDir = monitorAllScoresSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        monitorAllScoresSortKey = key;
        monitorAllScoresSortDir = key === 'name' ? 'asc' : 'desc'; // skor wajar diurutkan tertinggi dulu begitu kolomnya baru diklik
    }
    document.getElementById('monitorReviewBody').innerHTML = monitorBuildAllScoresHtml();
}

// key: 'name' | 'diagnostik' | 'tryout' | 'bab:<id>' -- peserta yang
// belum punya skor (null) SENGAJA dianggap -1 supaya selalu berada di
// urutan paling bawah waktu diurutkan dari yang terbesar (desc, urutan
// default kolom skor), bukan tercampur di tengah.
function monitorAllScoresSortValue(p, key) {
    if (key === 'name') return p.name.toLowerCase();
    if (key === 'diagnostik') return p.diagnostik.skor !== null ? p.diagnostik.skor : -1;
    if (key === 'tryout') return p.tryout.skor !== null ? p.tryout.skor : -1;
    if (key.indexOf('bab:') === 0) {
        const babId = key.slice(4);
        const skor = (p.kuis_bab && p.kuis_bab[babId] !== undefined) ? p.kuis_bab[babId] : null;
        return skor !== null ? skor : -1;
    }
    return '';
}

function monitorBuildAllScoresHtml() {
    if (monitorPesertaCache.length === 0) {
        return `<div class="admin-empty-state"><i class="fa-solid fa-user-group"></i>Belum ada peserta yang mendaftar.</div>`;
    }

    const babKolom = (babListCache || []).slice().sort((a, b) => a.nomor - b.nomor);

    const sortIcon = (key) => {
        if (monitorAllScoresSortKey !== key) return '<i class="fa-solid fa-sort"></i>';
        return monitorAllScoresSortDir === 'asc' ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>';
    };
    const sortClass = (key) => monitorAllScoresSortKey === key ? 'sortable active' : 'sortable';

    const babHeaderHtml = babKolom.map(b => {
        const key = 'bab:' + b.id;
        return `<th class="col-center ${sortClass(key)}" onclick="monitorAllScoresSetSort('${key}')">Bab ${b.nomor} ${sortIcon(key)}</th>`;
    }).join('');

    const sortedList = monitorPesertaCache.slice().sort((a, b) => {
        const va = monitorAllScoresSortValue(a, monitorAllScoresSortKey);
        const vb = monitorAllScoresSortValue(b, monitorAllScoresSortKey);
        const cmp = va > vb ? 1 : (va < vb ? -1 : 0);
        return monitorAllScoresSortDir === 'asc' ? cmp : -cmp;
    });

    const rows = sortedList.map((p, i) => {
        const diagnostikCell = p.diagnostik.skor !== null ? p.diagnostik.skor : '–';
        const tryoutCell = p.tryout.skor !== null ? p.tryout.skor : '–';
        const babCellsHtml = babKolom.map(b => {
            const skor = (p.kuis_bab && p.kuis_bab[b.id] !== undefined) ? p.kuis_bab[b.id] : null;
            return `<td class="col-center">${skor !== null ? skor : '–'}</td>`;
        }).join('');

        return `
        <tr>
            <td class="col-center col-no">${i + 1}</td>
            <td style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(p.name)}</td>
            <td class="col-center">${diagnostikCell}</td>
            ${babCellsHtml}
            <td class="col-center">${tryoutCell}</td>
        </tr>`;
    }).join('');

    return `
        <div class="monitor-table-scroll">
            <table class="monitor-bab-progress-table">
                <thead>
                    <tr>
                        <th class="col-center col-no">No</th>
                        <th class="${sortClass('name')}" onclick="monitorAllScoresSetSort('name')">Peserta ${sortIcon('name')}</th>
                        <th class="col-center ${sortClass('diagnostik')}" onclick="monitorAllScoresSetSort('diagnostik')">Tes Diagnostik ${sortIcon('diagnostik')}</th>
                        ${babHeaderHtml}
                        <th class="col-center ${sortClass('tryout')}" onclick="monitorAllScoresSetSort('tryout')">Final Tryout ${sortIcon('tryout')}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function monitorSortValue(p, key) {
    switch (key) {
        case 'name': return p.name.toLowerCase();
        case 'materi': return p.materi.bab_lulus;
        case 'diagnostik': return p.diagnostik.skor !== null ? p.diagnostik.skor : -1;
        case 'tryout': return p.tryout.skor !== null ? p.tryout.skor : -1;
        default: return '';
    }
}

function monitorSetSort(key) {
    if (monitorSortKey === key) {
        monitorSortDir = monitorSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        monitorSortKey = key;
        monitorSortDir = key === 'name' ? 'asc' : 'desc'; // skor/progres wajar diurutkan tertinggi dulu begitu kolomnya baru diklik
    }
    renderMonitorTable();
}

// Dipakai bareng oleh renderMonitorTable() & exportMonitorPesertaCsv()
// supaya file yang diekspor SELALU sama dengan yang sedang tampil di
// layar (ikut pencarian/filter/urutan yang aktif saat itu).
// Dipanggil dari switchAdminPage() waktu admin PINDAH KELUAR dari halaman
// Monitor Peserta -- lihat komentar di sana. Tidak perlu render ulang
// tabelnya di sini (toh sedang tidak kelihatan), cukup kosongkan
// input/dropdown-nya supaya waktu loadMonitorPeserta() dipanggil lagi
// nanti (balik ke halaman ini), getMonitorFilteredList() otomatis baca
// nilai yang sudah bersih.
function resetMonitorFilters() {
    const searchEl = document.getElementById('monitor-search-input');
    const filterDiagnostikEl = document.getElementById('monitor-filter-diagnostik');
    const filterTryoutEl = document.getElementById('monitor-filter-tryout');
    if (searchEl) searchEl.value = '';
    if (filterDiagnostikEl) filterDiagnostikEl.value = '';
    if (filterTryoutEl) filterTryoutEl.value = '';

    // Urutan kolom tabelnya (klik header Peserta/Progres Materi/Tes
    // Diagnostik/Final Tryout) SENGAJA ikut direset ke default juga di
    // sini -- bukan cuma pencarian & dropdown status -- supaya waktu
    // balik lagi ke halaman ini, urutannya tidak "nyangkut" dari yang
    // sempat diklik sebelumnya.
    monitorSortKey = 'name';
    monitorSortDir = 'asc';
}

// Sama seperti resetMonitorFilters() di atas, tapi untuk kotak pencarian
// di halaman Manajemen User.
function resetUserManagementFilter() {
    const searchEl = document.getElementById('user-search-input');
    if (searchEl) searchEl.value = '';
}

function getMonitorFilteredList() {
    const search = document.getElementById('monitor-search-input').value.trim().toLowerCase();
    const filterDiagnostik = document.getElementById('monitor-filter-diagnostik').value;
    const filterTryout = document.getElementById('monitor-filter-tryout').value;

    const list = monitorPesertaCache.filter(p => {
        if (search && !p.name.toLowerCase().includes(search) && !p.email.toLowerCase().includes(search)) return false;
        if (filterDiagnostik && p.diagnostik.status !== filterDiagnostik) return false;
        if (filterTryout && p.tryout.status !== filterTryout) return false;
        return true;
    });

    return list.slice().sort((a, b) => {
        const va = monitorSortValue(a, monitorSortKey);
        const vb = monitorSortValue(b, monitorSortKey);
        const cmp = va > vb ? 1 : (va < vb ? -1 : 0);
        return monitorSortDir === 'asc' ? cmp : -cmp;
    });
}

// Dipanggil dari onclick <tr> di renderMonitorTable() -- klik baris SENGAJA
// cuma buka detail di layar LEBAR (tabel biasa). Di layar kecil (tampilan
// kartu mobile, <576px, breakpoint yang sama dengan ".monitor-table"),
// detail peserta HARUS dibuka lewat tombol mata eksplisit aja (lihat CSS
// ".monitor-row-detail-btn" yang di layar kecil selalu ditampilkan) --
// supaya di kartu yang padat itu gak ke-klik gak sengaja pas mau scroll
// atau nge-tap bagian lain kartunya.
function monitorRowClick(userId) {
    if (window.innerWidth < 576) return;
    openMonitorDetailModal(userId);
}

function renderMonitorTable() {
    const container = document.getElementById('monitor-list-container');

    if (monitorPesertaCache.length === 0) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-user-group"></i>Belum ada peserta yang mendaftar.</div>`;
        return;
    }

    const list = getMonitorFilteredList();

    const sortIcon = (key) => {
        if (monitorSortKey !== key) return '<i class="fa-solid fa-sort"></i>';
        return monitorSortDir === 'asc' ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>';
    };
    const sortClass = (key) => monitorSortKey === key ? 'sortable active' : 'sortable';

    const rows = list.map(p => {
        const kuisAktifHtml = (p.kuis_sedang_dikerjakan || []).map(k => `
            <div class="monitor-skor-text">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size:9px;"></i>
                ${escapeHtmlAdmin(stripHtmlAdmin(k.bab_judul))} ${k.status === 'waktu_habis' ? '(waktu habis)' : '(sedang dikerjakan)'}
            </div>`).join('');

        return `
        <tr class="monitor-row-clickable" onclick="monitorRowClick(${p.id})" title="Klik untuk lihat detail peserta">
            <td>
                <div style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(p.name)}</div>
                <div style="color:#8a8fa3; font-size:12.5px;">${escapeHtmlAdmin(p.email)}</div>
            </td>
            <td>
                <div class="monitor-materi-progress"><span class="lulus-count">${p.materi.bab_lulus}</span>/${p.materi.total_bab} bab lulus</div>
                <div class="monitor-skor-text">${p.materi.bab_dibaca}/${p.materi.total_bab} bab dibaca</div>
                ${kuisAktifHtml}
            </td>
            <td>
                <span class="monitor-status-mobile-label">Tes Diagnostik:</span>
                ${monitorStatusPillHtml(p.diagnostik.status)}
            </td>
            <td>
                <span class="monitor-status-mobile-label">Final Tryout:</span>
                ${monitorStatusPillHtml(p.tryout.status)}
            </td>
            <td style="width:132px;">
                <!-- "stopPropagation" di sini WAJIB -- baris (<tr>) di atas
                     sekarang juga bisa diklik buat buka detail (lihat
                     onclick di <tr>), jadi tanpa ini klik salah satu tombol
                     di bawah (apalagi "Reset progres") bakal IKUT
                     ke-trigger juga klik barisnya. -->
                <div class="admin-row-actions" onclick="event.stopPropagation()">
                    <button class="admin-icon-btn monitor-row-detail-btn" onclick="openMonitorDetailModal(${p.id})" title="Lihat detail"><i class="fa-solid fa-eye"></i></button>
                    <button class="admin-icon-btn" onclick="exportPesertaDetailXlsx(${p.id})" title="Unduh laporan peserta ini (XLSX)"><i class="fa-solid fa-file-excel"></i></button>
                    <button class="admin-icon-btn danger" onclick="monitorResetPeserta(${p.id})" title="Reset progres"><i class="fa-solid fa-rotate-left"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Dibungkus ".monitor-table-scroll" (sama seperti tabel Progres
    // Materi per Bab di modal Detail Peserta) supaya di layar yang tidak
    // cukup lebar untuk 5 kolom ini (tapi belum masuk breakpoint kartu
    // mobile di bawah 576px) tabelnya tidak kepotong -- cukup digeser ke
    // samping, kolomnya tetap seperti tampilan lebar. Tidak memengaruhi
    // tampilan kartu mobile (lihat aturan ".monitor-table" min-width yang
    // discope ke "@media (min-width:576px)" di admin.css).
    container.innerHTML = `
        <div class="monitor-table-scroll">
            <table class="admin-table monitor-table">
                <thead>
                    <tr>
                        <th class="${sortClass('name')}" onclick="monitorSetSort('name')">Peserta ${sortIcon('name')}</th>
                        <th class="${sortClass('materi')}" onclick="monitorSetSort('materi')">Progres Materi ${sortIcon('materi')}</th>
                        <th class="${sortClass('diagnostik')}" onclick="monitorSetSort('diagnostik')">Tes Diagnostik ${sortIcon('diagnostik')}</th>
                        <th class="${sortClass('tryout')}" onclick="monitorSetSort('tryout')">Final Tryout ${sortIcon('tryout')}</th>
                        <th class="monitor-aksi-header">Aksi</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="5" class="monitor-empty-row">Tidak ada peserta yang cocok dengan pencarian/filter saat ini.</td></tr>`}</tbody>
            </table>
        </div>
    `;
}

// --- Export CSV (bisa dibuka Excel) -- mengikuti pencarian/filter/urutan
//     yang SEDANG aktif di layar, supaya file yang diunduh = yang tampil. ---
// Isinya SENGAJA disamakan persis dengan exportMonitorPesertaXlsx() di bawah
// (matriks SEMUA peserta x SEMUA penilaian -- Tes Diagnostik, tiap Bab,
// Final Tryout -- SELALU semua peserta, TIDAK ikut filter/pencarian yang
// aktif) -- cuma beda format file (CSV polos vs XLSX bergaya). Kalau salah
// satu diubah strukturnya (kolom ditambah/dikurangi dst), yang satu lagi
// SEBAIKNYA ikut disesuaikan juga biar isinya tetap konsisten.
function exportMonitorPesertaCsv() {
    if (monitorPesertaCache.length === 0) {
        Swal.fire({ icon: 'info', title: 'Belum ada data', text: 'Belum ada peserta untuk diekspor.' });
        return;
    }

    const babKolom = (babListCache || []).slice().sort((a, b) => a.nomor - b.nomor);
    const sortedList = monitorPesertaCache.slice().sort((a, b) => a.name.localeCompare(b.name, 'id'));

    const csvEscape = (val) => {
        const s = String(val === null || val === undefined ? '' : val);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = ['No', 'Peserta', 'Email', 'Tes Diagnostik', ...babKolom.map(b => `Bab ${b.nomor}`), 'Final Tryout'];
    const rows = sortedList.map((p, i) => {
        const diagnostikCell = p.diagnostik.skor !== null ? p.diagnostik.skor : '–';
        const tryoutCell = p.tryout.skor !== null ? p.tryout.skor : '–';
        const babCells = babKolom.map(b => {
            const skor = (p.kuis_bab && p.kuis_bab[b.id] !== undefined) ? p.kuis_bab[b.id] : null;
            return skor !== null ? skor : '–';
        });
        return [i + 1, p.name, p.email, diagnostikCell, ...babCells, tryoutCell].map(csvEscape).join(',');
    });

    // BOM di awal ("﻿") supaya Excel mendeteksi encoding UTF-8 dengan
    // benar (kalau tidak, nama peserta yang ada karakter non-ASCII bisa
    // tampil rusak/mojibake waktu file-nya dibuka).
    const csvContent = '﻿' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-keseluruhan-peserta-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =================================================================
// EXPORT XLSX (Monitor Peserta) -- pakai ExcelJS (window.ExcelJS, lihat
// <script> di admin.html), BUKAN SheetJS, karena butuh styling tabel
// beneran (header bold+warna, border tiap sel, lebar kolom nyesuain
// panjang isinya biar teksnya gak kepotong) -- itu fitur Pro/berbayar di
// SheetJS versi gratis, tapi bawaan & gratis di ExcelJS.
// =================================================================

const XLSX_WARNA_HEADER = 'FF173350'; // = var(--primary-color) di admin.css

// Fungsi (bukan objek/konstanta tetap) -- tiap sel butuh objek border
// SENDIRI-SENDIRI (bukan berbagi 1 objek yang sama lewat referensi),
// karena ExcelJS nyimpen style per-sel; kalau semua sel nunjuk ke objek
// referensi yang PERSIS SAMA, sebagian border ada yang gak ke-render waktu
// dibuka di Excel/Google Sheets asli (border sebelumnya jadi nyaris gak
// kelihatan, warnanya juga sengaja digelapin di sini biar jelas beda dari
// garis bantu/gridline bawaan Excel & Google Sheets, bukan nyampur).
function xlsxBorderSel() {
    const sisi = { style: 'thin', color: { argb: 'FF9AA0B4' } };
    return { top: { ...sisi }, left: { ...sisi }, bottom: { ...sisi }, right: { ...sisi } };
}

// Styling 1 baris jadi header tabel: bold putih, background warna utama,
// rata tengah, border tiap sel.
function xlsxStyleHeaderRow(row) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_WARNA_HEADER } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = xlsxBorderSel();
    });
    row.height = 22;
}

// Styling 1 baris data biasa: border tiap sel + rata tengah vertikal (rata
// horizontal dibiarkan default kiri, KECUALI kolom yang eksplisit di-center
// lewat cell.alignment sendiri-sendiri di pemanggilnya).
function xlsxStyleDataRow(row) {
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = xlsxBorderSel();
        cell.alignment = Object.assign({ vertical: 'middle', wrapText: true }, cell.alignment || {});
    });
}

// Lebar tiap kolom disamain sama panjang isi TERPANJANG di kolom itu
// (termasuk header) -- supaya nama peserta/email/judul bab yang panjang
// gak kepotong ("###" atau nyempil) waktu file-nya dibuka. Dibatasi
// maxWidth biar 1 kolom yang isinya kepanjangan (misal judul bab) gak
// bikin seluruh sheet jadi kelebaran.
function xlsxAutoFitColumns(ws, minWidth, maxWidth) {
    ws.columns.forEach((col) => {
        let maxLen = minWidth;
        col.eachCell({ includeEmpty: true }, (cell) => {
            // Sel yang jadi bagian baris JUDUL yang di-merge lintas semua
            // kolom (mis. "Laporan Peserta: <nama>", "TES DIAGNOSTIK") SENGAJA
            // diabaikan di sini -- teksnya udah otomatis "meluber" ke seluruh
            // lebar area merge-nya sendiri (gabungan SEMUA kolom), jadi gak
            // perlu (dan malah salah) maksa SATU kolom biasa jadi lebar cuma
            // gara-gara baris judul itu -- lihat kasus kolom "Status" yang
            // kepotong kalau ini tidak di-skip (kolom itu juga dipakai
            // baris judul "Laporan Peserta: ..." di baris lain).
            if (cell.isMerged) return;
            const val = cell.value === null || cell.value === undefined ? '' : String(cell.value);
            // String multi-baris (kalau ada) diukur dari baris TERPANJANGnya,
            // bukan total karakter -- lebih akurat buat lebar kolom.
            val.split('\n').forEach((line) => { if (line.length > maxLen) maxLen = line.length; });
        });
        col.width = Math.min(maxLen + 4, maxWidth);
    });
}

// Baris "Diunduh pada: <tanggal & jam>" di paling bawah tiap file .xlsx --
// DIPANGGIL PALING TERAKHIR (setelah semua baris data lain selesai
// ditambahkan, tepat sebelum xlsxAutoFitColumns), jadi posisinya otomatis
// ngikutin sepanjang apa tabel di atasnya (nambah/berkurang baris data ->
// baris ini ikut turun/naik sendiri -- BUKAN nomor baris tetap/hardcode),
// selalu dipisah 1 baris kosong dari isi terakhir di atasnya. Sel-nya
// di-MERGE lintas kolom (bukan cuma kolom A) supaya (a) teksnya kebaca
// penuh 1 baris & (b) OTOMATIS di-skip oleh xlsxAutoFitColumns (lihat
// pengecekan "cell.isMerged" di atas) -- kalau tidak di-merge, teks
// "Diunduh pada: ..." yang lumayan panjang bisa bikin kolom A jadi lebar
// gak perlu (sama seperti bug baris judul section sebelumnya).
function xlsxTambahFooterDiunduh(ws, jumlahKolom) {
    ws.addRow([]);
    const row = ws.addRow([`Diunduh pada: ${monitorFormatTanggal(new Date())}`]);
    ws.mergeCells(row.number, 1, row.number, jumlahKolom);
    row.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF8A8FA3' } };
    row.getCell(1).alignment = { vertical: 'middle' };
}

async function xlsxDownloadWorkbook(wb, filename) {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Export XLSX "Laporan Keseluruhan Peserta" -- matriks SEMUA peserta x
//     SEMUA penilaian (Tes Diagnostik, tiap Bab, Final Tryout), isinya SAMA
//     dengan dialog "Semua Nilai Peserta" yang dibuka lewat kartu "Total
//     Peserta" (lihat monitorBuildAllScoresHtml). BEDA dengan Export CSV:
//     yang ini SELALU semua peserta (tidak ikut pencarian/filter yang lagi
//     aktif di layar) karena tujuannya laporan rekap total. Skor tiap Bab =
//     PERCOBAAN TERAKHIR (bukan tertinggi), konsisten dengan bagian Monitor
//     Peserta lainnya. ---
async function exportMonitorPesertaXlsx() {
    if (typeof ExcelJS === 'undefined') {
        Swal.fire({ icon: 'error', title: 'Gagal memuat library Excel', text: 'Library ExcelJS gagal dimuat (kemungkinan koneksi internet bermasalah). Coba muat ulang halaman.' });
        return;
    }
    if (monitorPesertaCache.length === 0) {
        Swal.fire({ icon: 'info', title: 'Belum ada data', text: 'Belum ada peserta untuk diekspor.' });
        return;
    }

    const babKolom = (babListCache || []).slice().sort((a, b) => a.nomor - b.nomor);
    const sortedList = monitorPesertaCache.slice().sort((a, b) => a.name.localeCompare(b.name, 'id'));

    const wb = new ExcelJS.Workbook();
    // Baris header di-freeze (tetap kelihatan pas scroll ke bawah lihat
    // banyak peserta) -- garis penanda freeze row-nya emang otomatis
    // "kepanjangan" sampai kolom kosong di sebelah kanan tabel (itu
    // perilaku bawaan Excel/Google Sheets, bukan bug dari file ini), tapi
    // manfaat header yang selalu kelihatan lebih penting.
    const ws = wb.addWorksheet('Semua Peserta', { views: [{ state: 'frozen', ySplit: 1 }] });

    const header = ['No', 'Peserta', 'Email', 'Tes Diagnostik', ...babKolom.map(b => `Bab ${b.nomor}`), 'Final Tryout'];
    xlsxStyleHeaderRow(ws.addRow(header));

    sortedList.forEach((p, i) => {
        const diagnostikCell = p.diagnostik.skor !== null ? p.diagnostik.skor : '–';
        const tryoutCell = p.tryout.skor !== null ? p.tryout.skor : '–';
        const babCells = babKolom.map(b => {
            const skor = (p.kuis_bab && p.kuis_bab[b.id] !== undefined) ? p.kuis_bab[b.id] : null;
            return skor !== null ? skor : '–';
        });
        const row = ws.addRow([i + 1, p.name, p.email, diagnostikCell, ...babCells, tryoutCell]);
        // Kolom Peserta (nama) sengaja dibold biar gampang di-scan -- sisanya
        // normal.
        row.getCell(2).font = { bold: true };
        // Kolom No + semua kolom skor (Tes Diagnostik/tiap Bab/Final Tryout)
        // dirata-tengah; kolom Peserta/Email tetap rata kiri (default).
        [1, 4, ...babKolom.map((b, idx) => 5 + idx), 5 + babKolom.length].forEach((colIdx) => {
            row.getCell(colIdx).alignment = Object.assign({}, row.getCell(colIdx).alignment, { horizontal: 'center' });
        });
        // Baris genap dikasih fill abu-abu SANGAT tipis (zebra stripe) biar
        // tabelnya gampang diikuti per baris waktu dibuka -- style tabel
        // Excel yang umum dipakai, bukan bikin-bikin sendiri.
        if (i % 2 === 1) {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FB' } };
            });
        }
        xlsxStyleDataRow(row);
    });

    xlsxTambahFooterDiunduh(ws, header.length);
    xlsxAutoFitColumns(ws, 8, 50);
    ws.getColumn(1).width = 5; // kolom "No" dipaksa sempit, gak perlu ikut auto-fit

    await xlsxDownloadWorkbook(wb, `laporan-keseluruhan-peserta-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Export XLSX "Laporan Peserta" (satu peserta) -- dipanggil dari ikon
//     Excel di kolom "Aksi" tiap baris tabel Monitor Peserta (lihat
//     renderMonitorTable()). Isinya SAMA dengan yang ditampilkan di modal
//     "Detail Peserta" (lihat renderMonitorDetail): identitas peserta,
//     ringkasan Tes Diagnostik & Final Tryout, dan tabel Progres Materi per
//     Bab. Datanya diambil FRESH lewat API (bukan dari monitorPesertaCache
//     yang cuma versi ringkasan), sama seperti openMonitorDetailModal(),
//     supaya detail per-Bab-nya lengkap walau modalnya belum pernah
//     dibuka. ---
async function exportPesertaDetailXlsx(userId) {
    if (typeof ExcelJS === 'undefined') {
        Swal.fire({ icon: 'error', title: 'Gagal memuat library Excel', text: 'Library ExcelJS gagal dimuat (kemungkinan koneksi internet bermasalah). Coba muat ulang halaman.' });
        return;
    }
    Swal.fire({ title: 'Menyiapkan laporan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_BASE + 'admin/get_peserta_detail.php?user_id=' + userId);
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal memuat data', text: result.message || 'Terjadi kesalahan.' });
            return;
        }
        await buildAndDownloadPesertaDetailXlsx(result.data);
        Swal.close();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Tidak bisa terhubung ke server.' });
    }
}

// Susunan barisnya bertingkat (identitas -> Tes Diagnostik -> Final Tryout
// -> Progres Materi), bukan satu tabel rata, supaya waktu dibuka di Excel
// tetap kebaca sebagai "laporan" satu peserta -- sama seperti urutan
// section di modal "Detail Peserta" pada layar. Tiap section-title & tiap
// header tabel mini-nya di-bold+warna (sama seperti header tabel di
// laporan keseluruhan), baris identitas di atas dibold juga.
async function buildAndDownloadPesertaDetailXlsx(data) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Detail Peserta');
    // Kolom "Bab" MERGE TETAP B:E (4 kolom fisik) di SETIAP baris tabel
    // Progres Materi -- bukan digeser dinamis per baris (itu bakal bikin
    // header gak nyambung sama datanya). Karena merge-nya konsisten di semua
    // baris, kolom-kolom sesudahnya (Materi Dibaca dst) juga konsisten mulai
    // dari kolom F -- headernya tetap rapi nempel di kolomnya masing-masing.
    const JUMLAH_KOLOM = 9; // kolom terbanyak dipakai tabel "Progres Materi" (No, Bab[B:E merge], Materi Dibaca, Status Kuis, Jumlah Percobaan, Skor Terakhir) -- baris identitas di paling atas di-merge sampai kolom ini biar jadi satu baris penuh (lebar penuh laporan), bukan cuma nyempil di kolom pertama.
    const JUMLAH_KOLOM_RINGKASAN = 5; // kolom tabel "Status/Skor/Jumlah Benar/Jumlah Soal/Selesai Pada" (Tes Diagnostik & Final Tryout) -- SENGAJA beda dari JUMLAH_KOLOM di atas, supaya banner judul section-nya PAS selebar tabelnya sendiri, gak "lebih 1 kolom" dari tabel yang ada di bawahnya.

    const tambahBarisMerge = (text, opts) => {
        const row = ws.addRow([text]);
        ws.mergeCells(row.number, 1, row.number, (opts && opts.kolom) || JUMLAH_KOLOM);
        row.getCell(1).font = Object.assign({ bold: true }, opts && opts.font);
        if (opts && opts.fill) {
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
            row.getCell(1).font.color = { argb: 'FFFFFFFF' };
        }
        row.getCell(1).alignment = { vertical: 'middle' };
        row.height = opts && opts.height ? opts.height : undefined;
        return row;
    };

    tambahBarisMerge(`Laporan Peserta: ${data.name}`, { font: { size: 14 }, height: 24 });
    tambahBarisMerge(`Email: ${data.email}`);
    tambahBarisMerge(`Terdaftar: ${monitorFormatTanggal(data.terdaftar_pada)}`);
    ws.addRow([]);

    // "jenis" bedain label status "Selesai"/"Belum Selesai" (Tes Diagnostik,
    // masih single-attempt) vs "Selesai"/"Belum Lulus"/"Belum Selesai"
    // (Final Tryout, sekarang boleh dicoba berkali-kali -- ringkasan yang
    // dikirim dari get_peserta_detail.php SELALU berisi percobaan TERAKHIR,
    // "lulus" menentukan apakah itu sudah final; peserta yang sudah coba
    // tapi belum lulus TETAP punya "ringkasan" berisi skor percobaan
    // terakhirnya, jadi tidak cukup dibedakan dari null saja).
    const tambahSectionRingkasan = (judul, ringkasan, jenis) => {
        tambahBarisMerge(judul, { fill: XLSX_WARNA_HEADER, kolom: JUMLAH_KOLOM_RINGKASAN });
        xlsxStyleHeaderRow(ws.addRow(['Status', 'Skor', 'Jumlah Benar', 'Jumlah Soal', 'Selesai Pada']));
        let statusText, skorText;
        if (!ringkasan) {
            statusText = 'Belum Selesai';
            skorText = '–';
        } else if (jenis === 'tryout') {
            statusText = ringkasan.lulus ? 'Selesai' : 'Belum Lulus';
            skorText = ringkasan.jumlah_percobaan > 1 ? `${ringkasan.skor} (percobaan ke-${ringkasan.jumlah_percobaan})` : ringkasan.skor;
        } else {
            statusText = 'Selesai';
            skorText = ringkasan.skor;
        }
        const dataRow = ws.addRow(ringkasan
            ? [statusText, skorText, ringkasan.jumlah_benar, ringkasan.jumlah_soal, monitorFormatTanggal(ringkasan.selesai_pada)]
            : [statusText, '–', '–', '–', '–']);
        xlsxStyleDataRow(dataRow);
        [1, 2, 3, 4, 5].forEach((c) => { dataRow.getCell(c).alignment = Object.assign({}, dataRow.getCell(c).alignment, { horizontal: 'center' }); });
        ws.addRow([]);
    };
    tambahSectionRingkasan('TES DIAGNOSTIK', data.diagnostik, 'diagnostik');
    tambahSectionRingkasan('FINAL TRYOUT', data.tryout, 'tryout');

    // Kolom "Bab" (teks nama bab, bisa panjang) di-MERGE TETAP B:E (4 kolom)
    // di SETIAP baris -- kolom B/C/D/E sendiri lebarnya ikut kolom "Skor",
    // "Jumlah Benar", "Jumlah Soal", "Selesai Pada" di tabel ringkasan di
    // atas (isinya angka/tanggal pendek), tapi karena sel Bab "isMerged"
    // (diabaikan xlsxAutoFitColumns), itu gak maksa B/C/D/E jadi lebar.
    // Hasilnya "Skor" dkk tetap kecil, dan teks Bab yang lebih panjang dari
    // ruang gabungan itu otomatis "Bungkus Teks" (wrapText) ke beberapa
    // baris -- bukan kepotong -- baris otomatis nambah tinggi ngikutin wrap.
    tambahBarisMerge('PROGRES MATERI', { fill: XLSX_WARNA_HEADER });
    const headerProgresRow = ws.addRow(['No', 'Bab', null, null, null, 'Materi Dibaca', 'Status Kuis', 'Jumlah Percobaan', 'Skor Terakhir']);
    ws.mergeCells(headerProgresRow.number, 2, headerProgresRow.number, 5);
    xlsxStyleHeaderRow(headerProgresRow);
    data.bab.forEach((b) => {
        let statusKuis;
        if (!b.ada_kuis) statusKuis = 'Tanpa Kuis';
        else if (b.lulus) statusKuis = 'Lulus';
        else if (b.jumlah_percobaan_kuis > 0) statusKuis = 'Belum Lulus';
        else statusKuis = 'Belum Coba';
        const skorTerakhir = b.percobaan_terakhir ? `${b.percobaan_terakhir.skor} (${b.percobaan_terakhir.jumlah_benar}/${b.percobaan_terakhir.jumlah_soal})` : '–';
        const row = ws.addRow([b.nomor, stripHtmlAdmin(b.judul), null, null, null, b.materi_dibaca ? 'Ya' : 'Tidak', statusKuis, b.jumlah_percobaan_kuis, skorTerakhir]);
        ws.mergeCells(row.number, 2, row.number, 5);
        xlsxStyleDataRow(row);
        row.getCell(2).alignment = { vertical: 'middle', wrapText: true }; // Bab: rata kiri (bukan center) -- teks panjang lebih enak dibaca rata kiri
        [1, 6, 7, 8, 9].forEach((c) => { row.getCell(c).alignment = Object.assign({}, row.getCell(c).alignment, { horizontal: 'center' }); });
    });

    xlsxTambahFooterDiunduh(ws, JUMLAH_KOLOM);

    // Kolom A TIDAK dipaksa sempit di sini (beda dengan laporan
    // keseluruhan) -- kolom ini "dobel pakai": "No" di tabel Progres
    // Materi, TAPI "Status" di dua tabel ringkasan (Tes Diagnostik/Final
    // Tryout) di atasnya, jadi lebarnya harus ikut nyesuain isi terpanjang
    // ("Belum Selesai") biar teksnya gak kepotong.
    xlsxAutoFitColumns(ws, 10, 65);

    // Nama file pakai nama peserta -- dibersihkan dari karakter yang gak
    // valid buat nama file (slash, titik dua, dll).
    const safeName = data.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'peserta';
    await xlsxDownloadWorkbook(wb, `laporan-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Reset progres peserta (Tes Diagnostik/Final Tryout/per bab/semua) --
//     dua tahap konfirmasi (pilih bagian -> konfirmasi akhir) karena ini
//     operasi DESTRUKTIF & tidak bisa diurungkan. Dialog BIASA (bukan
//     SweetAlert2) lewat #monitorResetModalBackdrop -- kedua tahap dirender
//     dengan mengganti innerHTML #monitorResetBody, bukan dua modal
//     terpisah. Context (peserta/pilihan/target terpilih) disimpan di
//     monitorResetCtx, mengikuti pola monitorDetailDataAktif di atas, supaya
//     tidak perlu menyisipkan data lewat atribut onclick. ---
let monitorResetCtx = null;

function monitorResetPeserta(userId) {
    const peserta = monitorPesertaCache.find(p => p.id === userId);
    if (!peserta) return;

    const inputOptions = {
        diagnostik: 'Tes Diagnostik',
        tryout: 'Final Tryout'
    };
    (babListCache || []).forEach(b => {
        inputOptions['bab:' + b.id] = `Bab ${b.nomor}`;
    });
    inputOptions['semua'] = 'SEMUA (Reset Total)';

    monitorResetCtx = { userId, peserta, inputOptions, target: null };

    document.getElementById('monitorResetTitle').textContent = `Reset progres ${peserta.name}?`;
    monitorRenderResetStep1();
    openAdminModal('monitorResetModalBackdrop');
}

function monitorRenderResetStep1() {
    const ctx = monitorResetCtx;
    if (!ctx) return;
    const optionsHtml = Object.entries(ctx.inputOptions)
        .map(([value, label]) => `<option value="${escapeHtmlAdmin(value)}">${escapeHtmlAdmin(label)}</option>`)
        .join('');

    document.getElementById('monitorResetBody').innerHTML = `
        <p>Pilih bagian yang mau direset. Peserta bisa mengerjakan ulang bagian itu dari awal. Tindakan ini <strong>tidak bisa diurungkan</strong>.</p>
        <div class="admin-form-group">
            <select id="monitorResetSelect">
                <option value="" selected disabled>Pilih bagian...</option>
                ${optionsHtml}
            </select>
            <div class="admin-form-error" id="monitorResetSelectError" style="display:none; color:var(--danger-color); font-size:13px; margin-top:6px;"></div>
        </div>
        <div class="admin-modal-footer">
            <button class="admin-btn-secondary" onclick="closeMonitorResetModal()">Batal</button>
            <button class="admin-btn-primary" onclick="monitorResetGoStep2()">Lanjutkan</button>
        </div>`;
}

function monitorResetGoStep2() {
    const ctx = monitorResetCtx;
    if (!ctx) return;
    const select = document.getElementById('monitorResetSelect');
    const value = select ? select.value : '';
    const errorEl = document.getElementById('monitorResetSelectError');
    if (!value) {
        if (errorEl) {
            errorEl.textContent = 'Pilih bagian yang mau direset terlebih dahulu.';
            errorEl.style.display = '';
        }
        return;
    }
    ctx.target = value;
    const labelTarget = ctx.inputOptions[value];

    document.getElementById('monitorResetBody').innerHTML = `
        <p>"${escapeHtmlAdmin(labelTarget)}" milik ${escapeHtmlAdmin(ctx.peserta.name)} akan dihapus permanen.</p>
        <div class="admin-modal-footer">
            <button class="admin-btn-secondary" onclick="monitorRenderResetStep1()">Batal</button>
            <button class="admin-btn-danger" id="monitorResetConfirmBtn" onclick="monitorResetConfirm()">Ya, Reset</button>
        </div>`;
}

async function monitorResetConfirm() {
    const ctx = monitorResetCtx;
    if (!ctx) return;
    const btn = document.getElementById('monitorResetConfirmBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
    }
    try {
        const res = await fetch(API_BASE + 'admin/reset_peserta_progres.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: ctx.userId, target: ctx.target })
        });
        const result = await res.json();
        closeMonitorResetModal();
        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: result.message || 'Progres berhasil direset.', timer: 1500, showConfirmButton: false });
            loadMonitorPeserta();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        closeMonitorResetModal();
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

function closeMonitorResetModal() {
    closeAdminModal('monitorResetModalBackdrop');
    monitorResetCtx = null;
}

// =================================================================
// MANAJEMEN USER (edit nama/email/kata sandi peserta + hapus akun) --
// PAKAI ULANG monitorPesertaCache yang sama dengan halaman Monitor
// Peserta (lihat komentar di #page-user di admin.html), jadi tidak
// perlu endpoint/fetch data terpisah cuma buat menampilkan daftar ini.
// =================================================================
function renderUserManagementTable() {
    const container = document.getElementById('user-list-container');
    if (!container) return;

    if (monitorPesertaCache.length === 0) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-user-group"></i>Belum ada peserta yang mendaftar.</div>`;
        return;
    }

    const searchInput = document.getElementById('user-search-input');
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const list = monitorPesertaCache.filter(p =>
        !search || p.name.toLowerCase().includes(search) || p.email.toLowerCase().includes(search)
    );

    const rows = list.map(p => `
        <tr>
            <td>
                <div style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(p.name)}</div>
                <div style="color:#8a8fa3; font-size:12.5px;">${escapeHtmlAdmin(p.email)}</div>
            </td>
            <td style="width:100px;">
                <div class="admin-row-actions">
                    <button class="admin-icon-btn" onclick="openUserEditModal(${p.id})" title="Edit akun"><i class="fa-solid fa-pen"></i></button>
                    <button class="admin-icon-btn danger" onclick="openUserDeleteModal(${p.id})" title="Hapus akun"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="monitor-table-scroll">
            <table class="admin-table monitor-table">
                <thead>
                    <tr>
                        <th>Peserta</th>
                        <th>Aksi</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="2" class="monitor-empty-row">Tidak ada peserta yang cocok dengan pencarian saat ini.</td></tr>`}</tbody>
            </table>
        </div>`;
}

// --- Validasi real-time Email & Kata Sandi Baru di modal Edit Akun Peserta --
//     SAMA PERSIS logikanya (border merah/hijau + keterangan/ikon centang
//     real-time waktu diketik) dengan validasi di form Daftar (index.html,
//     lihat initValidasiRegister di js/main.js) & form Edit Profil peserta
//     (dashboard.js) -- memakai helper yang SAMA (cnValidasiFormatEmail/
//     cnValidasiKekuatanPassword/cnSetValidasiInput/cnSetValidasiHint/
//     cnToggleCheckIcon) yang sudah ada di js/transition.js (dimuat
//     bersama di semua halaman admin & peserta), supaya tidak duplikasi
//     aturan validasinya. Listener-nya dipasang SEKALI saja lewat
//     initUserEditFormValidasi() (dipanggil dari auth guard IIFE di atas)
//     karena elemennya sudah ada di DOM sejak admin.html dimuat (modalnya
//     cuma disembunyikan lewat CSS, bukan dirender ulang tiap dibuka). ---
const CN_USER_EDIT_PASSWORD_HINT_DEFAULT = 'Minimal 8 karakter, kombinasi huruf & angka.';

function initUserEditFormValidasi() {
    const emailEl = document.getElementById('f-user-email');
    const emailHintEl = document.getElementById('f-user-email-hint');
    const emailCheckEl = document.getElementById('f-user-email-check');
    const passwordEl = document.getElementById('f-user-password');
    const passwordHintEl = document.getElementById('f-user-password-hint');
    if (!emailEl || !passwordEl) return;

    emailEl.addEventListener('input', function () {
        const val = emailEl.value.trim();
        if (!val) {
            cnSetValidasiInput(emailEl, null);
            cnSetValidasiHint(emailHintEl, '', null);
            cnToggleCheckIcon(emailCheckEl, false);
            return;
        }
        const valid = cnValidasiFormatEmail(val);
        cnSetValidasiInput(emailEl, valid);
        cnSetValidasiHint(emailHintEl, valid ? '' : 'Format email tidak valid', valid);
        cnToggleCheckIcon(emailCheckEl, valid);
    });

    passwordEl.addEventListener('input', function () {
        const val = passwordEl.value;
        if (!val) {
            cnSetValidasiInput(passwordEl, null);
            cnSetValidasiHint(passwordHintEl, CN_USER_EDIT_PASSWORD_HINT_DEFAULT, null);
            return;
        }
        const pesanKesalahan = cnValidasiKekuatanPassword(val);
        cnSetValidasiInput(passwordEl, !pesanKesalahan);
        cnSetValidasiHint(passwordHintEl, pesanKesalahan || 'Kata sandi memenuhi syarat', !pesanKesalahan);
    });
}

// Dipanggil tiap modal dibuka -- supaya tanda merah/hijau dari percobaan
// edit peserta SEBELUMNYA tidak nyangkut di peserta yang baru dibuka.
function resetUserEditFormValidasi() {
    const emailEl = document.getElementById('f-user-email');
    const emailHintEl = document.getElementById('f-user-email-hint');
    const emailCheckEl = document.getElementById('f-user-email-check');
    const passwordEl = document.getElementById('f-user-password');
    const passwordHintEl = document.getElementById('f-user-password-hint');
    cnSetValidasiInput(emailEl, null);
    cnSetValidasiHint(emailHintEl, '', null);
    cnToggleCheckIcon(emailCheckEl, false);
    cnSetValidasiInput(passwordEl, null);
    cnSetValidasiHint(passwordHintEl, CN_USER_EDIT_PASSWORD_HINT_DEFAULT, null);
}

// --- Edit akun peserta (nama/email/kata sandi) ---
function openUserEditModal(userId) {
    const peserta = monitorPesertaCache.find(p => p.id === userId);
    if (!peserta) return;

    document.getElementById('f-user-id').value = peserta.id;
    document.getElementById('f-user-name').value = peserta.name;
    document.getElementById('f-user-email').value = peserta.email;
    document.getElementById('f-user-password').value = '';
    resetUserEditFormValidasi();

    const errorEl = document.getElementById('userEditFormError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    openAdminModal('userEditModalBackdrop');
}

function closeUserEditModal() {
    closeAdminModal('userEditModalBackdrop');
}

async function submitUserEditForm(event) {
    event.preventDefault();

    const userId = document.getElementById('f-user-id').value;
    const name = document.getElementById('f-user-name').value.trim();
    const emailEl = document.getElementById('f-user-email');
    const email = emailEl.value.trim();
    const emailHintEl = document.getElementById('f-user-email-hint');
    const passwordEl = document.getElementById('f-user-password');
    const password = passwordEl.value;
    const passwordHintEl = document.getElementById('f-user-password-hint');

    const errorEl = document.getElementById('userEditFormError');
    const submitBtn = document.getElementById('userEditSubmitBtn');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    // --- Validasi format email & kekuatan kata sandi di sisi browser
    //     dulu (SAMA PERSIS aturannya dengan form Daftar/Edit Profil
    //     peserta) sebelum kirim ke server -- supaya admin tidak perlu
    //     menunggu respons server cuma buat tahu formatnya salah. Kata
    //     sandi boleh dikosongkan (berarti tidak diganti), jadi kekuatannya
    //     cuma dicek kalau memang diisi. ---
    if (!cnValidasiFormatEmail(email)) {
        cnSetValidasiInput(emailEl, false);
        cnSetValidasiHint(emailHintEl, 'Format email tidak valid', false);
        emailEl.focus();
        return;
    }
    if (password) {
        const pesanKesalahanPassword = cnValidasiKekuatanPassword(password);
        if (pesanKesalahanPassword) {
            cnSetValidasiInput(passwordEl, false);
            cnSetValidasiHint(passwordHintEl, pesanKesalahanPassword, false);
            passwordEl.focus();
            return;
        }
    }

    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...';

    try {
        const res = await fetch(API_BASE + 'admin/update_peserta.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, name, email, password })
        });
        const result = await res.json();
        if (result.status === 'success') {
            closeUserEditModal();
            Swal.fire({ icon: 'success', title: 'Berhasil', text: result.message || 'Akun peserta berhasil diperbarui.', timer: 1500, showConfirmButton: false });
            loadMonitorPeserta();
        } else if (errorEl) {
            errorEl.textContent = result.message || 'Terjadi kesalahan. Coba lagi.';
            errorEl.style.display = '';
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = 'Tidak bisa terhubung ke server. Periksa koneksi internet dan coba lagi.';
            errorEl.style.display = '';
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }
}

// --- Hapus akun peserta -- satu tahap konfirmasi saja (bukan dua tahap
//     seperti Reset Progres, karena tidak ada "bagian" yang perlu dipilih:
//     seluruh akun & progresnya langsung terhapus sekaligus lewat CASCADE
//     di database). Context (id peserta yang mau dihapus) disimpan di
//     userDeleteTargetId, mengikuti pola monitorResetCtx di atas. ---
let userDeleteTargetId = null;

function openUserDeleteModal(userId) {
    const peserta = monitorPesertaCache.find(p => p.id === userId);
    if (!peserta) return;

    userDeleteTargetId = userId;
    document.getElementById('userDeleteTitle').textContent = `Hapus akun ${peserta.name}?`;
    openAdminModal('userDeleteModalBackdrop');
}

function closeUserDeleteModal() {
    closeAdminModal('userDeleteModalBackdrop');
    userDeleteTargetId = null;
}

async function confirmUserDelete() {
    if (!userDeleteTargetId) return;
    const btn = document.getElementById('userDeleteConfirmBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
    }
    try {
        const res = await fetch(API_BASE + 'admin/delete_peserta.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userDeleteTargetId })
        });
        const result = await res.json();
        closeUserDeleteModal();
        if (result.status === 'success') {
            Swal.fire({ icon: 'success', title: 'Berhasil', text: result.message || 'Akun peserta berhasil dihapus.', timer: 1500, showConfirmButton: false });
            loadMonitorPeserta();
        } else {
            Swal.fire({ icon: 'error', title: 'Gagal', text: result.message || 'Terjadi kesalahan.' });
        }
    } catch (err) {
        closeUserDeleteModal();
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
    }
}

// --- Modal Detail Peserta (rincian jawaban per soal + progres per bab) ---
async function openMonitorDetailModal(userId) {
    document.getElementById('monitorDetailName').textContent = 'Memuat...';
    document.getElementById('monitorDetailEmail').textContent = '';
    document.getElementById('monitorDetailBody').innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat detail...</div>`;
    openAdminModal('monitorDetailModalBackdrop');

    try {
        const res = await fetch(API_BASE + 'admin/get_peserta_detail.php?user_id=' + userId);
        const result = await res.json();
        if (result.status !== 'success') {
            document.getElementById('monitorDetailBody').innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat detail.')}</div>`;
            return;
        }
        renderMonitorDetail(result.data);
    } catch (err) {
        document.getElementById('monitorDetailBody').innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
    }
}

function closeMonitorDetailModal() {
    closeAdminModal('monitorDetailModalBackdrop');
}

// Data peserta yang sedang ditampilkan di modal Detail Monitor Peserta --
// disimpan di sini (bukan cuma dipakai sekali saat render) supaya tombol
// "Lihat" (Tes Diagnostik/Final Tryout/tiap Bab) bisa membuka dialog
// rincian belakangan tanpa perlu menyisipkan seluruh data JSON ke atribut
// onclick (rawan rusak kalau ada tanda kutip di teks soal/jawaban).
let monitorDetailDataAktif = null;

/**
 * Tampilkan rincian (pembahasan jawaban / riwayat percobaan) di dialog
 * BIASA (modal .admin-modal-backdrop, BUKAN SweetAlert2) yang tampil DI
 * ATAS modal Detail Peserta -- lihat #monitorReviewModalBackdrop di
 * admin.html & z-index-nya di admin.css. Dipakai bersama oleh SEMUA
 * tombol "Lihat" di modal Detail: Tes Diagnostik, Final Tryout, ataupun
 * tiap baris Bab (Percobaan & Skor Terakhir).
 */
// showBackToTop: true kalau dialog ini isinya rincian jawaban (Tes
// Diagnostik/Final Tryout/Skor Terakhir Bab -- bisa panjang, banyak
// kartu soal) sehingga tombol "kembali ke atas" berguna; sengaja TIDAK
// diaktifkan untuk dialog Riwayat Percobaan (isinya cuma tabel ringkas,
// jarang butuh discroll jauh).
function monitorOpenReviewModal(title, bodyHtml, showBackToTop) {
    document.getElementById('monitorReviewTitle').textContent = title;
    document.getElementById('monitorReviewBody').innerHTML = bodyHtml;
    openAdminModal('monitorReviewModalBackdrop');
    monitorSetupReviewBackToTop(!!showBackToTop);
}

function closeMonitorReviewModal() {
    closeAdminModal('monitorReviewModalBackdrop');
    monitorTeardownReviewBackToTop();
    // Lepas lagi pelebaran khusus dialog "Semua Nilai Peserta" (lihat
    // monitorOpenAllScoresModal) supaya dialog lain yang pakai modal yang
    // sama balik ke lebar normal.
    const modalEl = document.querySelector('#monitorReviewModalBackdrop .admin-modal');
    if (modalEl) modalEl.classList.remove('admin-modal-xl');
}

// =================================================================
// TOMBOL "KEMBALI KE ATAS" DI DIALOG REVIEW (Tes Diagnostik/Final
// Tryout/Skor Terakhir Bab)
// =================================================================
// Markup, kelas CSS, dan cara kerja cincin progresnya SENGAJA disamakan
// persis dengan tombol "back-to-top" di index.html/js/main.js (juga
// dipakai lagi di layar hasil kuis peserta, lihat initBackToTopPembahasan
// di js/quiz.js). Bedanya di sini: yang discroll BUKAN window, melainkan
// #monitorReviewModalBackdrop sendiri (dialog ini overflow-y:auto,
// lihat catatan di admin.css) -- karena itu progress ring & listener
// scroll-nya harus ditempelkan ke elemen backdrop, bukan ke window.
let monitorBackToTopUpdateFn = null;

function monitorSetupReviewBackToTop(showBackToTop) {
    const backdrop = document.getElementById('monitorReviewModalBackdrop');
    const btn = document.getElementById('monitorBackToTopBtn');
    const ring = document.getElementById('monitorBackToTopRing');
    monitorTeardownReviewBackToTop();
    if (!showBackToTop || !backdrop || !btn || !ring) {
        if (btn) btn.classList.remove('show');
        return;
    }

    // Kompensasi lebar scrollbar <html> yang hilang selama modal ini
    // terbuka (lihat catatan CN_SCROLLBAR_WIDTH di atas) supaya posisi
    // tombol persis sama dengan tombol "kembali ke atas" di index.html,
    // bukan bergeser lebih ke kanan.
    btn.style.right = (18 + CN_SCROLLBAR_WIDTH) + 'px';

    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference;

    function update() {
        const scrollTop = backdrop.scrollTop;
        const docHeight = backdrop.scrollHeight - backdrop.clientHeight;
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
        ring.style.strokeDashoffset = circumference * (1 - progress);
        btn.classList.toggle('show', scrollTop > 320);
    }

    monitorBackToTopUpdateFn = update;
    update();
    backdrop.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
}

function monitorTeardownReviewBackToTop() {
    const backdrop = document.getElementById('monitorReviewModalBackdrop');
    const btn = document.getElementById('monitorBackToTopBtn');
    if (monitorBackToTopUpdateFn) {
        if (backdrop) backdrop.removeEventListener('scroll', monitorBackToTopUpdateFn);
        window.removeEventListener('resize', monitorBackToTopUpdateFn);
        monitorBackToTopUpdateFn = null;
    }
    if (btn) {
        btn.classList.remove('show');
        btn.style.right = '';
    }
}

function monitorScrollReviewToTop() {
    const backdrop = document.getElementById('monitorReviewModalBackdrop');
    if (backdrop) backdrop.scrollTo({ top: 0, behavior: 'smooth' });
}

// Dipanggil dari klik badge di strip ringkasan cepat (lihat
// monitorRenderPembahasanHtml) -- scroll ke kartu soal yang bersangkutan
// di bawahnya, supaya admin bisa loncat langsung ke soal yang menarik
// perhatian (mis. yang salah) tanpa scroll manual satu-satu.
function monitorScrollToReviewSoal(idx) {
    const el = document.getElementById('monitor-review-soal-' + idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function monitorShowDiagnostikDialog() {
    if (!monitorDetailDataAktif || !monitorDetailDataAktif.diagnostik) return;
    monitorOpenReviewModal('Rincian Tes Diagnostik', monitorRenderPembahasanHtml(monitorDetailDataAktif.diagnostik.pembahasan), true);
}

function monitorShowTryoutDialog() {
    if (!monitorDetailDataAktif || !monitorDetailDataAktif.tryout) return;
    monitorOpenReviewModal('Rincian Final Tryout', monitorRenderPembahasanHtml(monitorDetailDataAktif.tryout.pembahasan), true);
}

// Daftar SEMUA percobaan Final Tryout peserta (baru relevan sejak Final
// Tryout boleh diulang) -- markup-nya pakai ulang monitorBuildRiwayatRowsHtml
// yang sama dengan riwayat kuis per bab di bawah.
function monitorShowTryoutRiwayatDialog() {
    if (!monitorDetailDataAktif || !monitorDetailDataAktif.tryout) return;
    monitorOpenReviewModal('Riwayat Percobaan Final Tryout', monitorBuildRiwayatRowsHtml(monitorDetailDataAktif.tryout.riwayat || [], MONITOR_TRYOUT_PASSING_SCORE));
}

function monitorShowBabSkorDialog(babId) {
    const b = monitorDetailDataAktif && monitorDetailDataAktif.bab.find(x => x.id === babId);
    if (!b || !b.percobaan_terakhir) return;
    monitorOpenReviewModal(`Pembahasan Kuis Bab ${b.nomor}`, monitorRenderPembahasanHtml(b.percobaan_terakhir.pembahasan), true);
}

function monitorShowBabRiwayatDialog(babId) {
    const b = monitorDetailDataAktif && monitorDetailDataAktif.bab.find(x => x.id === babId);
    if (!b) return;
    monitorOpenReviewModal(`Riwayat Percobaan Kuis Bab ${b.nomor}`, monitorBuildRiwayatRowsHtml(b.riwayat_kuis || [], b.nilai_minimal));
}

// Dipakai bareng untuk render rincian jawaban Tes Diagnostik, Final
// Tryout, MAUPUN Kuis per Bab -- ketiganya sama-sama menyimpan
// pembahasan dengan bentuk {pertanyaan, pilihan[], jawaban_user,
// jawaban_benar, benar, penjelasan} lewat cn_hitung_skor_soal_dinamis().
// Markup & kelasnya (quiz-review-*) DIBUAT SAMA PERSIS dengan
// buildPembahasanCardsHtml/renderQuizReviewOptions di js/quiz.js -- yaitu
// tampilan "Penjelasan Jawaban" yang peserta sendiri lihat begitu lulus
// materi/kuis -- supaya admin melihat rincian dengan tampilan yang identik
// (css/quiz.css dimuat khusus untuk ini di admin.html, lihat catatan di
// sana). TIDAK dipakai ulang langsung dari js/quiz.js karena admin.html
// tidak memuat file itu (beda konteks halaman) -- jadi markup-nya
// diduplikasi di sini, bukan dipanggil lintas file.
function monitorRenderPembahasanHtml(pembahasan) {
    if (!pembahasan || pembahasan.length === 0) {
        return `<p class="admin-form-hint">Rincian jawaban tidak tersedia untuk percobaan ini.</p>`;
    }

    // Strip ringkasan cepat -- satu badge bernomor per soal, hijau/merah
    // sesuai benar/salah, supaya admin bisa langsung lihat POLA soal mana
    // saja yang peserta salah TANPA scroll baca satu-satu dulu (berguna
    // waktu mantau banyak peserta sekaligus). Klik badge-nya langsung
    // scroll ke kartu soal itu di bawah, buat yang mau lihat detailnya
    // (jawaban peserta, kunci, penjelasan).
    const ringkasanHtml = pembahasan.map((soal, idx) => {
        const tidakDijawab = soal.jawaban_user === null || soal.jawaban_user === undefined;
        const cls = tidakDijawab ? 'belum' : (soal.benar ? 'benar' : 'salah');
        return `<button type="button" class="monitor-review-summary-badge ${cls}" onclick="monitorScrollToReviewSoal(${idx})" title="Soal ${idx + 1}: ${tidakDijawab ? 'Tidak Dijawab' : (soal.benar ? 'Benar' : 'Salah')}">${idx + 1}</button>`;
    }).join('');

    return `<div class="monitor-review-summary">${ringkasanHtml}</div><div class="quiz-review-list">${pembahasan.map((soal, idx) => {
        const tidakDijawab = soal.jawaban_user === null || soal.jawaban_user === undefined;
        const kunciId = soal.jawaban_benar;
        const dipilihId = soal.jawaban_user;

        const optionsHtml = (soal.pilihan || []).map((op, i) => {
            const isKunci = op.id === kunciId;
            const isDipilih = !tidakDijawab && op.id === dipilihId;

            // Tag teks ("Jawaban Peserta (Benar)"/"Kunci Jawaban"/"Jawaban
            // Peserta") SENGAJA tidak dipakai di sini (beda dengan
            // js/quiz.js versi peserta) -- admin cukup lihat warna
            // (opt-benar/opt-salah) saja untuk tahu mana kunci & mana
            // pilihan peserta, biar tampilannya lebih simpel.
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
                    <div class="quiz-review-opt-text">${sanitizeRichHtmlAdmin(op.teks)}</div>
                </div>`;
        }).join('');

        return `
        <div class="quiz-review-card ${soal.benar ? 'benar' : 'salah'}" id="monitor-review-soal-${idx}">
            <div class="quiz-review-top">
                <span class="quiz-review-badge ${soal.benar ? 'benar' : 'salah'}">
                    <i class="fa-solid ${soal.benar ? 'fa-check' : 'fa-xmark'}"></i> ${tidakDijawab ? 'Tidak Dijawab' : (soal.benar ? 'Benar' : 'Salah')}
                </span>
                <span class="quiz-review-number">Soal ${idx + 1}</span>
            </div>
            <div class="quiz-review-question">${sanitizeRichHtmlAdmin(soal.pertanyaan)}</div>
            <div class="quiz-review-options">${optionsHtml}</div>
            ${soal.penjelasan ? `
            <div class="quiz-review-explanation">
                <div class="quiz-review-explanation-title"><i class="fa-solid fa-lightbulb"></i> Penyelesaian</div>
                <div class="quiz-review-explanation-text">${sanitizeRichHtmlAdmin(soal.penjelasan)}</div>
            </div>` : ''}
        </div>`;
    }).join('')}</div>`;
}

// Daftar riwayat percobaan kuis satu bab, markup & kelasnya (quiz-riwayat-*)
// disamakan persis dengan buildRiwayatRowsHtml di js/quiz.js (tampilan
// yang peserta lihat sendiri di layar "Riwayat Percobaan"/sebelum "Coba
// Lagi") -- lihat catatan di monitorRenderPembahasanHtml soal kenapa
// markup-nya diduplikasi di sini alih-alih dipanggil lintas file.
function monitorBuildRiwayatRowsHtml(riwayat, nilaiMinimal) {
    if (!riwayat || riwayat.length === 0) {
        return `<p class="admin-form-hint">Belum ada percobaan.</p>`;
    }
    const rowsHtml = riwayat.map((r, i) => {
        const rowLulus = (nilaiMinimal === null || nilaiMinimal === undefined) || r.skor >= nilaiMinimal;
        return `
        <div class="quiz-riwayat-row">
            <div class="quiz-riwayat-row-left">
                <span class="quiz-riwayat-attempt-num">Percobaan ke-${riwayat.length - i}</span>
                <span class="quiz-riwayat-date">${monitorFormatTanggal(r.selesai_pada)}</span>
            </div>
            <div class="quiz-riwayat-row-right">
                <span class="quiz-riwayat-benar">${r.jumlah_benar}/${r.jumlah_soal} benar</span>
                <span class="quiz-riwayat-skor${rowLulus ? ' lulus' : ''}">${r.skor}</span>
            </div>
        </div>`;
    }).join('');
    return `<div class="quiz-riwayat-list-card" style="box-shadow:none; padding:0; margin:0;">${rowsHtml}</div>`;
}

function renderMonitorDetail(data) {
    monitorDetailDataAktif = data;
    document.getElementById('monitorDetailName').textContent = data.name;
    document.getElementById('monitorDetailEmail').textContent = data.email;
    document.getElementById('monitorDetailTerdaftar').innerHTML =
        `<i class="fa-solid fa-calendar-days"></i> Terdaftar: ${escapeHtmlAdmin(monitorFormatTanggal(data.terdaftar_pada))}`;

    const diagnostikSection = data.diagnostik ? `
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title">
                <i class="fa-solid fa-clipboard-question"></i> Tes Diagnostik
                <span class="monitor-status-pill selesai">Selesai</span>
            </div>
            <div class="monitor-detail-section-row">
                <p class="admin-form-hint monitor-detail-scoreline" style="margin:0;"><span>Skor ${data.diagnostik.skor} (${data.diagnostik.jumlah_benar}/${data.diagnostik.jumlah_soal})</span><span class="monitor-detail-scoreline-sep">&middot;</span><span>selesai ${monitorFormatTanggal(data.diagnostik.selesai_pada)}</span></p>
                <button type="button" class="monitor-detail-toggle-btn" onclick="monitorShowDiagnostikDialog()">Lihat</button>
            </div>
        </div>` : `
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-clipboard-question"></i> Tes Diagnostik <span class="monitor-status-pill belum">Belum Selesai</span></div>
        </div>`;

    // Final Tryout sekarang bisa dicoba berkali-kali, jadi tri-state
    // (belum pernah coba sama sekali / sudah coba tapi belum lulus /
    // sudah final-lulus) -- SAMA pola dengan statusKuisHtml per bab di
    // bawah -- bukan cuma binary ada/tidak-ada seperti sebelumnya (itu
    // dulu cocok waktu tryout masih single-attempt). data.tryout kalau
    // ada SELALU berisi percobaan TERAKHIR peserta (lihat
    // get_peserta_detail.php), "lulus" nentuin apakah itu sudah final.
    let tryoutSection;
    if (!data.tryout) {
        tryoutSection = `
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-file-circle-check"></i> Final Tryout <span class="monitor-status-pill belum">Belum Coba</span></div>
        </div>`;
    } else {
        const statusPillHtml = data.tryout.lulus
            ? '<span class="monitor-status-pill selesai">Selesai</span>'
            : '<span class="monitor-status-pill waktu_habis">Belum Lulus</span>';
        const lihatBtn = (data.tryout.pembahasan && data.tryout.pembahasan.length > 0)
            ? `<button type="button" class="monitor-detail-toggle-btn" onclick="monitorShowTryoutDialog()">Lihat</button>`
            : '';
        const riwayatBtn = data.tryout.jumlah_percobaan > 1
            ? `<button type="button" class="monitor-detail-toggle-btn" onclick="monitorShowTryoutRiwayatDialog()">Riwayat (${data.tryout.jumlah_percobaan}x)</button>`
            : '';
        tryoutSection = `
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title">
                <i class="fa-solid fa-file-circle-check"></i> Final Tryout
                ${statusPillHtml}
            </div>
            <div class="monitor-detail-section-row">
                <p class="admin-form-hint monitor-detail-scoreline" style="margin:0;"><span>Skor ${data.tryout.skor} (${data.tryout.jumlah_benar}/${data.tryout.jumlah_soal})</span><span class="monitor-detail-scoreline-sep">&middot;</span><span>percobaan terakhir ${monitorFormatTanggal(data.tryout.selesai_pada)}</span></p>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">${lihatBtn}${riwayatBtn}</div>
            </div>
        </div>`;
    }

    const babRows = data.bab.map(b => {
        const skorTerakhir = b.percobaan_terakhir ? `${b.percobaan_terakhir.skor} (${b.percobaan_terakhir.jumlah_benar}/${b.percobaan_terakhir.jumlah_soal})` : '–';
        const lihatSkorBtn = (b.percobaan_terakhir && b.percobaan_terakhir.pembahasan && b.percobaan_terakhir.pembahasan.length > 0)
            ? `<button type="button" class="monitor-detail-toggle-btn" onclick="monitorShowBabSkorDialog(${b.id})">Lihat</button>`
            : '';
        const lihatRiwayatBtn = (b.jumlah_percobaan_kuis > 0)
            ? `<button type="button" class="monitor-detail-toggle-btn" onclick="monitorShowBabRiwayatDialog(${b.id})">Lihat</button>`
            : '';
        let statusKuisHtml;
        if (!b.ada_kuis) {
            statusKuisHtml = '<span class="monitor-status-pill belum">Tanpa Kuis</span>';
        } else if (b.lulus) {
            statusKuisHtml = '<span class="monitor-status-pill selesai">Lulus</span>';
        } else if (b.jumlah_percobaan_kuis > 0) {
            statusKuisHtml = '<span class="monitor-status-pill waktu_habis">Belum Lulus</span>';
        } else {
            statusKuisHtml = '<span class="monitor-status-pill belum">Belum Coba</span>';
        }

        return `
        <tr>
            <td class="col-center col-no">${b.nomor}</td>
            <td class="col-bab">${sanitizeRichHtmlAdmin(b.judul)}</td>
            <td class="col-center">${b.materi_dibaca ? '<i class="fa-solid fa-check" style="color:var(--accent-color);"></i>' : '<i class="fa-solid fa-xmark" style="color:#b0b5c2;"></i>'}</td>
            <td class="col-center">${statusKuisHtml}</td>
            <td class="col-center"><div class="monitor-cell-stack"><span>${b.jumlah_percobaan_kuis}</span>${lihatRiwayatBtn}</div></td>
            <td class="col-center"><div class="monitor-cell-stack"><span>${skorTerakhir}</span>${lihatSkorBtn}</div></td>
        </tr>`;
    }).join('');

    document.getElementById('monitorDetailBody').innerHTML = `
        ${diagnostikSection}
        ${tryoutSection}
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-book-open"></i> Progres Materi</div>
            <div class="monitor-table-scroll">
                <table class="monitor-bab-progress-table">
                    <thead><tr><th class="col-center col-no">No</th><th class="col-bab">Bab</th><th class="col-center">Materi Dibaca</th><th class="col-center">Status Kuis</th><th class="col-center">Percobaan</th><th class="col-center">Skor Terakhir</th></tr></thead>
                    <tbody>${babRows}</tbody>
                </table>
            </div>
        </div>
    `;
}

// =================================================================
// HALAMAN: UMPAN BALIK (respons Form Umpan Balik & Evaluasi Dampak
// Program -- wajib diisi 1x oleh peserta sebelum mengunduh sertifikat,
// lihat api/get_sertifikat.php/api/submit_umpan_balik.php/umpan_balik.html)
// =================================================================

// Daftar label tiap pilihan (value -> label) -- SENGAJA DIDUPLIKASI dari
// UB_OPSI di js/umpan_balik.js (bukan di-share lewat <script> yang sama,
// karena admin.html tidak memuat umpan_balik.js sama sekali) supaya modal
// detail di sini bisa menampilkan LABEL yang gampang dibaca admin,
// bukan value mentah (mis. "mahasiswa_pemuda") -- diubah di SATU tempat
// kalau daftar pilihannya berubah, JANGAN LUPA samakan juga di
// js/umpan_balik.js & whitelist CN_UB_* di api/submit_umpan_balik.php.
const UB_ADMIN_OPSI = {
    kategori_peserta: [
        { value: 'siswa_remaja', label: "Siswa/Remaja (13-17 thn)" },
        { value: 'mahasiswa_pemuda', label: "Mahasiswa/Pemuda (18-22 thn)" },
        { value: 'umum_dewasa', label: "Umum/Dewasa (23+ thn)" },
        { value: 'pendidik_orang_tua', label: "Pendidik/Orang Tua" }
    ],
    jenis_kelamin: [
        { value: 'laki_laki', label: "Laki-laki" },
        { value: 'perempuan', label: "Perempuan" }
    ],
    durasi_medsos: [
        { value: 'kurang_1_jam', label: "< 1 Jam" },
        { value: '1_3_jam', label: "1 - 3 Jam" },
        { value: '3_5_jam', label: "3 - 5 Jam" },
        { value: 'lebih_5_jam', label: "> 5 Jam per hari" }
    ],
    platform_medsos: [
        { value: 'whatsapp', label: "WhatsApp" },
        { value: 'tiktok', label: "TikTok" },
        { value: 'instagram', label: "Instagram" },
        { value: 'youtube', label: "YouTube" },
        { value: 'x_twitter', label: "X (Twitter)" },
        { value: 'facebook', label: "Facebook" }
    ],
    hoaks_frekuensi: [
        { value: 'hampir_setiap_hari', label: "Hampir Setiap Hari" },
        { value: 'sering', label: "Sering" },
        { value: 'kadang_kadang', label: "Kadang-kadang" },
        { value: 'jarang', label: "Jarang" }
    ],
    pernah_tertipu: [
        { value: 'pernah', label: "Pernah" },
        { value: 'tidak_pernah', label: "Tidak Pernah" },
        { value: 'tidak_tahu', label: "Tidak Tahu" }
    ],
    // Cuma 3 pilihan -- SAMA PERSIS dengan UB_OPSI.tingkat_sebelum di
    // js/umpan_balik.js (SENGAJA disamakan dengan rubrik klasifikasi
    // Final Tryout yang sudah ada, lihat catatan di sana).
    tingkat_sebelum: [
        { value: 'unreflective', label: "Unreflective Thinker" },
        { value: 'challenged', label: "Challenged / Beginning Thinker" },
        { value: 'practicing_master', label: "Practicing hingga Master Thinker" }
    ],
    tindakan_nyata: [
        { value: 'stop_think', label: "Menahan diri dari langsung membagikan berita heboh (Prinsip Stop & Think)" },
        { value: 'cek_fakta_silang', label: "Melakukan cek fakta silang di Google Images/TurnBackHoax.id saat menerima isu mencurigakan" },
        { value: 'tegur_japri', label: "Menegur/meluruskan berita hoaks di grup hoaks secara santun melalui pesan pribadi (Japri)" },
        { value: 'hindari_ad_hominem', label: "Berani mengidentifikasi dan menghindari kecenderungan serangan pribadi (Ad Hominem) dalam diskusi medsos" },
        { value: 'jadi_agen_edukasi', label: "Menjadi agen edukasi literasi digital bagi teman, keluarga, atau komunitas sekitar" }
    ],
    format_media: [
        { value: 'aplikasi_interaktif', label: "Aplikasi Mobile Interaktif (Kuis, Game Edukasi & Simulation)" },
        { value: 'video_pendek', label: "Video Animasi Pendek (TikTok/Instagram Reels/YouTube Shorts)" },
        { value: 'podcast_audio', label: "Seri Podcast/Audio Overview Diskusi Kasus Hoaks Terkini" },
        { value: 'modul_cetak', label: "Modul Cetak Fisik/Buku Saku Ukuran Kompak" },
        { value: 'pelatihan_luring', label: "Pelatihan Luring (Tatap Muka)/Workshop Interaktif Komunitas" }
    ],
    fitur_baru: [
        { value: 'bot_whatsapp', label: "Bot WhatsApp/Mesin Otomatis Deteksi Cek Fakta Tautan & Gambar" },
        { value: 'bank_soal_sertifikat', label: "Bank Soal Kuis Tantangan Harian Berhadiah Lencana/Sertifikat Digital" },
        { value: 'forum_komunitas', label: "Forum Komunitas Duta Literasi Digital untuk Diskusi & Pelaporan Hoaks" },
        { value: 'panduan_etika', label: "Panduan Khusus Etika Berinternet untuk Anak Sekolah & Pendampingan Orang Tua" }
    ]
};
UB_ADMIN_OPSI.tingkat_sesudah = UB_ADMIN_OPSI.tingkat_sebelum;

// Daftar frasa Bahasa Inggris yang dimiringkan di label -- SENGAJA
// DIDUPLIKASI dari UB_FRASA_INGGRIS/ubItalicizeInggris() di
// js/umpan_balik.js (alasan duplikasi SAMA dengan UB_ADMIN_OPSI di atas:
// admin.html tidak memuat umpan_balik.js) supaya modal detail di admin
// menampilkan label yang KONSISTEN (istilah Inggris miring) dengan yang
// dilihat peserta sendiri waktu mengisi form-nya.
// Urutan & isi SAMA PERSIS dengan UB_FRASA_INGGRIS di js/umpan_balik.js
// (lihat catatan urutannya di sana -- frasa lebih spesifik duluan).
const UB_ADMIN_FRASA_INGGRIS = [
    'Challenged / Beginning Thinker',
    'Unreflective Thinker',
    'Master Thinker',
    'Practicing',
    'Stop & Think',
    'Ad Hominem'
];
function ubAdminItalicize(text) {
    let hasil = escapeHtmlAdmin(text);
    UB_ADMIN_FRASA_INGGRIS.forEach(frasa => {
        const frasaEscaped = escapeHtmlAdmin(frasa);
        hasil = hasil.split(frasaEscaped).join('<em>' + frasaEscaped + '</em>');
    });
    return hasil;
}

function ubAdminLabel(field, value) {
    const opsi = UB_ADMIN_OPSI[field];
    if (!opsi) return escapeHtmlAdmin(value ?? '-');
    const found = opsi.find(o => o.value === value);
    return ubAdminItalicize(found ? found.label : (value ?? '-'));
}

function ubAdminLabelArray(field, values) {
    if (!values || values.length === 0) return '<span style="color:#8a8fa3;">-</span>';
    const opsi = UB_ADMIN_OPSI[field] || [];
    return values.map(v => {
        const found = opsi.find(o => o.value === v);
        return `<span class="ub-admin-tag">${ubAdminItalicize(found ? found.label : v)}</span>`;
    }).join('');
}

async function loadUmpanBalikList() {
    const container = document.getElementById('ub-list-container');
    container.innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat data umpan balik...</div>`;

    try {
        const res = await fetch(API_BASE + 'admin/get_umpan_balik_list.php');
        const result = await res.json();
        if (result.status !== 'success') {
            container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat data.')}</div>`;
            return;
        }
        umpanBalikListCache = result.data.list;
        renderUmpanBalikTable();
    } catch (err) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
    }
}

function resetUmpanBalikFilter() {
    const el = document.getElementById('ub-search-input');
    if (el) el.value = '';
}

// SAMA POLA dengan monitorRowClick() -- di layar lebar (>=576px), klik
// baris mana aja langsung buka detail (tombol mata "Aksi" disembunyikan di
// layar itu lewat class ".monitor-row-detail-btn", lihat css/admin.css).
// Di layar SEMPIT (tampilan kartu mobile), klik barisnya SENGAJA tidak
// berbuat apa-apa -- wajib klik tombol mata yang muncul di kartu itu
// (di sebelah tombol unduh .xlsx) supaya jelas mana bagian yang bisa
// diklik, konsisten dengan monitorRowClick().
function ubRowClick(id) {
    if (window.innerWidth < 576) return;
    openUbDetailModal(id);
}

function renderUmpanBalikTable() {
    const container = document.getElementById('ub-list-container');

    if (umpanBalikListCache.length === 0) {
        container.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-comment-slash"></i>Belum ada peserta yang mengisi Form Umpan Balik.</div>`;
        return;
    }

    const q = (document.getElementById('ub-search-input').value || '').trim().toLowerCase();
    const list = umpanBalikListCache.filter(r =>
        !q || r.nama.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );

    const rows = list.map(r => `
        <tr class="monitor-row-clickable" onclick="ubRowClick(${r.id})" title="Klik untuk lihat detail jawaban">
            <td>
                <div style="font-weight:600; color:var(--primary-color);">${escapeHtmlAdmin(r.nama)}</div>
                <div style="color:#8a8fa3; font-size:12.5px;">${escapeHtmlAdmin(r.email)}</div>
            </td>
            <td>${monitorFormatTanggal(r.created_at)}</td>
            <td class="col-center ub-nps-cell">${r.nps}/10</td>
            <td class="ub-aksi-col" style="width:60px;">
                <div class="admin-row-actions" onclick="event.stopPropagation()">
                    <button class="admin-icon-btn monitor-row-detail-btn" onclick="openUbDetailModal(${r.id})" title="Lihat detail"><i class="fa-solid fa-eye"></i></button>
                    <button class="admin-icon-btn" onclick="exportUmpanBalikXlsx(${r.id})" title="Unduh umpan balik peserta ini (XLSX)"><i class="fa-solid fa-file-excel"></i></button>
                </div>
            </td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="monitor-table-scroll">
            <table class="admin-table monitor-table">
                <thead>
                    <tr>
                        <th>Peserta</th>
                        <th>Tanggal Isi</th>
                        <th class="col-center">NPS</th>
                        <th class="ub-aksi-col ub-aksi-header">Aksi</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="4" class="monitor-empty-row">Tidak ada respons yang cocok dengan pencarian.</td></tr>`}</tbody>
            </table>
        </div>
    `;
}

async function openUbDetailModal(id) {
    document.getElementById('ubDetailName').textContent = 'Memuat...';
    document.getElementById('ubDetailEmail').textContent = '';
    document.getElementById('ubDetailTanggal').textContent = '';
    document.getElementById('ubDetailBody').innerHTML = `<div class="admin-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat detail...</div>`;
    openAdminModal('ubDetailModalBackdrop');

    try {
        const res = await fetch(API_BASE + 'admin/get_umpan_balik_detail.php?id=' + id);
        const result = await res.json();
        if (result.status !== 'success') {
            document.getElementById('ubDetailBody').innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtmlAdmin(result.message || 'Gagal memuat detail.')}</div>`;
            return;
        }
        renderUbDetail(result.data);
    } catch (err) {
        document.getElementById('ubDetailBody').innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>Tidak bisa terhubung ke server.</div>`;
    }
}

function closeUbDetailModal() {
    closeAdminModal('ubDetailModalBackdrop');
}

function renderUbDetail(d) {
    document.getElementById('ubDetailName').textContent = d.nama;
    document.getElementById('ubDetailEmail').textContent = d.email;
    document.getElementById('ubDetailTanggal').textContent = 'Diisi pada ' + monitorFormatTanggal(d.created_at);

    // Baris kecil "label : nilai" (dipakai buat semua field pilihan
    // tunggal/isian teks pendek Bagian I & IV) -- SATU helper lokal biar
    // tidak menduplikasi markup yang sama 10+ kali di bawah.
    const baris = (label, valueHtml) => `
        <div class="ub-admin-row">
            <span class="ub-admin-row-label">${escapeHtmlAdmin(label)}</span>
            <span class="ub-admin-row-value">${valueHtml}</span>
        </div>`;

    const skalaBadge = (n) => `<span class="ub-admin-skala-badge">${n}/5</span>`;

    document.getElementById('ubDetailBody').innerHTML = `
        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-user"></i> Bagian I &middot; Profil Responden &amp; Kebiasaan Digital</div>
            ${baris('Kategori Peserta', ubAdminLabel('kategori_peserta', d.kategori_peserta))}
            ${baris('Jenis Kelamin', ubAdminLabel('jenis_kelamin', d.jenis_kelamin))}
            ${baris('Domisili', escapeHtmlAdmin(d.domisili))}
            ${baris('Durasi Medsos/Hari', ubAdminLabel('durasi_medsos', d.durasi_medsos))}
            ${baris('Platform Utama', ubAdminLabelArray('platform_medsos', d.platform_medsos))}
            ${baris('Frekuensi Menemukan Hoaks', ubAdminLabel('hoaks_frekuensi', d.hoaks_frekuensi))}
            ${baris('Pernah Tertipu Hoaks', ubAdminLabel('pernah_tertipu', d.pernah_tertipu))}
        </div>

        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-book-open"></i> Bagian II &middot; Efektivitas Materi (Skala 1-5)</div>
            ${baris('Bab 1', skalaBadge(d.bab1_skor))}
            ${baris('Bab 2', skalaBadge(d.bab2_skor))}
            ${baris('Bab 3', skalaBadge(d.bab3_skor))}
            ${baris('Bab 4', skalaBadge(d.bab4_skor))}
            ${baris('Bab 5', skalaBadge(d.bab5_skor))}
        </div>

        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-palette"></i> Bagian III &middot; Desain Media/Visual/Maskot (Skala 1-5)</div>
            ${baris('Daya Tarik Maskot', skalaBadge(d.maskot_skor))}
            ${baris('Desain Visual', skalaBadge(d.desain_skor))}
            ${baris('Studi Kasus', skalaBadge(d.studi_kasus_skor))}
            ${baris('Lembar Kerja', skalaBadge(d.lembar_kerja_skor))}
        </div>

        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-brain"></i> Bagian IV &middot; Self-Assessment Perubahan Perilaku</div>
            ${baris('Kepercayaan Diri Verifikasi', skalaBadge(d.kepercayaan_verifikasi))}
            ${baris('Tingkat Berpikir Kritis (Sebelum)', ubAdminLabel('tingkat_sebelum', d.tingkat_sebelum))}
            ${baris('Tingkat Berpikir Kritis (Sesudah)', ubAdminLabel('tingkat_sesudah', d.tingkat_sesudah))}
            ${baris('Tindakan Nyata', ubAdminLabelArray('tindakan_nyata', d.tindakan_nyata))}
        </div>

        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-lightbulb"></i> Bagian V &middot; Riset Kebutuhan Pengembangan</div>
            ${baris('Format Media Diinginkan', ubAdminLabelArray('format_media', d.format_media))}
            ${baris('Fitur Baru Diinginkan', ubAdminLabelArray('fitur_baru', d.fitur_baru))}
            ${baris('Skor NPS (Merekomendasikan)', `<span class="ub-admin-skala-badge">${d.nps}/10</span>`)}
        </div>

        <div class="monitor-detail-section">
            <div class="monitor-detail-section-title"><i class="fa-solid fa-comment-dots"></i> Bagian VI &middot; Saran, Kritik &amp; Kesan</div>
            ${baris('Materi Paling Bermanfaat', d.materi_bermanfaat ? escapeHtmlAdmin(d.materi_bermanfaat) : '<span style="color:#8a8fa3;">(tidak diisi)</span>')}
            ${baris('Kritik/Saran', d.kritik_saran ? escapeHtmlAdmin(d.kritik_saran) : '<span style="color:#8a8fa3;">(tidak diisi)</span>')}
            ${baris('Pesan & Kesan', d.pesan_kesan ? escapeHtmlAdmin(d.pesan_kesan) : '<span style="color:#8a8fa3;">(tidak diisi)</span>')}
        </div>
    `;
}

// Versi TEKS POLOS (bukan HTML) dari ubAdminLabel()/ubAdminLabelArray() --
// dipakai khusus buat isi sel .xlsx (ExcelJS butuh string biasa, bukan
// markup "<em>...</em>"/entity HTML), jadi TIDAK lewat ubAdminItalicize()
// atau escapeHtmlAdmin() sama sekali.
function ubPlainLabel(field, value) {
    const opsi = UB_ADMIN_OPSI[field];
    if (!opsi) return value ?? '-';
    const found = opsi.find(o => o.value === value);
    return found ? found.label : (value ?? '-');
}

function ubPlainLabelArray(field, values) {
    if (!values || values.length === 0) return '-';
    const opsi = UB_ADMIN_OPSI[field] || [];
    return values.map(v => {
        const found = opsi.find(o => o.value === v);
        return found ? found.label : v;
    }).join('; ');
}

// --- Export XLSX "Laporan Umpan Balik" (satu peserta) -- dipanggil dari
//     ikon Excel di kolom "Aksi" tiap baris tabel Umpan Balik (lihat
//     renderUmpanBalikTable()). Isinya SAMA dengan yang ditampilkan di
//     modal detail (lihat renderUbDetail): seluruh 6 Bagian pertanyaan,
//     dibangun dengan pola visual yang SAMA dengan
//     buildAndDownloadPesertaDetailXlsx() di atas (banner section
//     berwarna, baris "label : nilai"), supaya konsisten dengan laporan
//     XLSX Monitor Peserta yang sudah ada. ---
async function exportUmpanBalikXlsx(id) {
    if (typeof ExcelJS === 'undefined') {
        Swal.fire({ icon: 'error', title: 'Gagal memuat library Excel', text: 'Library ExcelJS gagal dimuat (kemungkinan koneksi internet bermasalah). Coba muat ulang halaman.' });
        return;
    }
    Swal.fire({ title: 'Menyiapkan laporan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_BASE + 'admin/get_umpan_balik_detail.php?id=' + id);
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal memuat data', text: result.message || 'Terjadi kesalahan.' });
            return;
        }
        await buildAndDownloadUmpanBalikXlsx(result.data);
        Swal.close();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Tidak bisa terhubung ke server.' });
    }
}

async function buildAndDownloadUmpanBalikXlsx(d) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Umpan Balik');
    const JUMLAH_KOLOM = 2; // tabel "label : nilai" cuma 2 kolom

    const tambahBarisMerge = (text, opts) => {
        const row = ws.addRow([text]);
        ws.mergeCells(row.number, 1, row.number, (opts && opts.kolom) || JUMLAH_KOLOM);
        row.getCell(1).font = Object.assign({ bold: true }, opts && opts.font);
        if (opts && opts.fill) {
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
            row.getCell(1).font.color = { argb: 'FFFFFFFF' };
        }
        row.getCell(1).alignment = { vertical: 'middle' };
        row.height = opts && opts.height ? opts.height : undefined;
        return row;
    };

    tambahBarisMerge(`Laporan Umpan Balik: ${d.nama}`, { font: { size: 14 }, height: 24 });
    tambahBarisMerge(`Email: ${d.email}`);
    tambahBarisMerge(`Diisi pada: ${monitorFormatTanggal(d.created_at)}`);
    // TIDAK ada ws.addRow([]) tambahan di sini -- cukup 1 baris kosong
    // sebagai pemisah sebelum "BAGIAN I", dan itu SUDAH otomatis
    // disediakan oleh tambahJudulBagian() di bawah (dipanggil sesaat
    // lagi buat cetak judul "BAGIAN I"), yang juga menambah satu baris
    // kosong sendiri sebelum tiap judul Bagian. Kalau baris kosong di
    // sini tetap ditambah juga, hasilnya 2 baris kosong menumpuk pas
    // khusus di celah "Diisi pada" -> "BAGIAN I" (beda dari celah antar
    // Bagian lain yang cuma 1 baris kosong).

    // 1 baris "label : nilai" per pertanyaan -- SATU helper lokal, sama
    // pola dengan renderUbDetail() di atas tapi hasilnya baris .xlsx,
    // bukan HTML.
    const tambahBaris = (label, nilai) => {
        const row = ws.addRow([label, nilai === '' || nilai === null || nilai === undefined ? '-' : nilai]);
        row.getCell(1).font = { bold: true };
        xlsxStyleDataRow(row);
    };

    const tambahJudulBagian = (judul) => {
        ws.addRow([]);
        tambahBarisMerge(judul, { fill: XLSX_WARNA_HEADER });
    };

    tambahJudulBagian('BAGIAN I - PROFIL RESPONDEN & KEBIASAAN DIGITAL');
    tambahBaris('Kategori Peserta', ubPlainLabel('kategori_peserta', d.kategori_peserta));
    tambahBaris('Jenis Kelamin', ubPlainLabel('jenis_kelamin', d.jenis_kelamin));
    tambahBaris('Domisili', d.domisili);
    tambahBaris('Durasi Medsos/Hari', ubPlainLabel('durasi_medsos', d.durasi_medsos));
    tambahBaris('Platform Utama', ubPlainLabelArray('platform_medsos', d.platform_medsos));
    tambahBaris('Frekuensi Menemukan Hoaks', ubPlainLabel('hoaks_frekuensi', d.hoaks_frekuensi));
    tambahBaris('Pernah Tertipu Hoaks', ubPlainLabel('pernah_tertipu', d.pernah_tertipu));

    tambahJudulBagian('BAGIAN II - EFEKTIVITAS MATERI (SKALA 1-5)');
    tambahBaris('Bab 1', `${d.bab1_skor}/5`);
    tambahBaris('Bab 2', `${d.bab2_skor}/5`);
    tambahBaris('Bab 3', `${d.bab3_skor}/5`);
    tambahBaris('Bab 4', `${d.bab4_skor}/5`);
    tambahBaris('Bab 5', `${d.bab5_skor}/5`);

    tambahJudulBagian('BAGIAN III - DESAIN MEDIA/VISUAL/MASKOT (SKALA 1-5)');
    tambahBaris('Daya Tarik Maskot', `${d.maskot_skor}/5`);
    tambahBaris('Desain Visual', `${d.desain_skor}/5`);
    tambahBaris('Studi Kasus', `${d.studi_kasus_skor}/5`);
    tambahBaris('Lembar Kerja', `${d.lembar_kerja_skor}/5`);

    tambahJudulBagian('BAGIAN IV - SELF-ASSESSMENT PERUBAHAN PERILAKU');
    tambahBaris('Kepercayaan Diri Verifikasi', `${d.kepercayaan_verifikasi}/5`);
    tambahBaris('Tingkat Berpikir Kritis (Sebelum)', ubPlainLabel('tingkat_sebelum', d.tingkat_sebelum));
    tambahBaris('Tingkat Berpikir Kritis (Sesudah)', ubPlainLabel('tingkat_sesudah', d.tingkat_sesudah));
    tambahBaris('Tindakan Nyata', ubPlainLabelArray('tindakan_nyata', d.tindakan_nyata));

    tambahJudulBagian('BAGIAN V - RISET KEBUTUHAN PENGEMBANGAN');
    tambahBaris('Format Media Diinginkan', ubPlainLabelArray('format_media', d.format_media));
    tambahBaris('Fitur Baru Diinginkan', ubPlainLabelArray('fitur_baru', d.fitur_baru));
    tambahBaris('Skor NPS (Merekomendasikan)', `${d.nps}/10`);

    tambahJudulBagian('BAGIAN VI - SARAN, KRITIK & KESAN');
    tambahBaris('Materi Paling Bermanfaat', d.materi_bermanfaat || '(tidak diisi)');
    tambahBaris('Kritik/Saran', d.kritik_saran || '(tidak diisi)');
    tambahBaris('Pesan & Kesan', d.pesan_kesan || '(tidak diisi)');

    xlsxTambahFooterDiunduh(ws, JUMLAH_KOLOM);
    xlsxAutoFitColumns(ws, 10, 70);
    ws.getColumn(1).width = 32; // kolom label dipaksa cukup lebar biar pertanyaan terpanjang tetap satu baris, tapi tidak ikut auto-fit (auto-fit di atas cuma pengaruh kolom yang belum di-set manual)

    const safeName = d.nama.replace(/[\\/:*?"<>|]/g, '').trim() || 'peserta';
    await xlsxDownloadWorkbook(wb, `umpan-balik-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Export XLSX "Laporan Keseluruhan Umpan Balik" -- matriks SEMUA
//     peserta yang sudah mengisi (1 baris per peserta, 1 kolom per
//     pertanyaan), isinya SAMA dengan yang ditampilkan per-peserta lewat
//     exportUmpanBalikXlsx()/renderUbDetail() tapi digabung jadi satu
//     tabel -- pola SAMA dengan exportMonitorPesertaXlsx() (matriks
//     semua peserta) dibanding buildAndDownloadPesertaDetailXlsx() (satu
//     peserta, bertingkat). Datanya diambil dari endpoint TERPISAH
//     (get_umpan_balik_all.php), BUKAN dari umpanBalikListCache -- cache
//     tabel cuma ringkasan (nama/email/NPS), tidak punya ke-27 kolom
//     isian yang dibutuhkan di sini. SELALU semua peserta (tidak ikut
//     pencarian yang lagi aktif di layar), sama seperti laporan
//     keseluruhan Monitor Peserta. ---
async function exportUmpanBalikKeseluruhanXlsx() {
    if (typeof ExcelJS === 'undefined') {
        Swal.fire({ icon: 'error', title: 'Gagal memuat library Excel', text: 'Library ExcelJS gagal dimuat (kemungkinan koneksi internet bermasalah). Coba muat ulang halaman.' });
        return;
    }
    Swal.fire({ title: 'Menyiapkan laporan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_BASE + 'admin/get_umpan_balik_all.php');
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal memuat data', text: result.message || 'Terjadi kesalahan.' });
            return;
        }
        if (result.data.length === 0) {
            Swal.close();
            Swal.fire({ icon: 'info', title: 'Belum ada data', text: 'Belum ada peserta yang mengisi Form Umpan Balik untuk diekspor.' });
            return;
        }
        await buildAndDownloadUmpanBalikKeseluruhanXlsx(result.data);
        Swal.close();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Tidak bisa terhubung ke server.' });
    }
}

async function buildAndDownloadUmpanBalikKeseluruhanXlsx(list) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Semua Umpan Balik', { views: [{ state: 'frozen', ySplit: 1 }] });

    const header = [
        'No', 'Peserta', 'Email', 'Tanggal Isi',
        'Kategori Peserta', 'Jenis Kelamin', 'Domisili', 'Durasi Medsos/Hari', 'Platform Utama', 'Frekuensi Menemukan Hoaks', 'Pernah Tertipu Hoaks',
        'Bab 1 (1-5)', 'Bab 2 (1-5)', 'Bab 3 (1-5)', 'Bab 4 (1-5)', 'Bab 5 (1-5)',
        'Daya Tarik Maskot (1-5)', 'Desain Visual (1-5)', 'Studi Kasus (1-5)', 'Lembar Kerja (1-5)',
        'Kepercayaan Diri Verifikasi (1-5)', 'Tingkat Berpikir Kritis (Sebelum)', 'Tingkat Berpikir Kritis (Sesudah)', 'Tindakan Nyata',
        'Format Media Diinginkan', 'Fitur Baru Diinginkan', 'Skor NPS (1-10)',
        'Materi Paling Bermanfaat', 'Kritik/Saran', 'Pesan & Kesan'
    ];
    xlsxStyleHeaderRow(ws.addRow(header));

    // Kolom yang berisi angka/skor -- dirata-tengah, sisanya (teks) biarkan
    // rata kiri (default) sama seperti exportMonitorPesertaXlsx().
    const kolomTengah = [1, 12, 13, 14, 15, 16, 17, 18, 19, 20, 26];

    list.forEach((d, i) => {
        const row = ws.addRow([
            i + 1, d.nama, d.email, monitorFormatTanggal(d.created_at),
            ubPlainLabel('kategori_peserta', d.kategori_peserta), ubPlainLabel('jenis_kelamin', d.jenis_kelamin), d.domisili, ubPlainLabel('durasi_medsos', d.durasi_medsos), ubPlainLabelArray('platform_medsos', d.platform_medsos), ubPlainLabel('hoaks_frekuensi', d.hoaks_frekuensi), ubPlainLabel('pernah_tertipu', d.pernah_tertipu),
            d.bab1_skor, d.bab2_skor, d.bab3_skor, d.bab4_skor, d.bab5_skor,
            d.maskot_skor, d.desain_skor, d.studi_kasus_skor, d.lembar_kerja_skor,
            d.kepercayaan_verifikasi, ubPlainLabel('tingkat_sebelum', d.tingkat_sebelum), ubPlainLabel('tingkat_sesudah', d.tingkat_sesudah), ubPlainLabelArray('tindakan_nyata', d.tindakan_nyata),
            ubPlainLabelArray('format_media', d.format_media), ubPlainLabelArray('fitur_baru', d.fitur_baru), d.nps,
            d.materi_bermanfaat || '(tidak diisi)', d.kritik_saran || '(tidak diisi)', d.pesan_kesan || '(tidak diisi)'
        ]);
        row.getCell(2).font = { bold: true }; // kolom Peserta (nama) dibold, sama seperti laporan keseluruhan Monitor Peserta
        kolomTengah.forEach((colIdx) => {
            row.getCell(colIdx).alignment = Object.assign({}, row.getCell(colIdx).alignment, { horizontal: 'center' });
        });
        if (i % 2 === 1) {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FB' } };
            });
        }
        xlsxStyleDataRow(row);
    });

    xlsxTambahFooterDiunduh(ws, header.length);
    xlsxAutoFitColumns(ws, 8, 45);
    ws.getColumn(1).width = 5; // kolom "No" dipaksa sempit, gak perlu ikut auto-fit

    await xlsxDownloadWorkbook(wb, `respon-form-umpan-balik-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Export CSV "Respon Form Umpan Balik" (semua peserta) -- SENGAJA
//     disamakan persis isinya dengan buildAndDownloadUmpanBalikKeseluruhanXlsx()
//     di atas (matriks SEMUA peserta x SEMUA pertanyaan, urutan kolom &
//     nilai SAMA), cuma beda format file (CSV polos vs XLSX bergaya) --
//     pola SAMA dengan exportMonitorPesertaCsv()/exportMonitorPesertaXlsx().
//     Kalau salah satu diubah strukturnya (kolom ditambah/dikurangi dst),
//     yang satu lagi SEBAIKNYA ikut disesuaikan juga biar isinya tetap
//     konsisten. BEDA dengan exportMonitorPesertaCsv() yang sinkron
//     (pakai cache yang sudah dimuat) -- di sini datanya diambil lewat
//     fetch tersendiri ke get_umpan_balik_all.php (sama seperti versi
//     XLSX-nya), jadi fungsinya async.
async function exportUmpanBalikCsv() {
    Swal.fire({ title: 'Menyiapkan laporan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const res = await fetch(API_BASE + 'admin/get_umpan_balik_all.php');
        const result = await res.json();
        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal memuat data', text: result.message || 'Terjadi kesalahan.' });
            return;
        }
        if (result.data.length === 0) {
            Swal.close();
            Swal.fire({ icon: 'info', title: 'Belum ada data', text: 'Belum ada peserta yang mengisi Form Umpan Balik untuk diekspor.' });
            return;
        }
        buildAndDownloadUmpanBalikCsv(result.data);
        Swal.close();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Tidak bisa terhubung ke server.' });
    }
}

function buildAndDownloadUmpanBalikCsv(list) {
    const csvEscape = (val) => {
        const s = String(val === null || val === undefined ? '' : val);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const header = [
        'No', 'Peserta', 'Email', 'Tanggal Isi',
        'Kategori Peserta', 'Jenis Kelamin', 'Domisili', 'Durasi Medsos/Hari', 'Platform Utama', 'Frekuensi Menemukan Hoaks', 'Pernah Tertipu Hoaks',
        'Bab 1 (1-5)', 'Bab 2 (1-5)', 'Bab 3 (1-5)', 'Bab 4 (1-5)', 'Bab 5 (1-5)',
        'Daya Tarik Maskot (1-5)', 'Desain Visual (1-5)', 'Studi Kasus (1-5)', 'Lembar Kerja (1-5)',
        'Kepercayaan Diri Verifikasi (1-5)', 'Tingkat Berpikir Kritis (Sebelum)', 'Tingkat Berpikir Kritis (Sesudah)', 'Tindakan Nyata',
        'Format Media Diinginkan', 'Fitur Baru Diinginkan', 'Skor NPS (1-10)',
        'Materi Paling Bermanfaat', 'Kritik/Saran', 'Pesan & Kesan'
    ];

    const rows = list.map((d, i) => [
        i + 1, d.nama, d.email, monitorFormatTanggal(d.created_at),
        ubPlainLabel('kategori_peserta', d.kategori_peserta), ubPlainLabel('jenis_kelamin', d.jenis_kelamin), d.domisili, ubPlainLabel('durasi_medsos', d.durasi_medsos), ubPlainLabelArray('platform_medsos', d.platform_medsos), ubPlainLabel('hoaks_frekuensi', d.hoaks_frekuensi), ubPlainLabel('pernah_tertipu', d.pernah_tertipu),
        d.bab1_skor, d.bab2_skor, d.bab3_skor, d.bab4_skor, d.bab5_skor,
        d.maskot_skor, d.desain_skor, d.studi_kasus_skor, d.lembar_kerja_skor,
        d.kepercayaan_verifikasi, ubPlainLabel('tingkat_sebelum', d.tingkat_sebelum), ubPlainLabel('tingkat_sesudah', d.tingkat_sesudah), ubPlainLabelArray('tindakan_nyata', d.tindakan_nyata),
        ubPlainLabelArray('format_media', d.format_media), ubPlainLabelArray('fitur_baru', d.fitur_baru), d.nps,
        d.materi_bermanfaat || '(tidak diisi)', d.kritik_saran || '(tidak diisi)', d.pesan_kesan || '(tidak diisi)'
    ].map(csvEscape).join(','));

    // BOM di awal ("﻿") supaya Excel mendeteksi encoding UTF-8 dengan benar
    // (kalau tidak, nama peserta yang ada karakter non-ASCII bisa tampil
    // rusak/mojibake waktu file-nya dibuka) -- sama seperti
    // exportMonitorPesertaCsv().
    const csvContent = '﻿' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respon-form-umpan-balik-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}