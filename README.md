# UJIAN DARING DKV XI (versi Vercel)

Porting dari paket Google Apps Script (`PANDUAN_INSTALASI.md` v1.0) ke Vercel. Tampilan,
alur ujian, aturan penilaian, dan format sheet **tidak berubah** — yang diganti hanya "mesin"
di belakangnya.

> **Catatan penting:** paket Apps Script asli **belum pernah dipasang** ke akun Google mana
> pun (lihat bagian *Status* di `PANDUAN_INSTALASI.md`). Artinya belum ada PIN siswa atau
> kata sandi admin yang sudah dibuat sebelumnya — jadi porting ini bebas menentukan skema
> keamanannya sendiri tanpa perlu menjaga kompatibilitas dengan data lama.

## Apa yang berubah

| Apps Script | Versi Vercel |
|---|---|
| `google.script.run` | `fetch('/api/...')` biasa |
| `SpreadsheetApp` | Google Sheets API + Service Account |
| `DriveApp` (gambar privat) | Google Drive API + Service Account |
| `CacheService` (sesi, throttle login) | Token HMAC (sesi) + sheet `LOGIN_LIMIT` (throttle) |
| `LockService` (kunci saat mulai/simpan/kumpulkan) | **Tidak ada padanan penuh** — lihat bagian *Batasan concurrency* di bawah |
| `setupSystem_()` / `generatePins_()` | Skrip Node dijalankan sekali dari komputer guru |
| beberapa `getRange().getValues()` | satu `values.batchGet` per permintaan (lihat *Optimasi kuota*) |

## ⚠️ Batasan concurrency yang perlu Anda ketahui

Versi Apps Script memakai `LockService` supaya saat siswa klik "Mulai Ujian" atau menyimpan
jawaban, hanya satu proses yang boleh mengubah baris `SESI` pada saat bersamaan — ini
mencegah dua percobaan aktif tercipta untuk siswa yang sama.

Vercel berjalan sebagai banyak fungsi serverless yang terpisah, dan Google Sheets API
**tidak menyediakan kunci lintas-proses** seperti `LockService`. Versi ini memakai strategi
"baca ulang tepat sebelum menulis" untuk meminimalkan risiko, tapi celah kecil tetap ada:

- **Risiko nyata:** hampir nol untuk pemakaian normal (satu siswa, satu perangkat, klik sekali).
- **Skenario yang bisa memicu masalah:** siswa yang sama membuka ujian di **dua tab/perangkat
  secara bersamaan** dan menekan "Mulai" di detik yang sama persis. Ini bisa membuat dua baris
  `SEDANG` tercipta untuk siswa itu.
- **Mitigasi:** ingatkan siswa memakai satu perangkat, satu tab. Untuk 35 siswa yang login
  bergiliran (sesuai anjuran panduan asli), risiko ini secara praktis dapat diabaikan.
- Kalau Anda butuh jaminan atomik penuh, solusinya menambah layanan kunci terpisah (mis.
  Upstash Redis — juga gratis untuk skala ini). Ini di luar cakupan paket ini, tapi bisa
  ditambahkan kalau diperlukan.

## Langkah 1 — Buat Service Account dengan dua izin

Sama seperti sebelumnya, tapi kali ini akun layanan butuh **dua akses**: Spreadsheet (baca-tulis)
dan Drive (baca saja, untuk gambar soal).

1. Buka <https://console.cloud.google.com> → buat/gunakan project.
2. **APIs & Services → Library** → aktifkan **Google Sheets API** dan **Google Drive API**.
3. **Credentials → Create Credentials → Service Account** → buat, lalu buka tab **Keys →
   Add Key → JSON**. Simpan berkas JSON-nya.
4. **Spreadsheet:** buat Spreadsheet baru (kosong), lalu **Share** → tempel `client_email`
   dari JSON → beri akses **Editor**.
5. **Folder gambar Drive (kalau memakai soal bergambar):** buat folder khusus, **Share** →
   tempel `client_email` yang sama → beri akses **Viewer**. Gambar tetap privat dari publik;
   hanya akun layanan dan guru pemilik folder yang bisa mengaksesnya, persis seperti versi
   Apps Script.

## Langkah 2 — Environment Variables

| Variabel | Isi |
|---|---|
| `SPREADSHEET_ID` | bagian di antara `/d/` dan `/edit` pada URL spreadsheet |
| `GOOGLE_CLIENT_EMAIL` | `client_email` dari JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari JSON, lengkap dengan `-----BEGIN...` |
| `HASH_SECRET` | teks acak panjang bebas (baru — tidak perlu disalin dari mana pun) |
| `SESSION_SECRET` | teks acak panjang bebas lainnya |
| `ADMIN_HASH` | hasil perintah di bawah |
| `SESSION_TTL_SECONDS` | opsional, standar 21600 (6 jam), sama seperti `CFG.SESSION_SECONDS` asli |
| `SHEET_CACHE_MS` | opsional, standar `0` (mati). Lihat *Optimasi kuota* di bawah |
| `SHUFFLE_QUESTIONS` | opsional, standar `NO`; isi `YA` untuk mengacak urutan soal secara konsisten per sesi |

Menghasilkan `ADMIN_HASH`:

```bash
node scripts/hash-secret.mjs "isi-HASH_SECRET-anda" "kata-sandi-admin-yang-diinginkan"
```

Kata sandi admin sebaiknya **minimal 12 karakter**, sesuai anjuran panduan asli.

### Pengacakan soal (opsional)

Pengacakan urutan soal belum aktif secara default agar perilaku ujian yang sedang
berjalan tidak berubah. Setelah guru menguji fitur pada salinan/ujian latihan, isi
`SHUFFLE_QUESTIONS=YA` pada environment Vercel lalu lakukan redeploy. Urutan soal
ditentukan dari `AttemptID`, sehingga tetap sama ketika siswa memuat ulang atau
melanjutkan sesi yang sama. Penilaian tetap menggunakan `SoalID` dan kunci pada
sheet `SOAL`, bukan posisi soal.

## Langkah 3 — Siapkan struktur Spreadsheet

Buat Spreadsheet kosong (Langkah 1), lalu jalankan sekali dari komputer Anda (Node.js 20+):

```bash
npm install
node --env-file=.env scripts/setup-sheet.mjs
```

Ini membuat 5 tab dengan header yang benar: `SISWA`, `UJIAN`, `SOAL`, `SESI`, `LOGIN_LIMIT`.

### PIN sesi ujian

Kolom H pada tab `UJIAN` digunakan secara opsional untuk menyimpan PIN sesi. Kolom ini
tidak perlu ditambahkan ke baris header lama. Saat admin membuka ujian, aplikasi membuat
PIN acak 6 digit baru. PIN ditampilkan pada panel admin dan harus dimasukkan siswa saat
memulai ujian. Saat ujian ditutup, PIN dihapus; tombol **Acak PIN** pada panel admin juga
dapat digunakan untuk mengganti PIN saat ujian masih terbuka.

Ujian lama yang kolom H-nya kosong tetap berjalan seperti sebelumnya tanpa PIN sesi.

Tambahkan `--demo` untuk sekalian membuat contoh ujian (status `TUTUP`, 5 soal DKV) seperti
`buatContohUjian_()` di versi lama:

```bash
node --env-file=.env scripts/setup-sheet.mjs --demo
```

> Buat berkas `.env` di folder ini (isi seperti `.env.example`) sebelum menjalankan perintah
> di atas — perintah `--env-file=.env` membacanya secara otomatis.

## Langkah 4 — Isi data siswa dan buat PIN

Buka sheet `SISWA`, isi mulai baris kedua:

| ID | Nama | Kelas | Kelompok | PinHash | Aktif |
|---|---|---|---|---|---|
| XI-DKV-001 | (nama asli) | XI DKV | 1 | *(kosongkan)* | YA |

- Set format kolom **A ke Plain text** agar `001` tidak berubah jadi `1`.
- `Aktif` harus tepat `YA`.

Lalu jalankan:

```bash
node --env-file=.env scripts/generate-pins.mjs
```

Sheet `PIN_DISTRIBUSI` akan berisi PIN 8 digit untuk setiap siswa baru. **Bagikan secara
pribadi, lalu hapus sheet itu.** PIN lama (kalau sudah ada hash-nya) tidak akan diubah.

## Langkah 5 — Isi ujian dan soal

Sama seperti panduan asli — isi sheet `UJIAN` dan `SOAL` mengikuti format tabel di
`PANDUAN_INSTALASI.md` bagian 4. Satu perbedaan kecil:

- Kolom `Mulai`/`Selesai` di `UJIAN` tetap ditulis sebagai tanggal-waktu Spreadsheet asli
  atau string `yyyy-mm-dd hh:mm:ss`, dan **selalu ditafsirkan sebagai waktu Asia/Makassar
  (WITA, UTC+8)** oleh server — tidak lagi bergantung pada zona waktu proyek Apps Script,
  jadi Anda tidak perlu mengatur apa pun di Vercel untuk ini.
- Untuk gambar soal: unggah ke folder Drive yang sudah dibagikan ke akun layanan (Langkah 1),
  salin `FILE_ID` dari link-nya ke kolom `DriveFileId`. Maksimal 220 KB per gambar, sama
  seperti aturan asli.

## Langkah 6 — Deploy ke Vercel

**Lewat GitHub (disarankan):**
1. Push folder ini ke repository GitHub baru.
2. Vercel → **Add New → Project** → pilih repo → Framework Preset **Other**.
3. Isi semua Environment Variables dari Langkah 2.
4. **Deploy.**

**Lewat terminal:**
```bash
npm install -g vercel
vercel --prod
```

## Langkah 7 — Uji coba sebelum hari-H

Ikuti alur "Prosedur uji" di `PANDUAN_INSTALASI.md` bagian 9 — semuanya masih berlaku persis
sama di versi ini: dua akun simulasi, login, isi jawaban, refresh, cek panel guru, kumpulkan,
reset, simulasikan koneksi putus, simulasikan waktu habis.

**Tambahan untuk versi Vercel:** karena tidak ada cold-start Apps Script tapi Vercel Hobby
punya cold-start-nya sendiri (server "tidur" saat tidak diakses), minta satu siswa membuka
aplikasi 1–2 menit sebelum sesi login bergiliran dimulai.

## Optimasi kuota Google Sheets

Google Sheets API membatasi **60 permintaan baca per menit** dan **60 permintaan tulis per
menit** untuk satu akun layanan — dan batas itu dibagi oleh SELURUH kelas, bukan per siswa.
Tiga perubahan di bawah ini menurunkan pemakaiannya tanpa mengubah tampilan maupun aturan
ujian sama sekali.

### 1. Satu `values.batchGet` menggantikan beberapa `values.get`

Google menghitung `batchGet` sebagai **satu** permintaan, berapa pun jumlah tab yang diminta.
Setiap panggilan API sekarang mengumpulkan dulu tab apa saja yang dibutuhkan, mengambilnya
sekaligus, lalu berbagi salinan itu ke seluruh fungsi dalam permintaan yang sama — jadi
`getStudents()` dan `dashboardSiswa()` tidak lagi membaca tab `SISWA` dua kali.

| Aksi | Sebelum | Sesudah |
|---|---|---|
| Login siswa (termasuk dashboard) | 6 | **1** |
| Login guru (termasuk panel) | 5 | **1** |
| Muat ulang dashboard siswa | 3 | **1** |
| Mulai ujian | 5 | **2** |
| Lanjutkan ujian | 3 | **1** |
| Autosave jawaban | 2 | **1** |
| Kumpulkan ujian | 4 | **2** |
| Ambil gambar soal | 2 | **1** (atau 0 kalau gambar masih di memori) |
| Muat ulang panel guru | 3 | **1** |
| Buka/tutup ujian, reset percobaan | 5 | **3** |

### 2. Tiket sesi ujian: autosave tidak perlu membaca sheet

Saat siswa menekan **Mulai Ujian**, server sudah tahu di baris `SESI` mana jawabannya
disimpan dan kapan batas waktunya. Data itu ditandatangani (HMAC, kunci `SESSION_SECRET`)
dan dititipkan ke perangkat siswa sebagai *tiket*. Autosave berikutnya cukup memverifikasi
tandatangan lalu menulis langsung ke baris itu — **tanpa membaca sheet lebih dulu**.

- Tiket tidak bisa dipalsukan atau dipakai siswa lain: ID siswa dan ID ujian ikut
  ditandatangani, lalu dicocokkan ulang dengan token sesi pada setiap permintaan.
- Kalau tiket tidak ada atau sudah lewat batas waktu, sistem otomatis kembali ke jalur lama
  (baca dulu, baru tulis) — termasuk untuk menilai ujian yang kehabisan waktu.
- **Pengumpulan (submit) tetap memakai jalur lama** yang memverifikasi status asli di sheet,
  supaya percobaan yang sudah di-RESET guru atau sudah selesai tidak pernah tertimpa.

### 3. Irama autosave yang lebih hemat

Ini perubahan yang paling besar pengaruhnya. Sebelumnya setiap kali siswa mengklik pilihan
jawaban, 1,8 detik kemudian jawabannya dikirim ke server. Untuk 35 siswa yang mengerjakan
serentak, itu bisa tembus **200+ permintaan/menit** — jauh di atas kuota, dan akibatnya
muncul sebagai "gagal tersimpan" di layar siswa.

Sekarang (konstanta ada di baris atas `<script>` pada `public/index.html`):

- jawaban tetap ditulis ke perangkat **seketika** setiap kali siswa memilih (tidak berubah);
- pengiriman ke server menunggu `SAVE_DEBOUNCE_MS` (12 detik) sejak perubahan terakhir **dan**
  minimal `SAVE_MIN_GAP_MS` (45 detik) sejak pengiriman terakhir;
- 10 detik sebelum waktu habis, jawaban dikirim paksa tanpa menunggu jeda;
- kalau tab ditutup saat masih ada perubahan, jawaban dikirim sekali lewat `sendBeacon`;
- pengumpulan akhir tetap mengirim seluruh jawaban dan itulah yang dinilai.

Hasilnya sekitar **47 permintaan tulis/menit untuk 35 siswa** — masih di bawah kuota, dengan
sisa ruang untuk login, gambar, dan panel guru. Kalau jumlah siswa jauh lebih sedikit
(mis. satu kelompok 8 orang), `SAVE_MIN_GAP_MS` boleh diturunkan ke 20000.

> **Risiko yang perlu diterima:** kalau perangkat siswa mati total (bukan sekadar tab
> tertutup atau koneksi putus), jawaban dari maksimal 45 detik terakhir bisa hilang karena
> baru ada di perangkat. Selama browser yang sama dipakai lagi, jawaban lokal otomatis
> dipulihkan saat ujian dibuka kembali.

### 4. `SHEET_CACHE_MS` (opsional, standar mati)

Menyimpan tab yang jarang berubah (`SISWA`, `UJIAN`, `SOAL`) di memori instance Vercel
selama sekian milidetik. Ini **tidak** mengurangi jumlah permintaan (batchGet sudah
menggabungkannya jadi satu), tapi memperkecil data yang diunduh sehingga respons lebih cepat
— terasa kalau soalnya panjang atau banyak.

Konsekuensinya: perubahan yang guru buat di spreadsheet baru terlihat setelah masa cache
habis. Isi `10000` (10 detik) kalau ingin memakainya, kosongkan/`0` untuk mematikan.
Tab `SESI` dan `LOGIN_LIMIT` tidak pernah ikut di-cache antar-permintaan.

### 5. Coba-lagi otomatis saat kuota penuh

Kalau Google tetap menolak dengan 429 (kuota) atau 5xx (gangguan), permintaan diulang
sampai 3 kali dengan jeda menaik + acak, jadi satu lonjakan sesaat tidak langsung muncul
sebagai kegagalan di layar siswa. Kalau tetap gagal, pesannya menegaskan bahwa jawaban
masih aman di perangkat.

## Hal lain yang perlu diketahui

- **Login bergiliran tetap dianjurkan.** Satu login siswa kini hanya 1 permintaan (dari 6),
  jadi 35 siswa yang login serentak secara teori masih muat. Tetap bagi jadi 5 kelompok
  dengan jeda 10–15 detik sebagai margin aman, terutama karena cold start Vercel.
- **Sesi tidak bisa dicabut dari server** (lihat penjelasan yang sama di paket P02
  sebelumnya) — token berlaku sampai kedaluwarsa (`SESSION_TTL_SECONDS`).
- **Log error** di Vercel Hobby hanya tersimpan 1 jam — cek **Vercel → Deployments → Logs**
  segera kalau ada masalah saat ujian berlangsung.
- Data pribadi siswa yang disimpan tetap hanya ID, nama, kelas, kelompok — sama seperti
  aturan di panduan asli.

## Struktur berkas

```
api/login.js         login siswa & admin (+ throttle 5x/15 menit via sheet LOGIN_LIMIT)
api/dashboard.js      muat ulang dashboard (siswa atau admin, ditentukan dari token)
api/attempt.js         mulai / simpan / kumpulkan ujian
api/image.js           ambil gambar soal dari Drive (base64, hanya saat attempt aktif)
api/admin.js            buka/tutup ujian, reset percobaan siswa
api/_lib/store.js       akses Google Sheets & Drive, konversi tanggal epoch↔WITA
api/_lib/auth.js        hash PIN/admin, token sesi HMAC, throttle login
api/_lib/exam.js        logika ujian: soal, percobaan, penilaian, dashboard
public/index.html       seluruh antarmuka (HTML + CSS + JS, tanpa CDN eksternal)
scripts/hash-secret.mjs   hitung ADMIN_HASH
scripts/setup-sheet.mjs   buat tab & header Spreadsheet (sekali jalan)
scripts/generate-pins.mjs buat PIN siswa baru + sheet PIN_DISTRIBUSI
```


## Katalog kelas (fitur awal Multi-kelas)

Panel guru memiliki halaman **Kelas** untuk mencari dan memfilter kelas, melihat jumlah siswa yang sudah tercatat pada tab `SISWA`, dan menambahkan metadata kelas (tingkat, program keahlian, tahun ajaran, semester, kelompok belajar, wali kelas, dan guru pengampu).

Sebelum memakai tombol **Tambah kelas** pada versi ini, jalankan kembali setup sheet setelah perubahan kode diunduh:

```bash
node --env-file=.env scripts/setup-sheet.mjs
```

Skrip hanya menambah tab/header yang belum ada dan tidak mengubah baris data yang sudah terisi. Data kelas lama yang hanya tercantum pada kolom `Kelas` tab `SISWA` tetap ditampilkan. Katalog ini belum memindahkan siswa, mengelola riwayat perpindahan, atau membatasi ujian/tugas berdasarkan kelas; koneksi tersebut perlu diterapkan pada tahap berikutnya agar aturan akses ujian yang berjalan tidak berubah tanpa migrasi data yang teruji.


## Penempatan dan perpindahan siswa

Halaman **Kelas** menyediakan bagian **Penempatan siswa**. Admin dapat memilih kelas tujuan dan kelompok untuk setiap siswa aktif. Perubahan memperbarui kolom `Kelas`, `Kelompok`, dan `KelasID` pada tab `SISWA`. Setiap perubahan juga dicatat pada tab `RIWAYAT_KELAS` dengan kelas asal, kelas tujuan, jenis perubahan, dan waktu.

Sebelum memakai fitur ini setelah pembaruan kode, jalankan:

```bash
node --env-file=.env scripts/setup-sheet.mjs
```

Skrip menambahkan tab `RIWAYAT_KELAS` dan memperluas header `SISWA` dengan kolom `KelasID`. Data siswa, PIN, status aktif, jawaban, nilai, dan sesi ujian yang sudah ada tidak diubah. Kelas tujuan harus sudah tercatat pada katalog `KELAS`.
