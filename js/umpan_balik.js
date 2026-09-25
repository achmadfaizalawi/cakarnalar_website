// =================================================================
// FORM UMPAN BALIK & EVALUASI DAMPAK PROGRAM - Cakar Nalar
// -----------------------------------------------------------------
// Wajib diisi SEKALI oleh peserta sebelum bisa membuka sertifikat.html
// (lihat gerbangnya di api/get_sertifikat.php -- status "perlu_umpan_balik",
// & js/sertifikat.js yang mengarahkan ke sini). Server (api/submit_umpan_balik.php)
// yang benar-benar MEMVALIDASI & mencegah pengisian ganda (UNIQUE KEY
// user_id) -- validasi di sini cuma supaya peserta tidak perlu bolak-balik
// submit-gagal-submit lagi buat tahu ada isian yang belum lengkap.
//
// Daftar pilihan (value+label) tiap field single/multi-select HARUS SAMA
// PERSIS dengan whitelist CN_UB_* di api/submit_umpan_balik.php -- diubah
// di SATU tempat kalau opsinya berubah, jangan lupa samakan juga di server.
// =================================================================

let umpanBalikCurrentUser = null;

const UB_OPSI = {
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
    // Cuma 3 pilihan -- SENGAJA DISAMAKAN dengan rubrik klasifikasi Final
    // Tryout yang sudah ada ($rubrik_tryout di api/get_sertifikat.php &
    // daftarRangeSkorTryout di js/quiz.js): "Practicing" & "Master
    // Thinker" DIGABUNG jadi satu kategori "Practicing hingga Master
    // Thinker", bukan 2 pilihan terpisah -- supaya istilah yang dilihat
    // peserta di sini konsisten dengan istilah di hasil Tryout/sertifikat
    // mereka sendiri.
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
// "tingkat_sesudah" pakai daftar opsi yang SAMA PERSIS dengan "tingkat_sebelum".
UB_OPSI.tingkat_sesudah = UB_OPSI.tingkat_sebelum;

(function checkAuth() {
    const saved = localStorage.getItem('cn_user');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        umpanBalikCurrentUser = JSON.parse(saved);
        if (!umpanBalikCurrentUser || !umpanBalikCurrentUser.id) throw new Error('invalid');
        if (umpanBalikCurrentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
    } catch (e) {
        localStorage.removeItem('cn_user');
        window.location.href = 'index.html';
        return;
    }

    muatStatusUmpanBalik();
})();

async function muatStatusUmpanBalik() {
    try {
        const res = await fetch('api/get_umpan_balik.php?user_id=' + umpanBalikCurrentUser.id);
        const result = await res.json();

        if (result.status !== 'success') {
            tampilkanStatusUmpanBalik('error', 'Tidak Bisa Memuat Form', result.message || 'Terjadi kesalahan.', 'dashboard.html', 'Kembali ke Dashboard');
            return;
        }

        if (!result.data.eligible) {
            tampilkanStatusUmpanBalik('locked', 'Belum Bisa Diakses',
                'Selesaikan dulu seluruh rangkaian Program Cakar Nalar (Tes Diagnostik, semua Bab, dan Final Tryout) sebelum mengisi form ini.',
                'dashboard.html', 'Kembali ke Dashboard');
            return;
        }

        if (result.data.sudah_isi) {
            tampilkanStatusUmpanBalik('done', 'Kamu Sudah Pernah Mengisi Form Ini',
                'Terima kasih atas umpan balikmu sebelumnya! Kamu tidak perlu mengisi ulang -- sertifikatmu sudah bisa diunduh kapan saja.',
                'sertifikat.html', 'Lihat Sertifikat');
            return;
        }

        // Eligible & belum pernah isi -- tampilkan form-nya.
        renderFormUmpanBalik();
        document.getElementById('ub-form').style.display = '';
    } catch (err) {
        tampilkanStatusUmpanBalik('error', 'Tidak Bisa Terhubung', 'Periksa koneksi internet dan muat ulang halaman.', 'dashboard.html', 'Kembali ke Dashboard');
    }
}

function tampilkanStatusUmpanBalik(jenis, judul, pesan, tujuanUrl, tujuanLabel) {
    const iconMap = { error: 'fa-triangle-exclamation', locked: 'fa-lock', done: 'fa-check' };
    const decorWarna = jenis === 'done' ? 'hijau' : (jenis === 'locked' ? 'abu' : 'merah');
    const iconClass = jenis === 'locked' ? 'locked' : (jenis === 'error' ? 'gagal' : '');
    document.getElementById('ub-status').innerHTML = `
        <div class="quiz-result-card">
            <div class="quiz-result-decor ${decorWarna}" aria-hidden="true"><i class="fa-solid ${iconMap[jenis]}"></i></div>
            <div class="quiz-result-icon ${iconClass}"><i class="fa-solid ${iconMap[jenis]}"></i></div>
            <h3>${escapeHtmlUmpanBalik(judul)}</h3>
            <p class="desc">${escapeHtmlUmpanBalik(pesan)}</p>
            <button class="quiz-result-back-btn" onclick="cnGoTo('${tujuanUrl}')">${escapeHtmlUmpanBalik(tujuanLabel)}</button>
        </div>`;
}

// =================================================================
// RENDER FORM (dibangun dari UB_OPSI, bukan HTML statis, supaya daftar
// pilihan tiap field cuma perlu didefinisikan SATU kali di atas)
// =================================================================
function renderFormUmpanBalik() {
    renderPilihanTunggal('ub-kategori_peserta', 'kategori_peserta', UB_OPSI.kategori_peserta);
    renderPilihanTunggal('ub-jenis_kelamin', 'jenis_kelamin', UB_OPSI.jenis_kelamin);
    renderPilihanTunggal('ub-durasi_medsos', 'durasi_medsos', UB_OPSI.durasi_medsos);
    renderPilihanGanda('ub-platform_medsos', 'platform_medsos', UB_OPSI.platform_medsos);
    renderPilihanTunggal('ub-hoaks_frekuensi', 'hoaks_frekuensi', UB_OPSI.hoaks_frekuensi);
    renderPilihanTunggal('ub-pernah_tertipu', 'pernah_tertipu', UB_OPSI.pernah_tertipu);

    ['bab1_skor', 'bab2_skor', 'bab3_skor', 'bab4_skor', 'bab5_skor',
        'maskot_skor', 'desain_skor', 'studi_kasus_skor', 'lembar_kerja_skor',
        'kepercayaan_verifikasi'].forEach(name => renderSkala('ub-' + name, name, 5));
    renderSkala('ub-nps', 'nps', 10);

    renderPilihanTunggal('ub-tingkat_sebelum', 'tingkat_sebelum', UB_OPSI.tingkat_sebelum);
    renderPilihanTunggal('ub-tingkat_sesudah', 'tingkat_sesudah', UB_OPSI.tingkat_sesudah);
    renderPilihanGanda('ub-tindakan_nyata', 'tindakan_nyata', UB_OPSI.tindakan_nyata);
    renderPilihanGanda('ub-format_media', 'format_media', UB_OPSI.format_media);
    renderPilihanGanda('ub-fitur_baru', 'fitur_baru', UB_OPSI.fitur_baru, 2);
}

function renderPilihanTunggal(elId, name, opsi) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = opsi.map((o, i) => `
        <div class="ub-pilihan-item">
            <input type="radio" name="${name}" id="${name}_${i}" value="${o.value}" required>
            <label for="${name}_${i}">${ubItalicizeInggris(o.label)}</label>
        </div>
    `).join('');
}

// maksimal (opsional) -- kalau diisi, checkbox lain otomatis dinonaktifkan
// begitu jumlah tercentang sudah mencapai batas (mis. "fitur_baru" maks 2),
// supaya peserta tidak perlu tahu batasnya dari pesan error saja.
function renderPilihanGanda(elId, name, opsi, maksimal) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = opsi.map((o, i) => `
        <div class="ub-pilihan-item">
            <input type="checkbox" name="${name}" id="${name}_${i}" value="${o.value}"${maksimal ? ` onchange="ubTerapkanBatasCentang('${name}', ${maksimal})"` : ''}>
            <label for="${name}_${i}">${ubItalicizeInggris(o.label)}</label>
        </div>
    `).join('');
}

// Bungkus HANYA kata/frasa Bahasa Inggris yang benar-benar ada di label
// pilihan (UB_OPSI) dengan <em> -- SAMA POLA dengan cn_sertifikat_italicize()
// di api/get_sertifikat.php (daftar frasa tetap, bukan deteksi bahasa
// otomatis, karena labelnya sendiri konstan/tidak berubah-ubah). Nama
// brand/produk (WhatsApp, TikTok, Instagram, dst) SENGAJA TIDAK ikut
// dimiringkan -- itu nama, bukan istilah Bahasa Inggris yang dipinjam.
// escapeHtmlUmpanBalik() dijalankan LEBIH DULU (baru replace frasa yang
// SUDAH di-escape) supaya karakter seperti "&" di "Stop & Think" tetap
// ter-escape dengan benar, bukan malah membuka celah HTML mentah.
// "Challenged / Beginning Thinker" & "Unreflective Thinker" WAJIB duluan
// (frasa lebih panjang/spesifik) sebelum "Master Thinker" & "Practicing"
// SENDIRIAN (bukan "Practicing Thinker") -- SAMA PERSIS urutan & isi
// $frasa_inggris di cn_sertifikat_italicize() (api/get_sertifikat.php),
// karena label "Practicing hingga Master Thinker" di UB_OPSI.tingkat_sebelum
// di atas juga SENGAJA disamakan dengan label rubrik Tryout itu -- "hingga"
// di tengahnya Bahasa Indonesia, jadi TIDAK ikut miring.
const UB_FRASA_INGGRIS = [
    'Challenged / Beginning Thinker',
    'Unreflective Thinker',
    'Master Thinker',
    'Practicing',
    'Stop & Think',
    'Ad Hominem'
];
function ubItalicizeInggris(text) {
    let hasil = escapeHtmlUmpanBalik(text);
    UB_FRASA_INGGRIS.forEach(frasa => {
        const frasaEscaped = escapeHtmlUmpanBalik(frasa);
        hasil = hasil.split(frasaEscaped).join('<em>' + frasaEscaped + '</em>');
    });
    return hasil;
}

function ubTerapkanBatasCentang(name, maksimal) {
    const semua = document.querySelectorAll(`input[name="${name}"]`);
    const tercentang = document.querySelectorAll(`input[name="${name}"]:checked`).length;
    semua.forEach(cb => {
        if (!cb.checked) cb.disabled = tercentang >= maksimal;
    });
}

function renderSkala(elId, name, max) {
    const el = document.getElementById(elId);
    if (!el) return;
    let pills = '';
    for (let i = 1; i <= max; i++) {
        pills += `
            <input type="radio" name="${name}" id="${name}_${i}" value="${i}" required>
            <label for="${name}_${i}">${i}</label>`;
    }
    el.innerHTML = pills;
}

// =================================================================
// VALIDASI & KIRIM
// =================================================================
function ubNilaiRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

function ubNilaiCheckboxArray(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}

/**
 * Validasi jumlah minimal tercentang untuk grup checkbox (HTML5 "required"
 * TIDAK bisa menyatakan "minimal 1 dari grup ini" secara native untuk
 * checkbox, beda dengan radio) -- kalau kurang, scroll ke situ & fokus ke
 * pilihan pertamanya supaya peserta langsung tahu bagian mana yang kurang.
 */
function ubValidasiMinimalSatu(name, labelBagian) {
    if (ubNilaiCheckboxArray(name).length > 0) return true;
    const pertama = document.querySelector(`input[name="${name}"]`);
    if (pertama) {
        pertama.closest('.ub-field').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    Swal.fire({ icon: 'warning', title: 'Belum Lengkap', text: `Pilih minimal 1 untuk "${labelBagian}".` });
    return false;
}

async function kirimUmpanBalik(event) {
    event.preventDefault();

    // Grup radio (kategori_peserta, jenis_kelamin, dst) sudah dijaga lewat
    // atribut "required" HTML5 bawaan browser (form.reportValidity() di
    // bawah akan berhenti & fokus otomatis ke grup yang belum terisi) --
    // yang perlu dicek manual di sini cuma grup CHECKBOX (minimal 1
    // tercentang), karena "required" tidak berlaku situasi itu.
    const form = document.getElementById('ub-form');
    if (!form.reportValidity()) return false;

    if (!ubValidasiMinimalSatu('platform_medsos', 'Platform Media Utama')) return false;
    if (!ubValidasiMinimalSatu('tindakan_nyata', 'Tindakan Nyata')) return false;
    if (!ubValidasiMinimalSatu('format_media', 'Format Media Pembelajaran')) return false;
    if (!ubValidasiMinimalSatu('fitur_baru', 'Fitur Baru')) return false;

    const payload = {
        user_id: umpanBalikCurrentUser.id,
        kategori_peserta: ubNilaiRadio('kategori_peserta'),
        jenis_kelamin: ubNilaiRadio('jenis_kelamin'),
        // Digabung dari 2 input terpisah (dropdown Kota/Kabupaten + nama
        // wilayah, lihat umpan_balik.html) jadi 1 string ("Kota Bandung",
        // "Kabupaten Bandung Barat", dst) -- kolom "domisili" di backend
        // TETAP 1 kolom teks biasa, tidak ada perubahan struktur.
        domisili: `${document.getElementById('ub-domisili-jenis').value} ${document.getElementById('ub-domisili-nama').value.trim()}`.trim(),
        durasi_medsos: ubNilaiRadio('durasi_medsos'),
        platform_medsos: ubNilaiCheckboxArray('platform_medsos'),
        hoaks_frekuensi: ubNilaiRadio('hoaks_frekuensi'),
        pernah_tertipu: ubNilaiRadio('pernah_tertipu'),
        bab1_skor: parseInt(ubNilaiRadio('bab1_skor'), 10),
        bab2_skor: parseInt(ubNilaiRadio('bab2_skor'), 10),
        bab3_skor: parseInt(ubNilaiRadio('bab3_skor'), 10),
        bab4_skor: parseInt(ubNilaiRadio('bab4_skor'), 10),
        bab5_skor: parseInt(ubNilaiRadio('bab5_skor'), 10),
        maskot_skor: parseInt(ubNilaiRadio('maskot_skor'), 10),
        desain_skor: parseInt(ubNilaiRadio('desain_skor'), 10),
        studi_kasus_skor: parseInt(ubNilaiRadio('studi_kasus_skor'), 10),
        lembar_kerja_skor: parseInt(ubNilaiRadio('lembar_kerja_skor'), 10),
        kepercayaan_verifikasi: parseInt(ubNilaiRadio('kepercayaan_verifikasi'), 10),
        tingkat_sebelum: ubNilaiRadio('tingkat_sebelum'),
        tingkat_sesudah: ubNilaiRadio('tingkat_sesudah'),
        tindakan_nyata: ubNilaiCheckboxArray('tindakan_nyata'),
        format_media: ubNilaiCheckboxArray('format_media'),
        fitur_baru: ubNilaiCheckboxArray('fitur_baru'),
        nps: parseInt(ubNilaiRadio('nps'), 10),
        materi_bermanfaat: document.getElementById('ub-materi_bermanfaat').value.trim(),
        kritik_saran: document.getElementById('ub-kritik_saran').value.trim(),
        pesan_kesan: document.getElementById('ub-pesan_kesan').value.trim()
    };

    const btn = document.getElementById('ub-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Mengirim...';

    try {
        const res = await fetch('api/submit_umpan_balik.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status !== 'success') {
            Swal.fire({ icon: 'error', title: 'Gagal Mengirim', text: result.message || 'Terjadi kesalahan, silakan coba lagi.' });
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Umpan Balik';
            return false;
        }

        await Swal.fire({
            icon: 'success',
            title: 'Terima Kasih!',
            text: 'Umpan balikmu berhasil tersimpan. Sertifikatmu sekarang bisa diunduh.',
            confirmButtonColor: '#0C7A6E'
        });
        cnGoTo('sertifikat.html');
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tidak Bisa Terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Umpan Balik';
    }
    return false;
}

function escapeHtmlUmpanBalik(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}