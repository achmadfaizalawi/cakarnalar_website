// =================================================================
// HALAMAN MATERI BAB - Cakar Nalar
// -----------------------------------------------------------------
// Menampilkan teks materi, video pembelajaran, dan/atau file PPT
// yang diatur admin lewat Kelola Materi Bab untuk satu bab. Kalau
// bab ini TIDAK punya kuis (ada_kuis = false), peserta otomatis
// dinyatakan lulus oleh server begitu endpoint ini dipanggil (lihat
// api/get_materi.php) -- halaman ini tinggal menampilkan itu dan
// mengarahkan kembali ke dashboard. Kalau ADA kuis, disediakan tombol
// untuk lanjut mengerjakannya di kuis.html.
// =================================================================
const API_BASE = 'api/';
let materiCurrentUser = null;
let materiBabId = null;
let materiSudahPernahKuis = false; // dari server (hasil_kuis) -- lihat sudahMulaiKuisBab()
let materiDurasiKuisMenit = null; // dari bab.durasi_kuis_menit -- lihat konfirmasiMulaiKuisBab()

(function initMateriPage() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        materiCurrentUser = JSON.parse(saved);
        if (!materiCurrentUser || !materiCurrentUser.id) throw new Error('invalid');
        if (materiCurrentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    materiBabId = parseInt(params.get('bab_id'), 10) || 0;

    if (!materiBabId) {
        cnGoTo('dashboard.html');
        return;
    }

    loadMateri();
})();

function revealMateriFooter() {
    document.body.classList.add('quiz-content-ready');
}

async function loadMateri() {
    try {
        const res = await fetch(API_BASE + 'get_materi.php?bab_id=' + materiBabId + '&user_id=' + materiCurrentUser.id);
        const result = await res.json();

        if (result.status !== 'success') {
            renderMateriLocked(result.message || 'Materi ini belum bisa diakses.');
            return;
        }

        renderMateri(result.data);
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' })
            .then(() => cnGoTo('dashboard.html'));
    }
}

function renderMateriLocked(message) {
    const container = document.getElementById('materi-content');
    container.innerHTML = `
        <div class="quiz-result-card">
            <div class="quiz-result-icon locked"><i class="fa-solid fa-lock"></i></div>
            <h3>Belum Bisa Diakses</h3>
            <p class="desc">${escapeHtmlMateri(message)}</p>
            <button class="quiz-result-back-btn" onclick="cnGoTo('dashboard.html')">
                Kembali ke Dashboard
            </button>
        </div>`;
    revealMateriFooter();
}

function renderMateri(bab) {
    const container = document.getElementById('materi-content');
    materiSudahPernahKuis = !!bab.sudah_pernah_kuis;
    materiDurasiKuisMenit = (bab.durasi_kuis_menit !== null && bab.durasi_kuis_menit !== undefined) ? bab.durasi_kuis_menit : null;

    // Video: mode "Upload File Video" (video_file_url) diprioritaskan
    // kalau ada -- server hanya akan mengisi salah satu (video_file_url
    // ATAU video_url), lihat catatan di api/get_materi.php.
    const videoHtml = bab.video_file_url
        ? renderMateriVideoFile(bab.video_file_url)
        : (bab.video_url ? renderMateriVideo(bab.video_url) : '');

    const tekstHtml = bab.konten_materi
        ? `<div class="materi-teks">${sanitizeRichHtmlMateri(bab.konten_materi)}</div>`
        : '';

    // File materi sekarang bisa lebih dari satu (lihat bab.file_materi).
    // Nama file ASLI-nya (mis. "cakar-nalar-bab1-fondasi-berpikir-kritis.pdf")
    // sengaja TIDAK ditampilkan ke peserta -- nama file itu urusan internal
    // admin, tidak perlu/penting dilihat peserta, cuma bikin kartunya
    // berantakan. Labelnya juga diganti dari "Bahan Presentasi" (terlalu
    // spesifik -- filenya bisa jadi PDF materi bacaan, bukan cuma slide
    // presentasi) jadi "File Materi" yang lebih umum, dinomori kalau
    // lebih dari satu file supaya tetap bisa dibedakan satu sama lain.
    const daftarFileMateri = Array.isArray(bab.file_materi) ? bab.file_materi : [];
    const pptHtml = daftarFileMateri.length > 0
        ? daftarFileMateri.map((file, i) => `
        <a class="materi-ppt-card" href="${file.url}" target="_blank" rel="noopener">
            <i class="fa-solid fa-file-lines"></i>
            <div>
                <div class="materi-ppt-title">${daftarFileMateri.length > 1 ? `File Materi ${i + 1}` : 'File Materi'}</div>
                <div class="materi-ppt-name">Klik untuk membuka</div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square materi-ppt-open-icon"></i>
        </a>`).join('')
        : '';

    const kosongHtml = (!videoHtml && !tekstHtml && !pptHtml) ? `
        <div class="materi-empty">
            <i class="fa-solid fa-inbox"></i>
            Materi untuk bab ini belum ditambahkan admin.
        </div>` : '';

    const nilaiMinimalHtml = (bab.nilai_minimal !== null && bab.nilai_minimal !== undefined)
        ? `<p class="materi-cta-nilai-minimal"><i class="fa-solid fa-bullseye"></i> Kuis ini punya nilai minimal <strong>${bab.nilai_minimal}</strong> -- kalau skormu di bawah itu, kamu perlu mengulang sampai lulus.</p>`
        : '';

    // Kalimat CTA utama sengaja dibuat pendek saja -- info nilai minimal
    // (kalau diisi admin) sudah dijelaskan sendiri di paragraf
    // nilaiMinimalHtml terpisah di bawah, dan info bab berikutnya sudah
    // cukup terlihat dari tombolnya sendiri, jadi tidak perlu diulang di
    // sini supaya tidak jadi satu kalimat panjang.
    const adaBabSelanjutnya = !!(bab.bab_selanjutnya);

    const ctaHtml = bab.ada_kuis ? `
        <div class="materi-cta">
            <p>Sudah selesai mempelajari materinya? Lanjutkan dengan mengerjakan kuis bab ini.</p>
            ${nilaiMinimalHtml}
            <button class="quiz-result-back-btn materi-cta-btn" onclick="konfirmasiMulaiKuisBab(${bab.id})">
                Kerjakan Kuis Bab Ini <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>` : `
        <div class="materi-cta materi-cta-nokuis">
            <p><i class="fa-solid fa-circle-check"></i> Bab ini tidak memiliki kuis. Kamu otomatis dinyatakan lulus
                begitu membuka materi ini${adaBabSelanjutnya ? ' -- bab berikutnya sudah terbuka' : ''}.</p>
            <button class="quiz-result-back-btn materi-cta-btn" onclick="cnGoTo('dashboard.html')">
                Kembali ke Dashboard
            </button>
        </div>`;

    container.innerHTML = `
        <div class="materi-header">
            <span class="materi-bab-badge">Bab ${bab.nomor}</span>
            <h2>${sanitizeRichHtmlMateri(bab.judul)}</h2>
            <p>${sanitizeRichHtmlMateri(bab.ringkasan)}</p>
        </div>
        ${videoHtml}
        ${tekstHtml}
        ${pptHtml}
        ${kosongHtml}
        ${ctaHtml}`;
    bungkusTabelScrollMateri(container);
    initGambarLightboxMateri(container);

    revealMateriFooter();
}

/**
 * Cek apakah peserta SUDAH PERNAH MEMBUKA/MENGERJAKAN kuis bab ini.
 * Kalau sudah, tombol "Kerjakan Kuis Bab Ini" tidak perlu konfirmasi
 * lagi -- peserta cuma mau MELANJUTKAN/MEMBUKA LAGI kuis yang sudah
 * jalan, bukan mulai dari nol, jadi peringatan "yakin mau mulai kuis
 * sekarang?" tidak relevan lagi buat kondisi ini.
 *
 * DUA sumber dicek, salah satu cukup:
 * 1. materiSudahPernahKuis -- dari server (tabel hasil_kuis, lihat
 *    api/get_materi.php), true kalau peserta SUDAH PERNAH SUBMIT kuis
 *    ini minimal sekali (lulus ataupun tidak). Ini PERMANEN, tidak ikut
 *    kehapus oleh apapun di browser.
 * 2. localStorage "cn_progress_kuis_<babId>_<userId>" (lihat
 *    quizProgressStorageKey()/saveQuizProgress() di quiz.js) -- untuk
 *    kondisi peserta SEDANG membuka/mengerjakan kuis tapi BELUM SEMPAT
 *    submit sama sekali (jadi belum tercatat di hasil_kuis).
 *
 * Sebelumnya CUMA localStorage yang dicek -- masalahnya key itu
 * DIHAPUS begitu peserta submit (lihat clearQuizProgress() di
 * js/quiz.js). Jadi peserta yang baru saja submit lalu langsung
 * "Kembali ke Dashboard" (bukan klik "Coba Lagi" dulu, yang akan
 * menulis ulang key-nya) akan kehilangan penanda ini, dan dialog
 * konfirmasi "Mulai Kuis Sekarang?" muncul lagi padahal sudah
 * berkali-kali mengerjakan kuisnya. Menambahkan sumber dari server
 * (permanen) menutup celah itu.
 */
function sudahMulaiKuisBab(babId) {
    if (materiSudahPernahKuis) return true;
    if (!materiCurrentUser) return false;
    try {
        return localStorage.getItem('cn_progress_kuis_' + babId + '_' + materiCurrentUser.id) !== null;
    } catch (e) {
        return false;
    }
}

/**
 * Tombol "Kerjakan Kuis Bab Ini" -- konfirmasi dulu sebelum benar-benar
 * pindah ke kuis.html, supaya peserta tidak "kepencet" tanpa sadar
 * (apalagi kuis ini wajib dikerjakan/dinyatakan lulus, dan kalau bab-nya
 * punya batas waktu, timer-nya langsung mulai berjalan begitu halaman
 * kuis dibuka). Kalau kuisnya sudah pernah dimulai (lihat
 * sudahMulaiKuisBab() di atas), langsung lanjut tanpa konfirmasi.
 */
async function konfirmasiMulaiKuisBab(babId) {
    if (sudahMulaiKuisBab(babId)) {
        cnGoTo('kuis.html?bab_id=' + babId);
        return;
    }

    // Kalimat waktu cuma disebutkan kalau bab ini memang punya batas waktu
    // kuis (bab.durasi_kuis_menit) -- kalau tidak, dihilangkan sama sekali
    // daripada berandai-andai ("kalau kuis ini punya batas waktu...").
    const teksBatasWaktu = materiDurasiKuisMenit
        ? ' Hitungan mundurnya langsung mulai begitu kuisnya dibuka.'
        : '';

    const konfirmasi = await Swal.fire({
        icon: 'question',
        title: 'Mulai Kuis Sekarang?',
        text: 'Pastikan kamu sudah selesai mempelajari materinya.' + teksBatasWaktu,
        showCancelButton: true,
        confirmButtonText: 'Ya, kerjakan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0C7A6E'
    });
    if (!konfirmasi.isConfirmed) return;
    cnGoTo('kuis.html?bab_id=' + babId);
}

/**
 * Ubah link YouTube (watch/share/shorts) jadi iframe embed yang responsif.
 * Kalau link videonya bukan dari YouTube (atau polanya tidak dikenali),
 * tampilkan sebagai tombol buka-di-tab-baru saja supaya tetap bisa
 * ditonton peserta tanpa perlu iframe.
 */
function renderMateriVideo(videoUrl) {
    const embedUrl = konversiYoutubeEmbed(videoUrl);
    if (embedUrl) {
        return `
        <div class="materi-video-wrap">
            <iframe src="${embedUrl}" title="Video Materi" frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>
        </div>`;
    }
    return `
        <a class="materi-ppt-card" href="${videoUrl}" target="_blank" rel="noopener">
            <i class="fa-solid fa-circle-play"></i>
            <div>
                <div class="materi-ppt-title">Video Materi</div>
                <div class="materi-ppt-name">Tonton di tab baru</div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square materi-ppt-open-icon"></i>
        </a>`;
}

/**
 * Video hasil UPLOAD admin (bukan link YouTube) -- dirender langsung
 * lewat elemen <video> bawaan browser (dengan kontrol play/pause/dll),
 * bukan iframe seperti mode link.
 *
 * controlsList="nodownload" menghilangkan opsi "Download" dari menu
 * titik-tiga bawaan browser (Chrome, Edge, dll) supaya peserta tidak
 * bisa langsung unduh file videonya dari situ.
 *
 * CATATAN: ini cuma menyembunyikan tombolnya di UI player standar --
 * bukan proteksi teknis yang benar-benar mencegah pengunduhan (video
 * tetap bisa diambil lewat DevTools/Network tab oleh yang niat).
 */
function renderMateriVideoFile(videoFileUrl) {
    return `
        <div class="materi-video-wrap">
            <video controls controlsList="nodownload" preload="metadata" src="${videoFileUrl}"></video>
        </div>`;
}

function konversiYoutubeEmbed(url) {
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

        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    } catch (e) {
        return null;
    }
}

/**
 * Bungkus tiap <table> hasil sanitizeRichHtmlMateri dengan div scroll
 * horizontal SENDIRI -- taruh "overflow-x: auto" langsung di elemen
 * <table> (seperti sebelumnya di css/materi.css) bikin browser mengabaikan
 * lebar kolom <col> dari initTableColumnResize()/sisipTabelMateri() di
 * admin.js (tabelnya jadi menyusut ikut isi, bukan memenuhi lebar kartu
 * materi). Dibungkus div terpisah begini, <table> aslinya tetap bisa
 * width:100% penuh mengikuti lebar kartu, sementara div pembungkusnya
 * yang menangani scroll di layar sempit.
 */
// Lebar konten ".materi-teks" di layar desktop (lihat .materi-main
// max-width:820px dikurangi padding kiri-kanan 28px di css/materi.css) --
// inilah lebar yang jadi acuan persentase kolom tabel (<col style=
// "width:N%">) waktu admin mengatur lebarnya. Dipakai sebagai min-width
// tabel supaya di layar sempit (HP) tabelnya TIDAK ikut mengecil dari
// ukuran itu -- kalau tidak muat, digeser (scroll), bukan diperas.
const MATERI_TABEL_LEBAR_DESKTOP = 740;

function bungkusTabelScrollMateri(container) {
    if (!container) return;
    container.querySelectorAll('table').forEach(table => {
        // table-layout:fixed + width:100% bikin kolom dipepetkan pas dengan
        // lebar kontainer kalau kontainernya lebih sempit dari lebar
        // desktop -- makanya batas minimalnya (SAMA seperti lebar penuh di
        // layar lebar) harus dipasang di elemen <table> itu sendiri supaya
        // wrapper scroll di bawah ini benar-benar bisa memicu scroll geser
        // saat tabelnya tidak muat di layar sempit.
        table.style.minWidth = MATERI_TABEL_LEBAR_DESKTOP + 'px';
        if (table.parentElement && table.parentElement.classList.contains('materi-table-scroll')) return;
        const wrap = document.createElement('div');
        wrap.className = 'materi-table-scroll';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    });
}

/**
 * Pasang klik-untuk-perbesar (lightbox) di tiap <img> hasil render teks
 * materi -- gambar di teks materi sengaja ditampilkan mengecil menyesuaikan
 * lebar kotak (lihat catatan di css/materi.css), jadi peserta perlu cara
 * untuk melihat versi lebih besar/jelasnya kalau perlu. Dipakai
 * "data-lightbox-ready" supaya kalau renderMateri() dipanggil ulang
 * (re-render), listener tidak dobel terpasang di gambar yang sama.
 */
function initGambarLightboxMateri(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(img => {
        if (img.dataset.lightboxReady) return;
        img.dataset.lightboxReady = '1';
        img.addEventListener('click', () => bukaLightboxGambarMateri(img.src, img.alt));
    });
}

function bukaLightboxGambarMateri(src, alt) {
    if (!src) return;
    Swal.fire({
        html: `<img src="${escapeHtmlMateri(src)}" alt="${escapeHtmlMateri(alt || '')}" class="materi-lightbox-img">`,
        showConfirmButton: false,
        showCloseButton: true,
        background: 'rgba(15, 23, 32, 0.95)',
        backdrop: 'rgba(10, 14, 20, 0.9)',
        width: 'auto',
        padding: '1.4em 1em',
        customClass: { popup: 'materi-lightbox-popup' },
    });
}

function escapeHtmlMateri(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Teks materi diinput admin lewat editor rich text (bold/italic/underline/
// daftar/heading/link/gambar/tabel) di Panel Admin, jadi dirender di sini
// sebagai HTML (bukan di-escape jadi teks polos). Tetap disaring dulu
// (cuma izinkan tag yang benar-benar dipakai editor itu) sebagai lapisan
// aman kedua, jaga-jaga kalau data di database pernah diubah lewat jalur
// lain di luar editor. Daftar tag & aturan atributnya HARUS disamakan
// persis dengan sanitizeRichHtmlAdmin (js/admin.js) dan sanitizeRichHtmlQuiz
// (js/quiz.js).
function sanitizeRichHtmlMateri(html) {
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
    // Perataan teks (rata kiri/tengah/kanan/kanan-kiri) -- lihat kontrol
    // "extended-only" khusus kotak teks materi di Panel Admin
    // (ensureRichToolbar di admin.js). Hanya 4 nilai baku ini yang lolos.
    function extractTextAlignStyle(el) {
        const a = (el && el.style && el.style.textAlign) || '';
        return (a === 'left' || a === 'center' || a === 'right' || a === 'justify') ? ('text-align:' + a) : null;
    }
    // Ukuran teks (dropdown "Ukuran teks", juga khusus kotak teks materi)
    // -- hanya nilai px wajar (8-96) yang lolos.
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