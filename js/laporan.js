// =================================================================
// LAPORAN LENGKAP PESERTA - Cakar Nalar
// -----------------------------------------------------------------
// Halaman rekap murni (skor, status, tanggal) untuk peserta sendiri --
// SENGAJA tidak menampilkan pembahasan/rincian jawaban (lihat catatan
// panjang di api/get_laporan.php), beda dengan layar hasil kuis/tryout
// yang memang untuk pengerjaan, bukan laporan akhir.
// =================================================================

let laporanCurrentUser = null;

(function checkAuth() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        laporanCurrentUser = JSON.parse(saved);
        if (!laporanCurrentUser || !laporanCurrentUser.id) throw new Error('invalid');
        if (laporanCurrentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    muatLaporan();
})();

function formatTanggalLaporan(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
        return '-';
    }
}

async function muatLaporan() {
    try {
        const res = await fetch('api/get_laporan.php?user_id=' + laporanCurrentUser.id);
        const result = await res.json();

        if (result.status !== 'success') {
            document.getElementById('laporan-subtitle').textContent = '';
            document.getElementById('laporan-content').innerHTML = `
                <div class="quiz-result-card">
                    <div class="quiz-result-icon locked"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <h3>Laporan Belum Bisa Dimuat</h3>
                    <p class="desc">${escapeHtmlLaporan(result.message || 'Terjadi kesalahan.')}</p>
                    <button class="quiz-result-back-btn" onclick="cnGoTo('dashboard.html')">Kembali ke Dashboard</button>
                </div>`;
            document.body.classList.add('quiz-content-ready');
            return;
        }

        renderLaporan(result.data);
    } catch (err) {
        document.getElementById('laporan-subtitle').textContent = '';
        document.getElementById('laporan-content').innerHTML = `
            <div class="quiz-result-card">
                <div class="quiz-result-icon locked"><i class="fa-solid fa-wifi"></i></div>
                <h3>Tidak Bisa Terhubung</h3>
                <p class="desc">Periksa koneksi internet dan muat ulang halaman.</p>
            </div>`;
        document.body.classList.add('quiz-content-ready');
    }
}

function renderLaporan(data) {
    document.getElementById('laporan-subtitle').textContent =
        'Rekap seluruh hasil belajar ' + data.nama + ' selama mengikuti Program Cakar Nalar.';

    const babLulusCount = data.bab.filter(b => b.lulus).length;
    const totalBab = data.bab.length;
    const programSelesai = !!(data.diagnostik) && babLulusCount >= totalBab && !!(data.tryout && data.tryout.lulus);

    // --- Kartu ringkasan peserta ---
    const ringkasanHtml = `
        <div class="laporan-summary-card ${programSelesai ? 'selesai' : 'berjalan'}">
            <div class="laporan-summary-decor" aria-hidden="true">
                <i class="fa-solid fa-user-graduate"></i>
            </div>
            <div class="laporan-summary-badge ${programSelesai ? 'selesai' : 'berjalan'}">
                <i class="fa-solid ${programSelesai ? 'fa-trophy' : 'fa-person-running'}"></i>
                ${programSelesai ? 'Program Selesai' : 'Sedang Berjalan'}
            </div>
            <h3>${escapeHtmlLaporan(data.nama)}</h3>
            <p class="laporan-summary-meta">
                Terdaftar sejak ${formatTanggalLaporan(data.terdaftar_pada)}
                &middot; Lulus ${babLulusCount} dari ${totalBab} Bab
            </p>
        </div>`;

    // --- Tes Diagnostik ---
    const diagnostikHtml = data.diagnostik ? `
        <div class="laporan-card">
            <div class="laporan-card-decor diagnostik" aria-hidden="true"><i class="fa-solid fa-flask"></i></div>
            <div class="laporan-card-icon diagnostik"><i class="fa-solid fa-flask"></i></div>
            <div class="laporan-card-body">
                <div class="laporan-card-heading">
                    <h6>Tes Diagnostik</h6>
                    <div class="laporan-card-skor-chip diagnostik">
                        <span class="laporan-card-skor-chip-angka">${data.diagnostik.skor}</span>
                        <span class="laporan-card-skor-chip-label">Skor</span>
                    </div>
                </div>
                <div class="laporan-card-stats">
                    <span class="laporan-card-skor-inline"><strong>${data.diagnostik.skor}</strong> Skor</span>
                    <span class="laporan-klasifikasi ${data.diagnostik.klasifikasi.warna}">${laporanItalicizeInggris(data.diagnostik.klasifikasi.label)}</span>
                    <span class="laporan-card-date-mobile">${formatTanggalLaporan(data.diagnostik.selesai_pada)}</span>
                </div>
            </div>
            <div class="laporan-card-date">${formatTanggalLaporan(data.diagnostik.selesai_pada)}</div>
        </div>` : `
        <div class="laporan-card laporan-card-kosong">
            <div class="laporan-card-decor diagnostik" aria-hidden="true"><i class="fa-solid fa-flask"></i></div>
            <div class="laporan-card-icon diagnostik"><i class="fa-solid fa-flask"></i></div>
            <div class="laporan-card-body">
                <h6>Tes Diagnostik</h6>
                <p class="laporan-card-desc">Belum dikerjakan.</p>
            </div>
        </div>`;

    // --- Tiap Bab (tabel ringkas) ---
    const babRowsHtml = data.bab.map(b => {
        let statusHtml;
        if (b.lulus) {
            statusHtml = '<span class="laporan-status-pill lulus"><i class="fa-solid fa-check"></i> Lulus</span>';
        } else if (b.materi_dibaca || b.jumlah_percobaan > 0) {
            statusHtml = '<span class="laporan-status-pill berjalan"><i class="fa-solid fa-pen"></i> Belum Lulus</span>';
        } else {
            statusHtml = '<span class="laporan-status-pill belum"><i class="fa-solid fa-minus"></i> Belum Dikerjakan</span>';
        }
        const skorHtml = b.skor_terakhir !== null
            ? `<span class="laporan-bab-skor-angka">${b.skor_terakhir}</span><span class="laporan-bab-skor-label">Skor</span>`
            : `<span class="laporan-bab-skor-angka">-</span>`;
        return `
            <div class="laporan-bab-row">
                <div class="laporan-bab-nomor">${b.nomor}</div>
                <div class="laporan-bab-judul">${sanitizeRichHtmlLaporan(b.judul)}</div>
                <div class="laporan-bab-status-skor-wrap">
                    <div class="laporan-bab-status">${statusHtml}</div>
                    <div class="laporan-bab-skor ${b.skor_terakhir !== null ? 'ada' : 'kosong'}">${skorHtml}</div>
                </div>
            </div>`;
    }).join('');

    const babSectionHtml = `
        <div class="laporan-section">
            <h5 class="laporan-section-title"><i class="fa-solid fa-book-open"></i> Materi &amp; Kuis per Bab</h5>
            <div class="laporan-bab-table">
                <div class="laporan-bab-row laporan-bab-row-head">
                    <div class="laporan-bab-nomor">No</div>
                    <div class="laporan-bab-judul">Bab</div>
                    <div class="laporan-bab-status">Status</div>
                    <div class="laporan-bab-skor">Skor</div>
                </div>
                ${babRowsHtml}
            </div>
        </div>`;

    // --- Final Tryout ---
    const tryoutHtml = data.tryout ? `
        <div class="laporan-card">
            <div class="laporan-card-decor tryout" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
            <div class="laporan-card-icon tryout"><i class="fa-solid fa-trophy"></i></div>
            <div class="laporan-card-body">
                <div class="laporan-card-heading">
                    <h6>Final Tryout</h6>
                    <div class="laporan-card-skor-chip tryout">
                        <span class="laporan-card-skor-chip-angka">${data.tryout.skor}</span>
                        <span class="laporan-card-skor-chip-label">Skor</span>
                    </div>
                </div>
                <div class="laporan-card-stats">
                    <span class="laporan-card-skor-inline"><strong>${data.tryout.skor}</strong> Skor</span>
                    <span class="laporan-klasifikasi ${data.tryout.klasifikasi.warna}">${laporanItalicizeInggris(data.tryout.klasifikasi.label)}</span>
                    <span class="laporan-card-date-mobile">${formatTanggalLaporan(data.tryout.selesai_pada)}</span>
                </div>
            </div>
            <div class="laporan-card-date">${formatTanggalLaporan(data.tryout.selesai_pada)}</div>
        </div>` : `
        <div class="laporan-card laporan-card-kosong">
            <div class="laporan-card-decor tryout" aria-hidden="true"><i class="fa-solid fa-trophy"></i></div>
            <div class="laporan-card-icon tryout"><i class="fa-solid fa-trophy"></i></div>
            <div class="laporan-card-body">
                <h6>Final Tryout</h6>
                <p class="laporan-card-desc">Belum dikerjakan.</p>
            </div>
        </div>`;

    const sertifikatCtaHtml = programSelesai ? `
        <div class="laporan-cta">
            <div class="laporan-cta-row">
                <div class="laporan-cta-icon"><i class="fa-solid fa-award"></i></div>
                <div class="laporan-cta-text">
                    <h6>Selamat, program sudah selesai!</h6>
                    <p>Kamu bisa unduh sertifikat penyelesaian Program Cakar Nalar.</p>
                </div>
            </div>
            <button class="btn-bab-action" onclick="cnGoTo('sertifikat.html')">Unduh Sertifikat</button>
        </div>` : '';

    document.getElementById('laporan-content').innerHTML = `
        ${ringkasanHtml}
        <div class="laporan-section">
            <h5 class="laporan-section-title"><i class="fa-solid fa-flask"></i> Tes Diagnostik</h5>
            ${diagnostikHtml}
        </div>
        ${babSectionHtml}
        <div class="laporan-section">
            <h5 class="laporan-section-title"><i class="fa-solid fa-trophy"></i> Final Tryout</h5>
            ${tryoutHtml}
        </div>
        ${sertifikatCtaHtml}
    `;
    document.body.classList.add('quiz-content-ready');
}

function escapeHtmlLaporan(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

/**
 * Bungkus HANYA kata/frasa Bahasa Inggris yang benar-benar ada di label
 * rubrik klasifikasi ("Unreflective Thinker"/"Challenged / Beginning
 * Thinker"/"Practicing hingga Master Thinker") dengan <em> -- SAMA
 * PERSIS pola & isi frasa dengan quizItalicizeInggris() di js/quiz.js
 * (layar hasil Tes Diagnostik & Final Tryout), ubItalicizeInggris()
 * (js/umpan_balik.js), ubAdminItalicize() (js/admin.js), &
 * cn_sertifikat_italicize() (api/get_sertifikat.php), supaya kata
 * Bahasa Indonesia yang kebetulan nyempil di tengah label campuran
 * (mis. "hingga" di "Practicing hingga Master Thinker") TIDAK ikut
 * miring. Urutan panjang-ke-pendek supaya frasa yang lebih panjang
 * selalu kena duluan.
 */
const LAPORAN_FRASA_INGGRIS = [
    'Challenged / Beginning Thinker',
    'Unreflective Thinker',
    'Master Thinker',
    'Practicing'
];
function laporanItalicizeInggris(text) {
    let hasil = escapeHtmlLaporan(text);
    LAPORAN_FRASA_INGGRIS.forEach(frasa => {
        const frasaEscaped = escapeHtmlLaporan(frasa);
        hasil = hasil.split(frasaEscaped).join('<em>' + frasaEscaped + '</em>');
    });
    return hasil;
}

/**
 * Judul Bab disimpan sebagai rich-text HTML dari editor admin (boleh
 * ada <b>/<i>/dst, entity seperti "&amp;" sudah tersimpan apa adanya di
 * database) -- SAMA PERSIS fungsi sanitizeRichHtmlDashboard() di
 * js/dashboard.js. Kalau dirender lewat escapeHtmlLaporan() (yang
 * memperlakukan nilainya sebagai teks polos), entity itu jadi
 * di-escape DUA KALI ("&amp;" tampil apa adanya, bukan "&") -- makanya
 * judul bab butuh fungsi terpisah ini, bukan escapeHtmlLaporan().
 */
function sanitizeRichHtmlLaporan(html) {
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