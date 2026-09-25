// =================================================================
// SERTIFIKAT PENYELESAIAN PROGRAM - Cakar Nalar
// -----------------------------------------------------------------
// Halaman ini murni MENAMPILKAN sertifikat (buat diunduh peserta lewat
// dialog print browser -- "Save as PDF") -- server (api/get_sertifikat.php)
// yang benar-benar MEMVALIDASI syarat kelulusan; halaman ini cuma
// merender apapun yang server balas.
// =================================================================

let sertifikatCurrentUser = null;

(function checkAuth() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        sertifikatCurrentUser = JSON.parse(saved);
        if (!sertifikatCurrentUser || !sertifikatCurrentUser.id) throw new Error('invalid');
        if (sertifikatCurrentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    muatSertifikat();

    // Begitu peserta pindah dari sini ke umpan_balik.html (lihat cabang
    // "perlu_umpan_balik" di muatSertifikat()) lalu menekan tombol "back"
    // browser/HP, halaman sertifikat.html ini SERING dipulihkan langsung
    // dari bfcache (back-forward cache) -- BUKAN dimuat ulang dari server
    // -- jadi kode IIFE ini TIDAK ikut jalan lagi, muatSertifikat() tidak
    // pernah dipanggil ulang, dan peserta cuma melihat skeleton loading
    // yang macet selamanya (kelihatan seperti "nyangkut" di halaman
    // sertifikat padahal belum berhak lihat sertifikatnya). Event
    // "pageshow" dengan persisted=true KHUSUS menandai kondisi dipulihkan
    // dari bfcache ini -- muatSertifikat() dipanggil ulang di situ supaya
    // pengecekan syaratnya selalu jalan lagi dengan data TERBARU, bukan
    // data/DOM beku dari kunjungan sebelumnya. Parameter "true" ditandai
    // di sini (bukan pemanggilan awal di atas) supaya muatSertifikat()
    // tahu ini kunjungan ulang lewat tombol back, BUKAN kunjungan
    // pertama -- lihat komentar di dalam muatSertifikat() kenapa itu
    // penting (arahkan ke dashboard.html, bukan balik ke umpan_balik.html
    // lagi).
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            muatSertifikat(true);
        }
    });
})();

/**
 * Tombol "Unduh Sertifikat (PDF)" -- generate & unduh file PDF LANGSUNG di
 * sisi klien (html2canvas men-screenshot tiap halaman sertifikat SATU-SATU,
 * lalu masing-masing ditempel jadi 1 halaman PDF sendiri lewat jsPDF),
 * TANPA lewat dialog cetak bawaan browser (window.print()) sama sekali.
 * Ini SENGAJA menggantikan cara lama (window.print()) -- cara lama itu
 * bergantung ke mesin cetak masing-masing browser/OS, dan riwayat
 * perbaikan sebelumnya sudah dua kali ketemu masalah beda hasil antara
 * laptop & HP gara-gara itu (halaman sertifikat kepotong jadi 2 +
 * orientasi kertas default Portrait di HP). Generate PDF sendiri di sini
 * membuat hasilnya SAMA PERSIS di semua perangkat, karena tidak lagi
 * bergantung ke pengaturan cetak bawaan masing-masing HP/browser --
 * sekaligus menghapus TOTAL kedua masalah itu (bukan cuma ditambal),
 * karena jalur window.print() & dialog cetaknya sama sekali tidak lagi
 * dilewati.
 *
 * SEBELUMNYA dicoba pakai library "html2pdf.js" (bungkusan siap pakai
 * yang men-screenshot SELURUH ketiga halaman jadi SATU canvas raksasa,
 * baru dipotong-potong sendiri jadi beberapa halaman PDF) -- TERNYATA di
 * sebagian HP/browser (kemungkinan besar ada batas ukuran maksimum
 * kanvas per browser, terutama di Safari/iOS -- lihat cerita di GitHub
 * issue html2canvas soal ini) canvas raksasa setinggi 3 halaman sekaligus
 * itu gagal digambar dengan benar, sebagian halaman PDF-nya jadi hitam
 * polos. Di sini SETIAP kotak .sertifikat-page discreenshot TERPISAH
 * (kanvasnya jadi jauh lebih kecil, cuma seukuran 1 halaman) baru
 * ditempel satu-satu jadi halaman PDF -- jauh lebih aman lintas
 * perangkat, karena tidak pernah butuh kanvas yang sangat besar.
 */
async function unduhSertifikatPDF() {
    const tombol = document.getElementById('sertifikat-unduh-btn');
    const wrap = document.getElementById('sertifikat-wrap');
    if (!tombol || !wrap) return;

    const labelAsli = tombol.innerHTML;
    tombol.disabled = true;
    tombol.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyiapkan PDF...';

    // Aktifkan layout ukuran cetak (lihat ".sertifikat-pdf-capture" di
    // css/sertifikat.css) supaya html2canvas men-screenshot ukuran A4
    // landscape yang benar (297mm x 210mm per halaman), BUKAN layout
    // auto-height buat tampilan layar biasa (yang di HP portrait jadi
    // sempit-tinggi, bukan landscape).
    wrap.classList.add('sertifikat-pdf-capture');
    // Beri browser waktu 2 frame buat benar-benar menerapkan perubahan
    // layout dari class di atas sebelum discreenshot -- tanpa jeda ini,
    // html2canvas kadang masih sempat men-screenshot ukuran LAMA (race
    // condition antara reflow CSS & mulainya proses screenshot).
    //
    // "document.fonts.ready" -- PENYEBAB PALING UMUM hasil unduhan
    // sedikit beda antar perangkat (font/ukuran teks kelihatan agak
    // beda tipis): font custom sertifikat ini ("Playfair Display",
    // "Poppins", ikon Font Awesome) dimuat dari Google Fonts/CDN secara
    // ASINKRON di background -- kalau peserta klik "Unduh" SEBELUM
    // font-nya benar-benar selesai dimuat (lebih sering kejadian di
    // koneksi HP yang lebih lambat/tidak stabil dibanding laptop),
    // html2canvas terlanjur men-screenshot pakai font PENGGANTI
    // sementara punya browser (ukuran huruf beda, walau bentuknya mirip)
    // -- BUKAN font aslinya, jadi hasilnya beda tipis dari laptop yang
    // (biasanya) keburu selesai memuat semua font duluan. Menunggu
    // "document.fonts.ready" dulu memastikan SEMUA font custom itu
    // sudah 100% siap dipakai SEBELUM proses screenshot dimulai --
    // dijamin sama persis di perangkat manapun, tidak peduli cepat/
    // lambat koneksinya.
    // Sama alasannya dengan font di atas -- logo (gambar <img>) juga
    // dimuat dari server secara asinkron. Kalaupun harusnya sudah lama
    // selesai (halaman ini baru bisa tampil kalau datanya sudah berhasil
    // dimuat), tunggu dulu SEMUA <img> di dalam sertifikat ini benar-
    // benar selesai (".complete") sebagai jaga-jaga tambahan, supaya
    // tidak ada kemungkinan logo kosong/belum sempat digambar di
    // screenshot pada koneksi yang sangat lambat.
    const tungguGambar = Array.from(wrap.querySelectorAll('img')).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    });

    await Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        ...tungguGambar,
        new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    ]);

    try {
        const namaBersih = (sertifikatCurrentUser && sertifikatCurrentUser.name)
            ? sertifikatCurrentUser.name.trim().replace(/[^a-zA-Z0-9]+/g, '_')
            : 'Cakar_Nalar';
        const namaFile = 'Sertifikat-' + namaBersih + '.pdf';

        // .sertifikat-page = tiap "kotak" sertifikat (halaman 1 utama,
        // halaman 2 rubrik, halaman 3 daftar materi) -- lihat
        // sertifikat.html. Screenshot & tempel SATU-SATU (bukan
        // sekaligus 1 kotak besar berisi semuanya) -- lihat komentar
        // panjang di atas kenapa ini penting.
        const halamanEls = wrap.querySelectorAll('.sertifikat-page');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

        // Opsi html2canvas dipakai berulang (screenshot "pemanasan" di
        // bawah + loop screenshot sungguhan) -- ditaruh di 1 variabel
        // supaya keduanya PERSIS sama, bukan disalin manual 2x.
        const opsiCapture = {
            // "scale: 2" -- resolusi screenshot digandakan supaya teks &
            // garis di PDF-nya tetap tajam (tidak buram/pecah), khususnya
            // dari layar HP yang rapat pixel-nya (HiDPI/retina). Karena
            // discreenshot SATU HALAMAN sekaligus (bukan 3 halaman jadi
            // satu), ukuran kanvas hasil scale:2 ini masih jauh di bawah
            // batas kanvas browser manapun.
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            // "windowWidth"/"windowHeight" -- BUKAN ukuran hasil PDF-nya
            // (itu urusan jsPDF di bawah), tapi ukuran "jendela virtual"
            // yang dipakai html2canvas KHUSUS buat menghitung unit vw/vh
            // (dipakai di banyak ukuran font/padding lewat clamp(...vw...)
            // di css/sertifikat.css) -- TANPA ini, vw/vh dihitung dari
            // ukuran layar ASLI perangkat peserta (mis. 390px di HP
            // sempit), padahal kotak .sertifikat-page yang discreenshot
            // sudah dipaksa selebar 297mm (~1122px, lihat
            // .sertifikat-pdf-capture) -- hasilnya teks/logo/padding jadi
            // KETERLALU KECIL & banyak ruang kosong di PDF yang diunduh
            // dari HP. Angka di bawah ini PERSIS ukuran fisik 297mm x
            // 210mm dikonversi ke px (96dpi, standar CSS) -- SAMA untuk
            // laptop maupun HP.
            windowWidth: 1123,
            windowHeight: 794,
            // "scrollX/scrollY: 0" -- perbaikan yang umum diperlukan buat
            // html2canvas di HP: TANPA ini, html2canvas kadang ikut
            // memperhitungkan posisi scroll halaman ASLI peserta saat
            // tombol diklik (mis. kalau peserta sempat scroll turun dulu
            // sebelum klik Unduh) ke dalam hasil screenshot-nya, jadi
            // isinya kelihatan "geser" dari posisi seharusnya (padahal
            // elemen yang discreenshot sendiri tidak pindah). Dipaksa 0
            // supaya screenshot SELALU dihitung dari pojok kiri-atas
            // elemennya sendiri, tidak peduli peserta sedang scroll di
            // posisi mana.
            scrollX: 0,
            scrollY: 0
        };

        // SCREENSHOT "PEMANASAN" -- ketemu lewat perbandingan piksel:
        // perisai watermark (.sertifikat-decor, ikon Font Awesome besar
        // 200px) SERING tergambar LEBIH KECIL khusus di halaman PERTAMA
        // yang discreenshot (halaman 1), padahal ukurannya (font-size)
        // sama persis 200px di ketiga halaman & posisinya (right/bottom)
        // juga sama persis relatif ke bingkainya -- dicek langsung lewat
        // getBoundingClientRect() di DOM, hasilnya identik untuk semua
        // halaman. Jadi bukan soal CSS/posisi, tapi soal MESIN RENDER
        // internal html2canvas sendiri: glyph ikon custom-font BESAR
        // seperti ini sepertinya baru benar-benar "dipanaskan"/
        // dirasterisasi dengan akurat oleh html2canvas pas PERTAMA KALI
        // ia menggambarnya -- document.fonts.ready cuma menjamin BROWSER
        // sendiri sudah siap pakai font-nya, BUKAN menjamin mesin render
        // internal html2canvas ikut "siap" dari percobaan pertama.
        // Makanya di sini SATU KALI screenshot halaman pertama dilakukan
        // dulu sebagai pemanasan (hasilnya dibuang total, tidak dipakai
        // buat PDF) SEBELUM loop screenshot yang sesungguhnya mulai --
        // begitu loop di bawah jalan, mesin render html2canvas-nya sudah
        // "hangat", jadi perisai watermark di halaman 1 pun ikut tergambar
        // dengan ukuran & posisi yang sama persis dengan halaman 2 & 3.
        if (halamanEls.length) {
            await html2canvas(halamanEls[0], opsiCapture);
        }

        for (let i = 0; i < halamanEls.length; i++) {
            const canvas = await html2canvas(halamanEls[i], opsiCapture);
            const gambar = canvas.toDataURL('image/jpeg', 0.98);
            if (i > 0) pdf.addPage('a4', 'landscape');
            pdf.addImage(gambar, 'JPEG', 0, 0, 297, 210);
        }

        pdf.save(namaFile);
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Gagal Membuat PDF',
            text: 'Terjadi kesalahan saat menyiapkan file PDF. Coba lagi, atau muat ulang halaman ini dulu.',
            confirmButtonColor: '#0C7A6E'
        });
    } finally {
        wrap.classList.remove('sertifikat-pdf-capture');
        tombol.disabled = false;
        tombol.innerHTML = labelAsli;
    }
}

function tampilkanErrorSertifikat(pesan) {
    document.getElementById('sertifikat-status').innerHTML = `
        <div class="quiz-result-card">
            <div class="quiz-result-icon locked"><i class="fa-solid fa-lock"></i></div>
            <h3>Sertifikat Belum Tersedia</h3>
            <p class="desc">${escapeHtmlSertifikat(pesan)}</p>
            <button class="quiz-result-back-btn" onclick="cnGoTo('dashboard.html')">Kembali ke Dashboard</button>
        </div>`;
}

async function muatSertifikat(dariBfcache) {
    try {
        const res = await fetch('api/get_sertifikat.php?user_id=' + sertifikatCurrentUser.id);
        const result = await res.json();

        // Server bilang syarat 1-3 (Tes Diagnostik/semua Bab/Final Tryout)
        // sudah lengkap TAPI Form Umpan Balik belum pernah diisi (WAJIB 1x,
        // lihat api/get_sertifikat.php & api/submit_umpan_balik.php).
        if (result.status === 'perlu_umpan_balik') {
            // dariBfcache true artinya peserta baru saja MENINGGALKAN
            // umpan_balik.html (dialihkan ke sana oleh cabang ini juga,
            // lihat bawah) lalu menekan tombol "back" browser/HP -- kalau
            // di sini masih diarahkan ke umpan_balik.html lagi (ditambah
            // alert-nya diulang), rasanya jadi "muter-muter" balik lagi ke
            // halaman yang baru saja ditinggalkan. Langsung arahkan ke
            // dashboard.html saja, SAMA seperti link "Kembali ke Dashboard"
            // di halaman ini -- tanpa alert lagi.
            if (dariBfcache) {
                cnGoTo('dashboard.html');
                return;
            }
            // Kunjungan pertama (bukan lewat tombol back) -- kasih tahu
            // dulu lewat alert (supaya peserta tidak bingung kenapa
            // tiba-tiba dialihkan, bukan langsung lihat sertifikatnya),
            // BARU arahkan ke halamannya begitu tombol alert-nya diklik.
            await Swal.fire({
                icon: 'info',
                title: 'Isi Form Umpan Balik Dulu, Yuk',
                text: 'Sebelum bisa melihat & mengunduh sertifikat, kamu wajib mengisi Form Umpan Balik & Evaluasi Dampak Program terlebih dahulu, cukup sekali saja.',
                confirmButtonText: 'Isi Sekarang',
                confirmButtonColor: '#0C7A6E'
            });
            cnGoTo('umpan_balik.html');
            return;
        }

        if (result.status !== 'success') {
            tampilkanErrorSertifikat(result.message || 'Sertifikat belum bisa ditampilkan.');
            return;
        }

        const data = result.data;
        document.getElementById('sertifikat-nama').textContent = data.nama;
        document.getElementById('sertifikat-skor').textContent = data.skor_tryout;
        // innerHTML (bukan textContent) -- klasifikasi.label_html dari
        // server sudah membungkus kata/frasa Bahasa Inggris di dalam
        // label dengan <em> (lihat cn_sertifikat_italicize() di
        // api/get_sertifikat.php), supaya cuma bagian Inggrisnya yang
        // miring (mis. "hingga" di "Practicing hingga Master Thinker"
        // TIDAK ikut miring).
        document.getElementById('sertifikat-klasifikasi').innerHTML = data.klasifikasi.label_html;
        document.getElementById('sertifikat-tanggal').textContent = formatTanggalSertifikat(data.tanggal_selesai);
        document.getElementById('sertifikat-nomor').textContent = data.nomor_sertifikat;
        document.title = 'Sertifikat - ' + data.nama + ' - Cakar Nalar';

        renderRubrikSertifikat(data.rubrik || [], data.klasifikasi.warna);
        renderMateriSertifikat(data.materi || []);

        document.getElementById('sertifikat-status').style.display = 'none';
        document.getElementById('sertifikat-wrap').style.display = 'block';
    } catch (err) {
        tampilkanErrorSertifikat('Tidak bisa terhubung ke server. Periksa koneksi internet dan muat ulang halaman.');
    }
}

/**
 * Render daftar 3 kategori rubrik klasifikasi di halaman ke-2 sertifikat
 * (data.rubrik dari api/get_sertifikat.php) -- kategori milik peserta
 * sendiri ditandai aktif + label "Skormu", SAMA POLA dengan
 * daftarRangeSkorTryout di js/quiz.js (tampilkanHasilTryout).
 */
function renderRubrikSertifikat(rubrik, warnaAktif) {
    const list = document.getElementById('sertifikat-rubrik-list');
    if (!list) return;
    // range.label_html & range.deskripsi_html (bukan .label/.deskripsi
    // polos) -- sudah dibungkus <em> di server persis pada kata/frasa
    // Bahasa Inggrisnya saja (lihat cn_sertifikat_italicize() di
    // api/get_sertifikat.php), jadi TIDAK perlu (dan TIDAK BOLEH) lewat
    // escapeHtmlSertifikat() lagi di sini -- itu akan meng-escape tag
    // <em>-nya jadi teks "&lt;em&gt;" apa adanya.
    list.innerHTML = rubrik.map(range => `
        <div class="sertifikat-rubrik-item ${range.warna}${range.warna === warnaAktif ? ' active' : ''}">
            <div class="sertifikat-rubrik-item-top">
                <span class="sertifikat-rubrik-badge">${range.min}-${range.max}</span>
                <span class="sertifikat-rubrik-label">${range.label_html}</span>
                ${range.warna === warnaAktif ? '<span class="sertifikat-rubrik-tag"><i class="fa-solid fa-check"></i> Skormu</span>' : ''}
            </div>
            <p class="sertifikat-rubrik-desc">${range.deskripsi_html}</p>
        </div>
    `).join('');
}

/**
 * Render daftar materi (judul + skor tiap Bab) di halaman ke-3 sertifikat
 * (data.materi dari api/get_sertifikat.php). bab.skor null kalau entah
 * kenapa belum ada hasil_kuis tercatat (harusnya tidak mungkin peserta
 * sampai bisa lihat sertifikat kalau belum lulus semua bab -- tapi tetap
 * dijaga, ditampilkan "-" bukan kosong/error) supaya tidak crash.
 */
function renderMateriSertifikat(materi) {
    const list = document.getElementById('sertifikat-materi-list');
    if (!list) return;
    const jumlahEl = document.getElementById('sertifikat-materi-jumlah');
    if (jumlahEl && materi.length) jumlahEl.textContent = materi.length;
    list.innerHTML = materi.map(bab => `
        <div class="sertifikat-materi-item">
            <span class="sertifikat-materi-nomor">${bab.nomor}</span>
            <span class="sertifikat-materi-judul">${sanitizeRichHtmlSertifikat(bab.judul)}</span>
            <span class="sertifikat-materi-skor">
                <span class="sertifikat-materi-skor-angka">${bab.skor ?? '-'}</span>
                <span class="sertifikat-materi-skor-label">Skor</span>
            </span>
        </div>
    `).join('');
}

/**
 * Judul Bab disimpan sebagai rich-text HTML dari editor admin (boleh ada
 * <b>/<i>/dst) -- SAMA PERSIS fungsi sanitizeRichHtmlLaporan() di
 * js/laporan.js/sanitizeRichHtmlDashboard() di js/dashboard.js. Kalau
 * dirender lewat escapeHtmlSertifikat() (yang memperlakukan nilainya
 * sebagai teks polos), entity HTML yang sudah tersimpan di database
 * (mis. "&amp;") jadi ke-escape DUA KALI.
 */
function sanitizeRichHtmlSertifikat(html) {
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

function formatTanggalSertifikat(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
        return '-';
    }
}

function escapeHtmlSertifikat(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}