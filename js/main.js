// =================================================================
        // KONFIGURASI API
        // =================================================================
        const API_BASE = 'api/';
        let authModalInstance = null;

        document.getElementById('footer-year').textContent = new Date().getFullYear();

        // Cegah scrollbar bawaan <html> (yang selalu tampil) dobel-tampil
        // bareng scrollbar bawaan modal Masuk/Daftar waktu form-nya lebih
        // tinggi dari layar -- lihat komentar "cn-modal-scroll-lock" di
        // style.css.
        (function initModalScrollLockFix() {
            const authModalEl = document.getElementById('authModal');
            if (!authModalEl) return;
            authModalEl.addEventListener('show.bs.modal', () => {
                const html = document.documentElement;
                // Ukur lebar scrollbar SEBELUM disembunyikan (waktu overflow-y
                // masih "scroll", jadi window.innerWidth - clientWidth = lebar
                // scrollbar yang sebenarnya dipakai browser saat ini).
                const scrollbarWidth = window.innerWidth - html.clientWidth;
                if (scrollbarWidth > 0) {
                    html.style.paddingRight = scrollbarWidth + 'px';
                }
                html.classList.add('cn-modal-scroll-lock');
                // Isi ulang email & kata sandi yang sempat "diingat" (kalau
                // ada) tiap kali modal ini dibuka -- lihat muatIngatLogin().
                // Ditaruh di sini (bukan sekali waktu halaman dimuat) karena
                // resetAuthModalForms() ngosongin field login-nya tiap modal
                // DITUTUP, jadi field-nya perlu diisi ulang tiap DIBUKA lagi.
                muatIngatLogin();
            });
            authModalEl.addEventListener('hidden.bs.modal', () => {
                const html = document.documentElement;
                html.classList.remove('cn-modal-scroll-lock');
                html.style.paddingRight = '';
                resetAuthModalForms();
            });
        })();

        // Kosongkan lagi form Masuk & Daftar (isi + validasi + status
        // tampil/sembunyi kata sandi) tiap kali modal-nya ditutup, supaya
        // waktu dibuka lagi tidak ada isian lama yang masih nyangkut.
        function resetAuthModalForms() {
            const authModalEl = document.getElementById('authModal');
            if (!authModalEl) return;

            const formLogin = document.getElementById('form-login');
            if (formLogin) formLogin.reset();

            const formRegister = document.getElementById('form-register');
            if (formRegister) {
                formRegister.reset();
                cnSetValidasiInput(document.getElementById('register-name'), null);
                cnSetValidasiInput(document.getElementById('register-email'), null);
                cnSetValidasiInput(document.getElementById('register-password'), null);
                cnSetValidasiInput(document.getElementById('register-password-confirm'), null);
                delete document.getElementById('register-password-confirm').dataset.dicoba;
                cnSetValidasiHint(document.getElementById('register-name-counter'), '0/30', null);
                cnSetValidasiHint(document.getElementById('register-email-hint'), '', null);
                cnToggleCheckIcon(document.getElementById('register-email-check'), false);
                cnSetValidasiHint(document.getElementById('register-password-hint'), 'Minimal 8 karakter, kombinasi huruf & angka.', null);
                cnSetValidasiHint(document.getElementById('register-password-confirm-hint'), '', null);
                cnToggleCheckIcon(document.getElementById('register-password-confirm-check'), false);
            }

            // Jaga-jaga kalau modal ditutup persis di tengah animasi
            // perpindahan tab (animateAuthTabSwitch) -- bersihkan sisa
            // state animasinya supaya waktu dibuka lagi tidak nyangkut
            // dalam kondisi setengah jalan.
            const authViewsWrap = document.getElementById('auth-views-wrap');
            if (authViewsWrap) {
                authViewsWrap.classList.remove('auth-views-animating');
                authViewsWrap.style.height = '';
            }
            document.querySelectorAll('#authModal .auth-form-view').forEach(function (view) {
                view.classList.remove(
                    'auth-view-entering-from-kanan', 'auth-view-entering-from-kiri',
                    'auth-view-leaving-ke-kiri', 'auth-view-leaving-ke-kanan'
                );
            });

            // Balikin field kata sandi yang sempat "dimatakan" (type=text)
            // kembali ke tersembunyi.
            authModalEl.querySelectorAll('.cn-toggle-eye').forEach(function (tombol) {
                const input = document.getElementById(tombol.getAttribute('data-target'));
                if (input) input.type = 'password';
                tombol.classList.add('fa-eye');
                tombol.classList.remove('fa-eye-slash');
            });
        }

        // =================================================================
        // "INGAT SAYA" DI FORM LOGIN
        // =================================================================
        // Kalau dicentang waktu login berhasil, email & kata sandinya
        // disimpan di localStorage PERANGKAT INI (tidak ikut tersinkron ke
        // perangkat lain) supaya form Masuk otomatis terisi lagi lain kali
        // -- lihat muatIngatLogin() (dipanggil tiap modal Masuk/Daftar
        // dibuka) & simpanAtauHapusIngatLogin() (dipanggil sesudah login
        // sukses, lihat listener submit form-login di bawah). Dipakai
        // bareng oleh peserta MAUPUN admin (satu form Masuk yang sama,
        // cuma redirect-nya beda tergantung role dari login.php) --
        // checkbox-nya per-perangkat, bukan per-akun, jadi kalau perangkat
        // yang sama dipakai gantian oleh orang lain, isian lama bakal
        // ketimpa begitu orang itu login & ikut mencentang juga.
        //
        // CATATAN KEAMANAN: kata sandinya disimpan APA ADANYA (bukan
        // terenkripsi) di localStorage -- siapapun yang bisa buka DevTools
        // di perangkat yang sama bisa membacanya. ini konsekuensi yang
        // disadari & diterima demi kenyamanan "ingat saya" yang memang
        // diminta; kalau perangkatnya dipakai bersama/publik, sebaiknya
        // jangan dicentang.
        const CN_REMEMBER_LOGIN_KEY = 'cn_remember_login';

        function muatIngatLogin() {
            const emailEl = document.getElementById('login-email');
            const passwordEl = document.getElementById('login-password');
            const rememberEl = document.getElementById('login-remember');
            if (!emailEl || !passwordEl || !rememberEl) return;

            // Defaultkan dulu ke "boleh dilihat" -- baru dikunci di bawah
            // kalau memang ada kata sandi yang diisi otomatis dari
            // localStorage (lihat setLoginPasswordEyeLocked()).
            setLoginPasswordEyeLocked(false);

            try {
                const raw = localStorage.getItem(CN_REMEMBER_LOGIN_KEY);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved && saved.email) {
                    emailEl.value = saved.email;
                    passwordEl.value = saved.password || '';
                    rememberEl.checked = true;
                    if (saved.password) {
                        setLoginPasswordEyeLocked(true);
                    }
                }
            } catch (e) {
                // Data tersimpan rusak/tidak kebaca -- abaikan saja, biarkan
                // form-nya kosong seperti biasa.
            }
        }

        // Kata sandi yang keisi OTOMATIS lewat "Ingat saya" sengaja tidak
        // boleh ditampilkan lewat ikon mata (beda dengan kalau diketik
        // sendiri) -- soalnya siapapun yang duduk di depan perangkat itu
        // (bukan cuma pemilik akunnya) bisa buka modal Masuk dan langsung
        // baca kata sandinya kalau ikon matanya dibiarkan aktif. Ikon mata
        // ini otomatis aktif lagi begitu peserta/admin-nya mengetik ULANG
        // sendiri ke field kata sandinya (lihat listener "input" di bawah).
        function setLoginPasswordEyeLocked(locked) {
            const passwordEl = document.getElementById('login-password');
            const eyeBtn = document.querySelector('.cn-toggle-eye[data-target="login-password"]');
            if (!passwordEl || !eyeBtn) return;

            if (locked) {
                passwordEl.type = 'password';
                eyeBtn.classList.add('fa-eye');
                eyeBtn.classList.remove('fa-eye-slash');
                eyeBtn.classList.add('cn-eye-locked');
                eyeBtn.setAttribute('title', 'Kata sandi yang diingat otomatis tidak bisa ditampilkan');
            } else {
                eyeBtn.classList.remove('cn-eye-locked');
                eyeBtn.removeAttribute('title');
            }
        }

        (function pasangUnlockMataLoginSaatDiketikManual() {
            const passwordEl = document.getElementById('login-password');
            if (!passwordEl) return;
            passwordEl.addEventListener('input', () => setLoginPasswordEyeLocked(false));
        })();

        function simpanAtauHapusIngatLogin(email, password) {
            const rememberEl = document.getElementById('login-remember');
            if (!rememberEl) return;
            try {
                if (rememberEl.checked) {
                    localStorage.setItem(CN_REMEMBER_LOGIN_KEY, JSON.stringify({ email, password }));
                } else {
                    // Kalau sebelumnya pernah dicentang & tersimpan, tapi
                    // sekarang dicentang-lepas lagi sebelum login, hapus juga
                    // data lama itu -- jangan biarkan nyangkut di localStorage
                    // padahal peserta/admin-nya sudah bilang "jangan diingat".
                    localStorage.removeItem(CN_REMEMBER_LOGIN_KEY);
                }
            } catch (e) {
                // localStorage penuh/diblokir browser -- bukan hal fatal,
                // login-nya sendiri tetap sudah berhasil duluan.
            }
        }

        // Hitung ulang tanda validasi (merah/hijau/abu-abu) di keempat
        // field form Daftar berdasarkan isinya sekarang, dengan cara
        // memicu ulang event "input"-nya -- ini pakai listener yang
        // sama persis dengan yang sudah jalan waktu peserta mengetik
        // (cekNama/cekEmail/cekPassword/cekConfirm di initValidasiRegister()),
        // jadi hasilnya konsisten: kosong -> abu-abu, ada isi valid ->
        // hijau, ada isi tidak valid -> merah (tanpa keterangan kalau
        // belum pernah dicoba submit). Dipanggil tiap geser tab supaya
        // tanda merah dari percobaan submit sebelumnya tidak nyangkut
        // begitu peserta geser ke Masuk lalu balik lagi ke Daftar.
        function resetTandaValidasiDaftar() {
            ['register-name', 'register-email', 'register-password', 'register-password-confirm'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.dispatchEvent(new Event('input'));
            });
        }

        // =================================================================
        // ANIMASI: reveal saat scroll (IntersectionObserver)
        // =================================================================
        (function initScrollReveal() {
            const items = document.querySelectorAll('.reveal');
            if (!('IntersectionObserver' in window)) {
                items.forEach(el => el.classList.add('in-view'));
                return;
            }
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('in-view');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

            items.forEach(el => observer.observe(el));
        })();

        // =================================================================
        // NAVBAR: bayangan lebih tegas saat halaman discroll
        // =================================================================
        (function initNavbarScrollEffect() {
            const nav = document.querySelector('.navbar-cakar');
            if (!nav) return;
            const toggle = () => nav.classList.toggle('scrolled', window.scrollY > 12);
            toggle();
            window.addEventListener('scroll', toggle, { passive: true });
        })();

        // =================================================================
        // SCROLL-SPY: highlight link section yang sedang terlihat
        // =================================================================
        (function initScrollSpy() {
            const sectionIds = ['tentang', 'landasan', 'pemandu', 'cara-belajar'];
            const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
            const navLinks = document.querySelectorAll('.nav-link-custom, .mobile-nav-link');
            if (!sections.length || !('IntersectionObserver' in window)) return;

            const setActive = (id) => {
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + id);
                });
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) setActive(entry.target.id);
                });
            }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

            sections.forEach(section => observer.observe(section));
        })();

        // =================================================================
        // BACK TO TOP: tombol mengambang + cincin progres scroll halaman
        // =================================================================
        (function initBackToTop() {
            const btn = document.getElementById('backToTopBtn');
            const ring = document.getElementById('backToTopRing');
            if (!btn || !ring) return;

            const radius = ring.r.baseVal.value;
            const circumference = 2 * Math.PI * radius;
            ring.style.strokeDasharray = circumference;
            ring.style.strokeDashoffset = circumference;

            function updateBackToTop() {
                const scrollTop = window.scrollY;
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
                ring.style.strokeDashoffset = circumference * (1 - progress);
                btn.classList.toggle('show', scrollTop > 320);
            }

            updateBackToTop();
            window.addEventListener('scroll', updateBackToTop, { passive: true });
            window.addEventListener('resize', updateBackToTop);
        })();

        function scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // =================================================================
        // CEK STATUS LOGIN -> ubah tombol navbar (desktop & mobile) jadi "Buka Dashboard"
        // =================================================================
        (function checkLoginState() {
            const saved = localStorage.getItem('cn_user');
            if (!saved) return;
            try {
                const user = JSON.parse(saved);
                if (!user || !user.role) return;
                const isAdmin = user.role === 'admin';
                const target = isAdmin ? 'admin.html' : 'dashboard.html';
                const label = isAdmin ? 'Buka Panel Admin' : 'Buka Dashboard';
                const icon = isAdmin ? 'fa-user-shield' : 'fa-gauge';

                document.getElementById('nav-auth-area').innerHTML =
                    '<button class="btn btn-dashboard-nav" onclick="cnGoTo(\'' + target + '\')">' +
                    '<i class="fa-solid ' + icon + ' me-1"></i> ' + label + '</button>';

                document.getElementById('mobile-nav-auth-area').innerHTML =
                    '<button class="btn-dashboard-nav-mobile" onclick="cnGoTo(\'' + target + '\')">' +
                    '<i class="fa-solid ' + icon + ' me-1"></i> ' + label + '</button>';

                // Tombol CTA di hero & bagian bawah landing page -- kalau sudah
                // login, tidak masuk akal lagi menawarkan "Daftar", jadi diganti
                // jadi jalan pintas ke dashboard/panel admin masing-masing.
                const heroBtn = document.getElementById('hero-cta-btn');
                if (heroBtn) {
                    heroBtn.setAttribute('onclick', "cnGoTo('" + target + "')");
                    heroBtn.innerHTML = label + ' <i class="fa-solid fa-arrow-right ms-1"></i>';
                }

                const ctaBottomBtn = document.getElementById('cta-bottom-btn');
                if (ctaBottomBtn) {
                    ctaBottomBtn.setAttribute('onclick', "cnGoTo('" + target + "')");
                    ctaBottomBtn.textContent = label;
                }
            } catch (e) {
                localStorage.removeItem('cn_user');
            }
        })();

        // =================================================================
        // MOBILE MENU
        // =================================================================
        function positionMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const navbar = document.querySelector('.navbar-cakar');
            if (!menu || !navbar) return;
            menu.style.top = (navbar.offsetHeight + 10) + 'px';
        }

        function toggleMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('mobileMenuBtn');
            const backdrop = document.getElementById('mobileMenuBackdrop');
            positionMobileMenu();
            const isOpen = menu.classList.toggle('open');
            backdrop.classList.toggle('open', isOpen);
            document.body.classList.toggle('mobile-menu-locked', isOpen);
            btn.classList.toggle('is-open', isOpen);
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            btn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
        }

        function closeMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('mobileMenuBtn');
            const backdrop = document.getElementById('mobileMenuBackdrop');
            menu.classList.remove('open');
            backdrop.classList.remove('open');
            document.body.classList.remove('mobile-menu-locked');
            btn.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        }

        // Menutup menu TANPA animasi (langsung), dipakai sebelum menghitung
        // posisi scroll supaya tidak ada sisa transisi saat berpindah section.
        function closeMobileMenuInstant() {
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('mobileMenuBtn');
            const backdrop = document.getElementById('mobileMenuBackdrop');
            const wasOpen = menu.classList.contains('open');
            if (wasOpen) {
                menu.style.transition = 'none';
                menu.classList.remove('open');
                void menu.offsetHeight; // paksa reflow sebelum transition dikembalikan
                menu.style.transition = '';
            }
            backdrop.classList.remove('open');
            document.body.classList.remove('mobile-menu-locked');
            btn.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        }

        // Navigasi ke section dengan offset navbar yang benar, dihitung
        // SETELAH menu mobile (kalau lagi terbuka) sudah benar-benar tertutup.
        function scrollToSection(id) {
            closeMobileMenuInstant();
            requestAnimationFrame(() => {
                const target = document.getElementById(id);
                if (!target) return;
                const navbar = document.querySelector('.navbar-cakar');
                const offset = (navbar ? navbar.offsetHeight : 70) + 16;
                const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' });
            });
        }

        // =================================================================
        // MODAL AUTH
        // =================================================================
        function openAuthModal(tab) {
            switchTab(tab || 'login');
            if (!authModalInstance) {
                authModalInstance = new bootstrap.Modal(document.getElementById('authModal'));
            }
            authModalInstance.show();
        }

        function switchTab(tab) {
            document.getElementById('tab-btn-login').classList.toggle('active', tab === 'login');
            document.getElementById('tab-btn-register').classList.toggle('active', tab === 'register');

            const loginView = document.getElementById('view-login');
            const registerView = document.getElementById('view-register');
            const showEl = tab === 'login' ? loginView : registerView;
            const hideEl = tab === 'login' ? registerView : loginView;

            if (showEl.classList.contains('active')) return; // sudah di tab ini

            // Setiap geser tab (baik ke Masuk maupun ke Daftar), tanda
            // merah/hijau "wajib diisi"/valid di form Daftar dihitung ulang
            // berdasarkan isinya SEKARANG -- supaya kalau sebelumnya sempat
            // ditandai merah semua (mis. klik Daftar padahal masih kosong),
            // terus geser ke Masuk, begitu balik lagi ke Daftar tandanya
            // sudah tidak nyangkut merah lagi.
            resetTandaValidasiDaftar();

            // Waktu modal BELUM tampil (mis. openAuthModal() dipanggil dari
            // tombol Masuk/Daftar di navbar), tidak perlu animasi apa pun --
            // langsung tukar saja supaya begitu modalnya muncul, tab yang
            // benar sudah aktif dari awal.
            const authModalEl = document.getElementById('authModal');
            const modalSudahTampil = authModalEl && authModalEl.classList.contains('show');
            if (!modalSudahTampil) {
                hideEl.classList.remove('active');
                showEl.classList.add('active');
                return;
            }

            // Daftar ada di sebelah KANAN Masuk pada tombol tab -- jadi
            // pindah ke Daftar berarti geser ke kanan ("maju"), dan pindah
            // ke Masuk berarti geser ke kiri ("mundur"), lihat
            // animateAuthTabSwitch().
            const arahMaju = tab === 'register';
            animateAuthTabSwitch(hideEl, showEl, arahMaju);
        }

        // Animasikan perpindahan Masuk <-> Daftar: form lama geser & fade
        // keluar ke arah tab yang ditinggalkan, form baru geser & fade
        // masuk dari arah tab yang dituju (searah posisi tombol Masuk/
        // Daftar, kiri-kanan) -- sekaligus tinggi pembungkusnya
        // (#auth-views-wrap) menyesuaikan otomatis ke tinggi form yang
        // baru, karena form Daftar jauh lebih panjang dari Masuk, tanpa
        // ini perpindahannya kelihatan "meloncat" tiba-tiba.
        function animateAuthTabSwitch(hideEl, showEl, arahMaju) {
            const wrap = document.getElementById('auth-views-wrap');
            if (!wrap) {
                hideEl.classList.remove('active');
                showEl.classList.add('active');
                return;
            }

            const startHeight = wrap.getBoundingClientRect().height;
            wrap.style.height = startHeight + 'px';
            // Paksa browser "mengunci" tinggi awal ini dulu (reflow) sebelum
            // konten & class-nya diganti di bawah. Tanpa baris ini, browser
            // kadang menggabungkan perubahan tinggi awal & tinggi akhir jadi
            // satu langkah instan (tanpa transisi yang mulus) -- itu yang
            // kelihatan seperti kedipan/flicker.
            void wrap.offsetHeight;
            wrap.classList.add('auth-views-animating');

            // Maju (Masuk -> Daftar): form lama keluar ke kiri, form baru
            // masuk dari kanan. Mundur (Daftar -> Masuk): sebaliknya.
            const kelasKeluar = arahMaju ? 'auth-view-leaving-ke-kiri' : 'auth-view-leaving-ke-kanan';
            const kelasMasuk = arahMaju ? 'auth-view-entering-from-kanan' : 'auth-view-entering-from-kiri';

            hideEl.classList.remove('active');
            hideEl.classList.add(kelasKeluar);

            showEl.classList.add('active', kelasMasuk);

            // Catatan penting: target tinggi TIDAK diambil dari
            // showEl.scrollHeight. Karena .auth-views-wrap punya
            // "overflow: hidden" (dibutuhkan untuk animasi ini sendiri),
            // margin atas/bawah milik showEl TIDAK ikut "collapse" ke luar
            // wrap seperti biasanya -- malah ikut dihitung sebagai bagian
            // dari tinggi wrap. Akibatnya showEl.scrollHeight (yang cuma
            // menghitung box milik showEl sendiri, tanpa marginnya) selalu
            // sedikit LEBIH KECIL dari tinggi asli wrap kalau dibiarkan
            // auto -- selisih inilah yang bikin animasinya "kurang jauh"
            // lalu terasa meloncat/kedip waktu tinggi wrap di-reset ke
            // auto di akhir (bersihkan()). Makanya di sini tinggi wrap
            // yang SEBENARNYA diukur langsung dengan melepas kuncian
            // tingginya sesaat (tanpa sempat digambar browser, jadi tidak
            // kelihatan), lalu langsung dikunci lagi ke startHeight.
            wrap.style.height = '';
            const targetHeight = wrap.getBoundingClientRect().height;
            wrap.style.height = startHeight + 'px';

            // Pakai DUA requestAnimationFrame (bukan satu) -- browser perlu
            // benar-benar selesai menggambar frame dengan tinggi awal & form
            // baru dulu, baru transisi ke tinggi target dipicu di frame
            // berikutnya. Kalau cuma satu rAF, kadang frame "sebelum" itu
            // belum sempat digambar duluan sehingga transisinya meloncat
            // (bukan mulus) -- itulah penyebab kedipannya.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    wrap.style.height = targetHeight + 'px';
                });
            });

            let selesai = false;
            function bersihkan() {
                if (selesai) return;
                selesai = true;
                hideEl.classList.remove('auth-view-leaving-ke-kiri', 'auth-view-leaving-ke-kanan');
                showEl.classList.remove('auth-view-entering-from-kanan', 'auth-view-entering-from-kiri');
                wrap.classList.remove('auth-views-animating');
                // Kembalikan ke "auto" supaya perubahan tinggi berikutnya
                // (mis. muncul keterangan error di bawah salah satu field)
                // tidak ikut kepotong oleh tinggi yang sempat dikunci ini.
                wrap.style.height = '';
                wrap.removeEventListener('transitionend', onTransisiSelesai);
            }
            function onTransisiSelesai(e) {
                if (e.target === wrap && e.propertyName === 'height') bersihkan();
            }
            wrap.addEventListener('transitionend', onTransisiSelesai);
            setTimeout(bersihkan, 400); // jaga-jaga kalau transitionend tidak terpicu
        }

        // =================================================================
        // HELPER: set tombol loading
        // =================================================================
        function setButtonLoading(button, loading, loadingText) {
            const textEl = button.querySelector('.btn-text');
            if (loading) {
                button.disabled = true;
                button.dataset.originalText = textEl.textContent;
                textEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + loadingText;
            } else {
                button.disabled = false;
                textEl.textContent = button.dataset.originalText || textEl.textContent;
            }
        }

        // =================================================================
        // LOGIN
        // =================================================================
        document.getElementById('form-login').addEventListener('submit', async function (e) {
            e.preventDefault();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-login-submit');

            if (!email || !password) {
                Swal.fire({ icon: 'warning', title: 'Belum lengkap', text: 'Email dan kata sandi wajib diisi.' });
                return;
            }

            setButtonLoading(btn, true, 'Memproses...');

            try {
                const res = await fetch(API_BASE + 'login.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    localStorage.setItem('cn_user', JSON.stringify(result.data));
                    // Simpan (atau hapus, kalau checkbox-nya tidak dicentang)
                    // email & kata sandi "yang baru saja terbukti benar" --
                    // lihat catatan lengkap soal ini di simpanAtauHapusIngatLogin().
                    simpanAtauHapusIngatLogin(email, password);
                    await Swal.fire({
                        icon: 'success',
                        title: 'Login berhasil',
                        text: 'Selamat datang, ' + result.data.name + '!',
                        timer: 1200,
                        showConfirmButton: false
                    });
                    cnGoTo((result.data.role === 'admin') ? 'admin.html' : 'dashboard.html');
                } else {
                    Swal.fire({ icon: 'error', title: 'Gagal masuk', text: result.message || 'Terjadi kesalahan.' });
                }
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
            } finally {
                setButtonLoading(btn, false);
            }
        });

        // =================================================================
        // REGISTER
        // =================================================================
        document.getElementById('form-register').addEventListener('submit', async function (e) {
            e.preventDefault();

            const name = document.getElementById('register-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const passwordConfirm = document.getElementById('register-password-confirm').value;
            const btn = document.getElementById('btn-register-submit');

            // Kolom yang masih kosong cukup ditandai merah di field-nya
            // langsung (bukan lewat dialog terpisah) -- tandanya otomatis
            // hilang begitu peserta mulai mengisinya (lihat cekNama/cekEmail/
            // cekPassword/cekConfirm di initValidasiRegister()).
            let adaKosong = false;
            if (!name) { cnSetValidasiInput(document.getElementById('register-name'), false); adaKosong = true; }
            if (!email) { cnSetValidasiInput(document.getElementById('register-email'), false); adaKosong = true; }
            if (!password) { cnSetValidasiInput(document.getElementById('register-password'), false); adaKosong = true; }
            if (!passwordConfirm) { cnSetValidasiInput(document.getElementById('register-password-confirm'), false); adaKosong = true; }
            if (adaKosong) return;

            if (name.length > 30) {
                Swal.fire({ icon: 'warning', title: 'Nama terlalu panjang', text: 'Nama maksimal 30 karakter.' });
                return;
            }
            if (!cnValidasiFormatEmail(email)) {
                Swal.fire({ icon: 'warning', title: 'Email tidak valid', text: 'Masukkan alamat email yang benar (harus mengandung @ dan akhiran domain yang wajar, mis. .com atau .id).' });
                return;
            }
            const pesanKesalahanPassword = cnValidasiKekuatanPassword(password);
            if (pesanKesalahanPassword) {
                Swal.fire({ icon: 'warning', title: 'Kata sandi kurang kuat', text: pesanKesalahanPassword });
                return;
            }
            // Sejak percobaan submit ini, konfirmasi kata sandi "sudah dicoba"
            // -- mulai sekarang, ketikan berikutnya di field ini langsung
            // dapat feedback lengkap (ceklis begitu cocok, keterangan begitu
            // tidak cocok), bukan cuma border merah lagi (lihat cekConfirm()
            // di initValidasiRegister()).
            document.getElementById('register-password-confirm').dataset.dicoba = '1';

            if (password !== passwordConfirm) {
                cnSetValidasiInput(document.getElementById('register-password-confirm'), false);
                cnSetValidasiHint(document.getElementById('register-password-confirm-hint'), 'Konfirmasi belum sama dengan kata sandi di atas', false);
                return;
            }
            cnSetValidasiInput(document.getElementById('register-password-confirm'), true);
            cnToggleCheckIcon(document.getElementById('register-password-confirm-check'), true);

            setButtonLoading(btn, true, 'Memproses...');

            try {
                const res = await fetch(API_BASE + 'register.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    await Swal.fire({
                        icon: 'success',
                        title: 'Pendaftaran berhasil',
                        text: 'Silakan masuk dengan akun barumu.',
                        confirmButtonColor: '#0C7A6E'
                    });
                    resetAuthModalForms();
                    document.getElementById('login-email').value = email;
                    switchTab('login');
                } else {
                    Swal.fire({ icon: 'error', title: 'Gagal mendaftar', text: result.message || 'Terjadi kesalahan.' });
                }
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Tidak bisa terhubung', text: 'Periksa koneksi internet dan coba lagi.' });
            } finally {
                setButtonLoading(btn, false);
            }
        });

        // --- Validasi real-time email, kata sandi & konfirmasinya ---
        // (border merah/hijau + keterangan dinamis di bawah tiap field)
        (function initValidasiRegister() {
            const nameEl = document.getElementById('register-name');
            const nameCounterEl = document.getElementById('register-name-counter');
            const emailEl = document.getElementById('register-email');
            const emailHintEl = document.getElementById('register-email-hint');
            const emailCheckEl = document.getElementById('register-email-check');
            const passwordEl = document.getElementById('register-password');
            const passwordHintEl = document.getElementById('register-password-hint');
            const confirmEl = document.getElementById('register-password-confirm');
            const confirmHintEl = document.getElementById('register-password-confirm-hint');
            const confirmCheckEl = document.getElementById('register-password-confirm-check');
            if (!emailEl || !passwordEl || !confirmEl) return;

            const TEKS_DEFAULT_PASSWORD = 'Minimal 8 karakter, kombinasi huruf & angka.';

            function cekNama() {
                cnSetValidasiHint(nameCounterEl, nameEl.value.length + '/30', null);
                // Hapus tanda merah "wajib diisi" (kalau ada, dari percobaan
                // submit sebelumnya) begitu peserta mulai mengetik lagi.
                cnSetValidasiInput(nameEl, null);
            }

            function cekEmail() {
                const val = emailEl.value.trim();
                if (!val) {
                    cnSetValidasiInput(emailEl, null);
                    cnSetValidasiHint(emailHintEl, '', null);
                    cnToggleCheckIcon(emailCheckEl, false);
                    return;
                }
                const valid = cnValidasiFormatEmail(val);
                cnSetValidasiInput(emailEl, valid);
                cnSetValidasiHint(emailHintEl, '', valid);
                cnToggleCheckIcon(emailCheckEl, valid);
            }

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
            // juga (real-time, tidak perlu menunggu klik Daftar). Tapi
            // selama BELUM cocok: sebelum pernah klik Daftar cukup ditandai
            // merah saja tanpa keterangan; begitu peserta pernah klik
            // Daftar (ditandai lewat confirmEl.dataset.dicoba, diset di
            // submit handler form-register), ketikan berikutnya yang masih
            // tidak cocok langsung menampilkan keterangannya juga.
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

            if (nameEl && nameCounterEl) {
                nameEl.addEventListener('input', cekNama);
                cekNama();
            }
            emailEl.addEventListener('input', cekEmail);
            passwordEl.addEventListener('input', function () { cekPassword(); cekConfirm(); });
            confirmEl.addEventListener('input', cekConfirm);
        })();