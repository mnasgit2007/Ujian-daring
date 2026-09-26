# Aktivasi kehadiran, materi, tugas, dan profil

Fitur ini berada di PR #26, belum di-merge. Pengujian otomatis memakai database dan Drive tiruan; koneksi Google produksi harus diuji setelah konfigurasi. Ujian lama tetap menggunakan alur yang sama.

## 1. Perbarui branch lokal dan siapkan Google Sheets

Simpan perubahan lokal terlebih dahulu, lalu dari terminal PowerShell folder proyek:

```powershell
git fetch origin
git switch ui/reference-dashboards
git pull --ff-only origin ui/reference-dashboards
npm.cmd install
node --env-file=.env scripts/setup-sheet.mjs
```

Setup menambahkan tab `ABSENSI_PESERTA`, `ABSENSI_DETAIL`, `MATERI`, `TUGAS`, `PENGUMPULAN`, `PROFIL`, dan `GURU`. Header lama tidak diubah. Script menolak header yang tidak sesuai dan tidak menghapus isi sheet. Jangan menjalankan `--demo` pada database produksi.

Sebaiknya gunakan salinan spreadsheet khusus preview, dengan `SPREADSHEET_ID` untuk environment Preview Vercel mengarah ke salinan tersebut. Setelah uji selesai, jalankan setup yang sama pada spreadsheet produksi sebelum deploy produksi.

## 2. Pilih penyimpanan tugas

Foto dan PDF disimpan di Google Drive, metadata pengumpulan di Google Sheets. Tidak ada file biner yang disimpan dalam sheet. Aplikasi tidak membuat tautan publik. Folder khusus ini jangan dibagikan kepada siswa, domain, atau publik; izinkan hanya pengelola yang berwenang.

### Pilihan A — My Drive milik guru (termasuk Gmail pribadi)

1. Pada project Google Cloud yang dipakai aplikasi, aktifkan Google Drive API.
2. Konfigurasikan OAuth consent screen. Gunakan Internal untuk organisasi Workspace yang sesuai; untuk External, tambahkan akun pemilik sebagai test user saat pengujian. Untuk pemakaian tetap, selesaikan pengaturan Publishing status/verification sesuai persyaratan Google. Refresh token aplikasi External berstatus Testing dapat berumur pendek; jangan menganggap konfigurasi testing siap untuk layanan tetap.
3. Buat OAuth Client jenis **Web application**. Authorized redirect URI harus persis `http://localhost:8787/oauth/callback`.
4. Tambahkan `DRIVE_OAUTH_CLIENT_ID` dan `DRIVE_OAUTH_CLIENT_SECRET` ke `.env` lokal. Jangan mengirimkan rahasianya lewat chat/GitHub.
5. Jalankan:

```powershell
node --env-file=.env scripts/setup-assignment-drive.mjs
```

6. Buka tautan yang ditampilkan terminal, pilih akun pemilik penyimpanan, dan izinkan akses. Script meminta scope `drive.file` untuk berkas yang dibuat aplikasi, membuat folder privat **Ujian Daring - Pengumpulan Tugas**, dan menulis konfigurasi ke `.env.drive` (diabaikan Git).
7. Tambahkan empat variabel berikut pada Vercel Settings → Environment Variables untuk Preview terlebih dahulu, lalu Production ketika siap:
   - `DRIVE_OAUTH_CLIENT_ID`
   - `DRIVE_OAUTH_CLIENT_SECRET`
   - `DRIVE_OAUTH_REFRESH_TOKEN` dari `.env.drive`
   - `ASSIGNMENT_DRIVE_FOLDER_ID` dari `.env.drive`
8. Redeploy preview agar variabel terbaca. Untuk lokal, salin nilai dari `.env.drive` ke `.env`, tanpa menghapus konfigurasi Sheets yang sudah ada.

Script sengaja tidak menimpa `.env.drive` yang sudah ada. Simpan file konfigurasi lama secara aman sebelum setup ulang. Jangan mengaktifkan sharing publik pada folder hasil setup.

### Pilihan B — Shared Drive sekolah

Gunakan folder di **Shared Drive**, bukan sekadar folder My Drive yang dibagikan. Beri service account peran yang dapat menambah/membaca/menghapus berkas (Content manager), dan atur `ASSIGNMENT_DRIVE_FOLDER_ID`. Biarkan ketiga variabel OAuth kosong. Kredensial `GOOGLE_CLIENT_EMAIL` dan `GOOGLE_PRIVATE_KEY` yang sudah ada dipakai dengan scope Drive untuk unggahan tugas. Alur gambar soal lama tetap menggunakan klien readonly-nya sendiri.

Service account tidak memiliki kuota penyimpanan untuk memiliki berkas My Drive; pembagian folder My Drive biasa ke service account saja tidak cukup. Rujukan: https://developers.google.com/workspace/drive/api/guides/folder

## 3. Alur guru dan siswa

- **Kehadiran:** buka sesi seperti biasa pada menu Absensi QR. Daftar peserta disalin saat sesi baru dibuat. Pindai QR untuk hadir, atau buka Kehadiran untuk memilih Hadir, Terlambat, Izin, Sakit, atau Alpa dan memberi catatan. Guru dapat mengoreksi status; setiap koreksi menyimpan identitas pencatat dan waktunya.
- **Sesi ditutup:** peserta snapshot yang belum dicatat dihitung Alpa pada rincian. Sebelum menutup sesi, isi izin/sakit. Sesi lama tanpa snapshot memakai Belum dicatat dan tidak diubah menjadi Alpa secara otomatis. Status Belum dicatat dikecualikan dari persentase. Terlambat tetap dihitung hadir dan dirinci terpisah.
- **Siswa:** dashboard menampilkan ringkasan kehadiran dan tugas. Menu Kehadiran memuat riwayat, filter tanggal/status, dan catatan. Riwayat yang tercatat tetap tersedia saat siswa berpindah kelas.
- **Materi:** guru memilih kelas, judul/topik, bacaan, dan tautan HTTPS opsional (Drive/video/dokumen). Draf belum tampil pada siswa, Terbit tampil pada kelas tujuan, Arsip menyembunyikan materi.
- **Tugas:** guru menentukan kelas, instruksi, batas waktu WITA, dan apakah menerima pengumpulan terlambat. Kelas konten tidak dapat diganti setelah dibuat, agar pengumpulan tidak berpindah kepemilikan.
- **Pengumpulan:** siswa memilih 1–5 foto/PDF. Foto JPG/PNG/WEBP diperkecil di perangkat menjadi JPEG maksimal sisi 1600 px. PDF tidak dikompres. Total unggahan maksimal 2 MB setelah kompresi; batas ini menjaga request base64 di bawah batas payload Vercel. HEIC perlu dikonversi. Tinjau pratinjau agar tulisan terbaca.
- Setelah berhasil, siswa menerima nomor bukti, waktu, status tepat waktu/terlambat, nilai, dan umpan balik. Pengiriman ulang membuat versi baru; versi terdahulu tetap tersimpan. Nilai yang ditampilkan pada kartu tugas adalah nilai versi terakhir; versi sebelumnya dapat dilihat pada riwayat.
- **Penilaian:** guru melihat siapa yang sudah/belum mengumpulkan, mengunduh foto/PDF, dan memberi nilai 0–100 serta umpan balik. Setiap versi dapat dinilai secara terpisah.
- **Profil:** siswa dapat mengisi nama tampilan, email, kontak, dan bio. Guru juga dapat mengisi mata pelajaran. Perubahan profil tidak mengubah ID, nama resmi SISWA, kelas, atau kelompok. Data kontak hanya dikembalikan kepada pemilik profil.
- **Akun guru:** admin utama (login Guru/Admin dengan ID guru kosong) dapat membuat akun guru terpisah dari Profil saya. Guru masuk menggunakan ID + kata sandi, dan memiliki profil berbeda. Guru bernama memiliki akses pengelolaan yang sama dengan panel admin, termasuk semua kelas; belum ada pembatasan per guru/mapel. Hanya admin utama dapat membuat akun guru. Nonaktifkan akun dengan `Aktif=TIDAK` pada tab GURU; permintaan berikutnya dengan token lama akan ditolak.

## 4. Verifikasi sebelum merge

1. Pada preview, login admin utama dan klik Tugas → Periksa penyimpanan.
2. Terbitkan satu materi dan satu tugas untuk kelas uji. Pastikan siswa kelas lain tidak melihatnya.
3. Login siswa uji, unggah foto yang jelas, lalu catat nomor bukti pengumpulan. Coba PDF dan beberapa foto dengan total <=2 MB.
4. Login guru, buka pengumpulan, unduh berkas, dan berikan nilai + umpan balik. Periksa hasil dari akun siswa yang sama.
5. Buka sesi absensi baru. Coba QR nyata, isi izin/sakit, lalu tutup. Periksa rincian/persentase siswa dan koreksi satu status.
6. Simpan profil dua siswa dan dua guru; pastikan profilnya tidak tertukar.
7. Coba alur ujian lama: login, mulai, jawab, simpan, kumpulkan, tampilkan hasil.
8. Setelah disetujui, merge PR dan deploy. Jalankan setup pada database produksi sebelum fitur baru dipakai; tambahkan variabel Drive Production bila berbeda.

## Batas teknis

Google Sheets bukan database transaksional. Pengiriman menggunakan request ID untuk retry biasa, tetapi dua permintaan serentak lintas instance masih mungkin menghasilkan duplikasi. Koreksi kehadiran menyimpan jejak append-only; dua koreksi bersamaan memakai catatan terakhir. Jika respons penulisan metadata tidak pasti, berkas Drive dipertahankan agar berkas yang sudah tercatat tidak terhapus; berkas yatim dapat perlu diperiksa manual. Jangan menghapus sheet riwayat atau berkas tugas ketika masih digunakan.

Rujukan upload: https://developers.google.com/workspace/drive/api/guides/manage-uploads

Rujukan OAuth offline: https://developers.google.com/identity/protocols/oauth2/web-server#offline

Batas Vercel: https://vercel.com/docs/functions/limitations
