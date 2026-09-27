# Aktivasi dashboard, peserta ujian, kalender, dan jadwal mengajar

Pembaruan ini berada pada branch `feature/learning-dashboard-schedules`. Gunakan Spreadsheet salinan dan Vercel Preview untuk pemeriksaan terlebih dahulu. Mengirim branch/PR belum berarti perubahan sudah masuk ke Production.

## 1. Siapkan kode pada komputer

Buka PowerShell di folder `Ujian-daring`, lalu periksa:

```powershell
git status
```

Jika terdapat file pekerjaan Anda yang belum disimpan ke Git, simpan pekerjaan itu terlebih dahulu. Jangan menggunakan `reset --hard` atau menghapus file untuk memaksa pindah branch.

Jika working tree bersih:

```powershell
git fetch origin
git switch feature/learning-dashboard-schedules
git pull --ff-only origin feature/learning-dashboard-schedules
npm.cmd install
node --version
```

Gunakan Node.js 20 atau lebih baru. Branch ini berisi perubahan baru; jangan menjalankan setup dari salinan kode lama.

## 2. Arahkan setup lokal ke Spreadsheet preview

1. Gunakan Spreadsheet **salinan**, bukan Spreadsheet utama yang dipakai siswa sehari-hari.
2. Dari URL `https://docs.google.com/spreadsheets/d/ID_SPREADSHEET/edit`, salin bagian `ID_SPREADSHEET`.
3. Buka `.env` lokal, lalu isi `SPREADSHEET_ID` dengan ID salinan tersebut. Biarkan kredensial Google yang masih valid tetap seperti sebelumnya.
4. Pastikan Spreadsheet salinan telah dibagikan sebagai **Editor** ke alamat service account yang digunakan oleh `GOOGLE_CLIENT_EMAIL`.
5. Simpan `.env`. Perubahan `.env` tidak tampil di `git status` karena sengaja diabaikan Git. `working tree clean` setelah mengubah `.env` adalah normal.

Untuk memastikan tujuan setup tanpa menampilkan secret lain:

```powershell
node --env-file=.env -e "console.log('Spreadsheet tujuan:', process.env.SPREADSHEET_ID)"
```

Cocokkan ID yang tampil dengan URL Spreadsheet salinan.

## 3. Buat empat tab tambahan

Jalankan:

```powershell
node --env-file=.env scripts/setup-sheet.mjs
```

Jangan menambahkan `--demo` pada database yang sudah digunakan. Skrip memeriksa header, membuat tab yang belum ada, dan tidak menghapus baris data lama. Jika ada header yang berbeda dari format aplikasi, skrip berhenti dengan pesan; periksa tab yang disebutkan sebelum melanjutkan.

| Tab | Kegunaan |
|---|---|
| `PESERTA_UJIAN` | Kelas dan daftar ID siswa yang ditetapkan untuk suatu ujian |
| `JADWAL` | Jadwal mingguan beserta periode berlakunya; versi perubahan disimpan sebagai baris baru |
| `JADWAL_PENGECUALIAN` | Pembatalan satu pertemuan beserta alasan |
| `FOTO_PROFIL` | Thumbnail JPEG profil untuk akun yang bersangkutan |

Keempat tab baru ini tidak perlu dibuat manual. Tab pembelajaran/absensi dari versi sebelumnya tetap digunakan.

Jika tab baru belum ada, ujian lama masih memakai cakupan akses sebelumnya. Kalender pelajaran dan pengaturan peserta memerlukan setup. Kegagalan autentikasi atau koneksi Google tetap ditampilkan sebagai kesalahan, bukan dianggap sebagai tabel kosong.

## 4. Hubungkan Vercel Preview ke salinan yang sama

Setup lokal dan konfigurasi Vercel adalah dua hal terpisah. `.env` pada komputer tidak otomatis terkirim ke Vercel.

1. Buka project **ujian-daring → Settings → Environment Variables**.
2. Tambahkan/atur `SPREADSHEET_ID` untuk lingkungan **Preview**, dengan ID Spreadsheet salinan.
3. Bila menggunakan pembatasan branch, pilih **`feature/learning-dashboard-schedules`**. Konfigurasi yang hanya berlaku untuk `ui/reference-dashboards` tidak berlaku otomatis untuk branch baru ini.
4. Pastikan `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `HASH_SECRET`, `SESSION_SECRET`, dan `ADMIN_HASH` tersedia bagi branch Preview tersebut. Kredensial yang dibagikan ke Production dan Preview dapat tetap digunakan jika akun layanan memiliki akses ke kedua spreadsheet dan hash/PIN cocok dengan secret yang digunakan.
5. Untuk pengujian upload tugas, pastikan juga variabel Drive yang sudah dipakai tersedia bagi branch ini: `DRIVE_OAUTH_CLIENT_ID`, `DRIVE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`, dan `ASSIGNMENT_DRIVE_FOLDER_ID` (atau konfigurasi Shared Drive sesuai panduan pembelajaran).
6. Simpan, lalu **Redeploy deployment Preview** branch ini. Perubahan environment baru digunakan oleh deployment baru.

Pembaruan dashboard/jadwal tidak memerlukan secret baru. Foto profil menggunakan thumbnail kecil di Sheets; upload tugas tetap memakai alur Drive sebelumnya. Gunakan folder tugas preview terpisah jika berkas latihan perlu dipisahkan dari tugas asli.

## 5. Tetapkan peserta ujian

1. Login guru/admin → **Monitor Ujian**.
2. Pilih ujian yang belum mempunyai percobaan siswa.
3. Buka panel **Cakupan peserta belum ditetapkan**.
4. Centang kelas, misalnya **XI DKV**. Daftar siswa aktif kelas itu akan muncul.
5. Jika ada siswa yang tidak mengikuti ujian, hilangkan centangnya.
6. Periksa jumlah pilihan → **Simpan peserta ujian**.
7. Ringkasan monitor menampilkan **Peserta terdaftar**, **Belum mulai**, **Mengerjakan**, dan **Selesai** untuk ujian itu.

Pembatasan juga diperiksa di server saat mulai ujian. Menyembunyikan kartu saja tidak digunakan sebagai pengamanan. Daftar peserta merupakan snapshot saat disimpan; perpindahan kelas sesudahnya tidak otomatis mengubah peserta ujian.

Setelah ada percobaan, daftar dikunci, termasuk bila percobaan tersebut sudah di-reset. Ini menjaga akses dan riwayat ujian berjalan. Untuk cakupan peserta baru, buat ujian baru. Ujian lama tanpa daftar eksplisit menampilkan **Pernah mulai**, bukan menganggap seluruh siswa sekolah sebagai peserta; aturan akses lamanya tetap berlaku.

## 6. Buat dan gunakan jadwal mengajar

1. Login guru/admin → **Jadwal & kalender → Tambah jadwal**.
2. Pilih kelas dan guru. Akun guru harus sudah aktif pada fitur akun guru. `Admin utama` tersedia bila belum menggunakan akun guru terpisah.
3. Isi mata pelajaran, ruang bila diperlukan, hari, jam mulai/selesai, tanggal berlaku dari/sampai.
4. Semua jam memakai **WITA**, meskipun perangkat dibuka dari zona waktu lain.
5. Pilih **DRAF** untuk menyiapkan, atau **TERBIT** untuk menampilkan kepada siswa kelas tersebut. **ARSIP** tidak menghasilkan pertemuan.
6. Simpan. Jadwal Terbit yang bentrok pada kelas atau guru yang sama akan ditolak. Jam selesai satu pelajaran boleh sama dengan jam mulai pelajaran berikutnya.
7. Login siswa kelas tujuan → **Jadwal & kalender**. Siswa hanya menerima jadwal Terbit untuk kelasnya saat ini; draf dan kelas lain tidak ikut dikirim.

Hari jadwal harus muncul di dalam rentang tanggal berlaku supaya ada pertemuan. Tampilan bulan/agenda dapat diganti. Klik tanggal untuk melihat kegiatan, lalu **Buka** untuk menuju menu terkait. Pengingat berupa agenda di aplikasi; belum berupa push notification, WhatsApp, atau email.

### Menghubungkan jadwal ke absensi

1. Pada hari pertemuan, buka **Jadwal & kalender → Pertemuan bulan ini**.
2. Klik **Buka absensi** pada pertemuan hari ini.
3. Aplikasi memakai ID sesi tetap untuk kombinasi jadwal dan tanggal, menyalin siswa aktif kelas sebagai peserta, lalu membuka halaman **Absensi QR**.
4. Pindai QR seperti sebelumnya. Isi Izin, Sakit, Terlambat, atau koreksi melalui **Kehadiran**.
5. Tutup sesi setelah pencatatan selesai. Membuka kembali pertemuan yang sama menggunakan sesi yang sudah ada; sesi yang sudah ditutup tidak dibuat ulang.

Jika kelas masih mempunyai sesi absensi terbuka, tutup sesi tersebut dahulu. Pembukaan hanya diizinkan untuk tanggal hari ini WITA. Jadwal tidak otomatis membuat absensi atau Alpa tanpa tindakan guru. Alur absensi manual tetap tersedia untuk kegiatan di luar jadwal.

### Libur atau perubahan jadwal

- **Satu pertemuan libur:** klik **Batalkan pertemuan**, lalu tulis alasan. Siswa melihat pembatalannya. Tidak ada sesi absensi/Alpa yang dibuat untuk pembatalan itu. Pembatalan ditolak bila absensi pertemuan sudah dibuat; koreksi kehadiran melalui menu Kehadiran.
- **Perubahan jadwal rutin yang sudah berjalan:** klik **Akhiri masa berlaku**, masukkan tanggal terakhir jadwal lama tetap berlaku (hari ini atau setelahnya), lalu buat jadwal pengganti mulai hari sesudah tanggal tersebut. Pertemuan lama tetap ada.
- **Jadwal yang belum mulai atau masih Draf:** gunakan **Edit jadwal**. Jadwal Terbit yang sudah berlaku dikunci agar waktu dan kelas riwayatnya tidak berubah.

## 7. Membaca dashboard dan profil

- Dashboard siswa/guru memisahkan statistik kehadiran, tugas, dan ujian. Tidak ada satu skor gabungan yang mencampur tiga jenis aktivitas berbeda.
- Kehadiran = `(Hadir + Terlambat) / catatan berstatus final × 100%`. Izin, Sakit, dan Alpa tetap dirinci. Belum dicatat tidak masuk pembagi. Angka kosong ditampilkan sebagai `—`, bukan 0%.
- Filter periode berlaku bagi tanggal sesi kehadiran. Untuk tugas/ujian, batas bawah periode mengikuti tenggat/akhir ujian; jadwal mendatang juga disertakan. Kalender mengikuti bulan yang dipilih. Grafik mingguan menunjukkan empat minggu terakhir dalam cakupan filter tersebut.
- Pengumpulan dihitung dari versi terakhir setiap pasangan siswa/tugas. Target admin menggunakan siswa aktif pada kelas saat ini; perpindahan kelas dapat menyebabkan target berbeda dari jumlah pengumpulan historis.
- Progres ujian siswa memuat ujian yang ditugaskan, ujian terbuka yang masih mengikuti aturan lama, serta riwayatnya. Hitungan admin memakai percobaan terbaru per siswa/ujian, mengabaikan RESET. Jumlah peserta yang belum mulai tersedia pada monitor per ujian.
- Profil menampilkan identitas, kontak pribadi, kartu statistik, dan aktivitas. Foto JPG/PNG/WEBP maksimal 8 MB dipotong persegi dan diperkecil menjadi thumbnail 160×160 sebelum dikirim. Server menerima JPEG sekitar 24 KB maksimal. Gambar asli tidak disimpan sebagai foto profil.
- Kontak/foto profil hanya dikembalikan ke akun pemilik. Mengubah profil tidak mengubah ID atau penempatan kelas. Akun guru tetap mengikuti izin admin versi sebelumnya; pemilihan guru pada jadwal **belum** menjadi pembatasan akses mengelola kelas.
- Menu **Kelas** mempunyai tab **Daftar kelas**, **Penempatan siswa**, dan **Riwayat perpindahan**. Formulir dan alur pemindahan sebelumnya tetap dipakai.

## 8. Pemeriksaan Preview sebelum merge

Gunakan dua siswa uji dari kelas berbeda dan satu akun guru:

1. Pastikan login membuka Dashboard dan seluruh menu bisa dibuka pada desktop dan ponsel.
2. Tetapkan ujian hanya bagi kelas A; pastikan siswa B tidak melihat atau dapat memulai ujian tersebut. Coba login, mulai, simpan jawaban, lanjutkan, kumpulkan, dan lihat nilai dengan siswa A.
3. Periksa jumlah peserta saat belum ada siswa mulai, saat mengerjakan, setelah selesai, dan setelah reset. RESET tidak menambah jumlah siswa unik.
4. Buat jadwal Draf, kemudian Terbit. Coba benturan guru/kelas, pembatalan satu tanggal, dan pergantian jadwal setelah masa berlaku diakhiri.
5. Buka absensi pertemuan hari ini dua kali; pastikan kembali ke sesi yang sama. Catat Hadir/Izin/Sakit, tutup sesi, dan periksa diagram/rincian siswa.
6. Uji tugas dengan tenggat hari ini. Unggah foto/PDF melalui alur lama, beri nilai sebagai guru, dan periksa kartu/dashboard/kalender siswa.
7. Simpan profil dan foto pada dua akun; pastikan identitas tidak tertukar. Periksa nama panjang, data kosong, dan koneksi yang terputus.
8. Bandingkan dashboard dengan data Spreadsheet uji. Periksa tanggal/jam WITA dan filter kelas/periode.

Pengujian otomatis menggunakan fixture, bukan kredensial atau database sekolah. Workflow **Portal QA** menjalankan 52 pengujian Node dan uji Chromium pada akun siswa/admin dengan lebar 1440 px serta 390 px. Uji browser meliputi navigasi, simpan profil, kalender, jadwal, pembukaan absensi, peserta ujian, tab kelas, dan pemeriksaan lebar halaman. Screenshot dan laporan disimpan sebagai artifact `portal-browser-qa` di GitHub Actions selama tujuh hari. Semua skenario tersebut telah lulus; uji penerimaan dengan koneksi Sheets/Drive dan akun uji nyata tetap diperlukan sebelum persetujuan merge.

Untuk menjalankan uji browser yang sama di komputer pengembang, gunakan dependency QA sementara (tidak menambah dependency aplikasi):

```powershell
npm.cmd install --no-save --package-lock=false playwright@1.58.2
npx.cmd playwright install chromium
node scripts/qa/portal-smoke.mjs
```

Laporan dan screenshot berada di folder `qa-output`, yang diabaikan Git. Tes memakai server lokal dan respons API tiruan; tidak membaca `.env` atau mengirim data ke Spreadsheet.

## 9. Production setelah disetujui

Backup Spreadsheet utama, jalankan setup dari kode baru dengan `.env` yang diarahkan ke Spreadsheet utama, kemudian merge/deploy setelah hasil Preview disetujui. Periksa `SPREADSHEET_ID` **Production** tetap menunjuk database utama. Jangan menggantinya dengan ID salinan. Tidak perlu mengganti secret atau OAuth yang sudah valid hanya karena pembaruan dashboard.

Google Sheets belum menyediakan transaksi/kunci lintas instance. ID pertemuan tetap dan penulisan peserta lebih dahulu membantu retry biasa; dua permintaan serentak masih berpotensi menulis baris ganda. Hindari dua guru membuka pertemuan yang sama bersamaan. Pembatasan concurrency menyeluruh memerlukan penyimpanan transaksional atau layanan kunci tambahan.
