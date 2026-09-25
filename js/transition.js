// =================================================================
// Default global buat semua Swal.fire() di seluruh situs: "scrollbarPadding:
// false" mencegah popup SweetAlert2 menambah padding kompensasi scrollbar
// ke <body> -- soalnya scrollbar di situs ini sudah sengaja selalu tampil
// (overflow-y:scroll di <html>, lihat style.css), jadi kompensasi itu
// tidak diperlukan dan malah bikin halaman kelihatan geser dikit waktu
// popup dibuka/ditutup (mis. dialog "Keluar dari akun?" di dashboard).
// Dengan cara ini tidak perlu menambahkan opsi yang sama satu-satu di
// setiap pemanggilan Swal.fire().
// =================================================================
if (typeof Swal !== 'undefined' && typeof Swal.mixin === 'function') {
    window.Swal = Swal.mixin({ scrollbarPadding: false });
}

// =================================================================
// VALIDATOR KATA SANDI - dipakai bersama di halaman daftar (index.html)
// dan Edit Profil (dashboard.html), supaya aturannya konsisten dengan
// cn_validasi_kata_sandi() di api/config.php:
// - Minimal 8 karakter
// - Wajib mengandung minimal 1 huruf dan 1 angka
// Return: pesan error (string) kalau tidak valid, atau null kalau valid.
// =================================================================
// =================================================================
// VALIDATOR FORMAT EMAIL - dipakai bersama di form Daftar & Edit Profil.
// Lebih ketat dari sekadar "ada @ dan ada titik": akhiran domain (TLD)
// harus benar-benar akhiran yang wajar (mis. .com, .id, .co.id), supaya
// salah ketik seperti "nama@gmail.comdsdsds" tetap tertangkap sebagai
// tidak valid, bukan lolos begitu saja.
// =================================================================
const CN_TLD_UMUM = [
    'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name',
    'pro', 'coop', 'museum', 'aero', 'asia', 'cat', 'jobs', 'mobi', 'tel',
    'travel', 'io', 'co', 'me', 'tv', 'app', 'dev', 'xyz', 'online', 'site',
    'store', 'tech', 'blog', 'id'
];

function cnValidasiFormatEmail(email) {
    if (!email) return false;
    const pola = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
    if (!pola.test(email)) return false;

    const domain = email.split('@')[1];
    const label = domain.split('.');
    const tld = label[label.length - 1].toLowerCase();

    // TLD 2 huruf mencakup hampir semua kode negara (id, sg, my, uk, dst).
    if (tld.length === 2) return true;
    return CN_TLD_UMUM.includes(tld);
}

function cnValidasiKekuatanPassword(password) {
    if (!password || password.length < 8) {
        return 'Kata sandi minimal 8 karakter';
    }
    if (password.length > 30) {
        return 'Kata sandi maksimal 30 karakter';
    }
    if (!/[A-Za-z]/.test(password)) {
        return 'Kata sandi harus mengandung minimal 1 huruf';
    }
    if (!/[0-9]/.test(password)) {
        return 'Kata sandi harus mengandung minimal 1 angka';
    }
    return null;
}

// =================================================================
// INDIKATOR VALIDASI REAL-TIME (border merah/hijau di input) - dipakai
// di form Daftar (index.html) dan form Edit Profil (dashboard.html).
// state: true = valid (hijau), false = tidak valid (merah), null/undefined
// = netral (dikosongkan, belum diisi jadi belum perlu dinilai).
// =================================================================
function cnSetValidasiInput(el, state) {
    if (!el) return;
    el.classList.remove('cn-input-valid', 'cn-input-invalid');
    if (state === true) {
        el.classList.add('cn-input-valid');
    } else if (state === false) {
        el.classList.add('cn-input-invalid');
    }
}

/**
 * Tulisan keterangan dinamis di bawah sebuah input (mis. "Kata sandi harus
 * mengandung minimal 1 angka"), yang warnanya ikut berubah merah/hijau
 * sesuai status validasinya. state: true = valid (hijau), false = tidak
 * valid (merah), null/undefined = netral (abu-abu, teks default/kosong).
 */
function cnSetValidasiHint(el, message, state) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('cn-hint-valid', 'cn-hint-invalid');
    if (state === true) {
        el.classList.add('cn-hint-valid');
    } else if (state === false) {
        el.classList.add('cn-hint-invalid');
    }
}

/**
 * Tampilkan/sembunyikan ikon centang di dalam sebuah input (dipakai di
 * field konfirmasi kata sandi ketika sudah cocok dengan kata sandi barunya).
 */
function cnToggleCheckIcon(el, tampilkan) {
    if (!el) return;
    el.classList.toggle('show', !!tampilkan);
}

/**
 * Tombol mata (show/hide) di dalam field kata sandi - dipasang lewat event
 * delegation di <body> supaya berfungsi juga untuk field yang dirender
 * belakangan (mis. di dalam popup SweetAlert2 Edit Profil). Tandai tombolnya
 * dengan class "cn-toggle-eye" dan atribut data-target="id-input-nya".
 */
document.addEventListener('click', function (e) {
    const tombol = e.target.closest('.cn-toggle-eye');
    if (!tombol) return;
    // Kata sandi login yang keisi otomatis lewat "Ingat saya" dikunci
    // supaya tidak bisa ditampilkan -- lihat setLoginPasswordEyeLocked()
    // di js/main.js.
    if (tombol.classList.contains('cn-eye-locked')) return;
    const input = document.getElementById(tombol.getAttribute('data-target'));
    if (!input) return;

    const sedangTersembunyi = input.type === 'password';
    input.type = sedangTersembunyi ? 'text' : 'password';
    tombol.classList.toggle('fa-eye', !sedangTersembunyi);
    tombol.classList.toggle('fa-eye-slash', sedangTersembunyi);
});

// =================================================================
// TRANSISI ANTAR HALAMAN - dipakai bersama di semua halaman (index,
// dashboard, diagnostik, admin, dst). Fade-in saat halaman dimuat sudah
// jalan otomatis lewat CSS (lihat css/style.css). Skrip ini menambahkan
// fade-out singkat sebelum benar-benar berpindah halaman, supaya
// transisinya tidak kaku/patah.
// =================================================================
(function () {
    const FADE_MS = 180;

    function isSameOriginHtmlLink(a) {
        if (!a || !a.getAttribute) return false;
        const href = a.getAttribute('href');
        if (!href) return false;
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
        if (a.target && a.target !== '' && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;

        let url;
        try {
            url = new URL(href, window.location.href);
        } catch (e) {
            return false;
        }
        if (url.origin !== window.location.origin) return false;
        // Anchor ke section di halaman yang sama (mis. index.html#tentang) -> biarkan scroll biasa
        if (url.pathname === window.location.pathname && url.hash) return false;

        return true;
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest('a');
        if (!isSameOriginHtmlLink(a)) return;

        e.preventDefault();
        cnGoTo(a.href);
    });

    // Dipakai di seluruh JS lain menggantikan `window.location.href = url`
    // supaya perpindahan halaman ikut fade-out dulu.
    window.cnGoTo = function (url) {
        document.body.classList.add('cn-page-leaving');
        setTimeout(function () {
            window.location.href = url;
        }, FADE_MS);
    };

    // Begitu peserta klik tombol "back" browser/HP, halaman SEBELUMNYA
    // (yang tadi ditinggalkan lewat cnGoTo) sering dipulihkan browser
    // langsung dari bfcache (back-forward cache) -- BUKAN dimuat ulang
    // dari server -- dan DOM-nya dipulihkan PERSIS seperti kondisi
    // terakhir sebelum ditinggalkan, termasuk class "cn-page-leaving"
    // yang tadi sempat ditambahkan di atas (animasinya "forwards", jadi
    // "macet" di opacity:0). Tanpa ini, halaman yang dipulihkan itu
    // kelihatan putih polos/kosong (body-nya transparan) walau isinya
    // sebenarnya ada, karena class itu tidak pernah dilepas lagi. Event
    // "pageshow" terpanggil baik waktu halaman dimuat normal MAUPUN waktu
    // dipulihkan dari bfcache (event.persisted true khusus utk yang
    // kedua) -- class-nya dilepas di keduanya supaya aman, tidak cuma
    // saat dipulihkan dari cache.
    window.addEventListener('pageshow', function () {
        document.body.classList.remove('cn-page-leaving');
    });
})();