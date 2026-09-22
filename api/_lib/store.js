import { google } from 'googleapis';
import { AsyncLocalStorage } from 'node:async_hooks';

export const SHEETS = Object.freeze({
  SISWA: 'SISWA',
  UJIAN: 'UJIAN',
  SOAL: 'SOAL',
  SESI: 'SESI',
  LOGIN_LIMIT: 'LOGIN_LIMIT'
});

export const HEADERS = Object.freeze({
  SISWA: ['ID', 'Nama', 'Kelas', 'Kelompok', 'PinHash', 'Aktif'],
  UJIAN: ['UjianID', 'Judul', 'DurasiMenit', 'Mulai', 'Selesai', 'Status', 'TampilkanNilai'],
  SOAL: ['UjianID', 'SoalID', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Kunci', 'Bobot', 'DriveFileId'],
  SESI: ['AttemptID', 'UjianID', 'SiswaID', 'MulaiMs', 'DeadlineMs', 'Status', 'JawabanJSON', 'Revisi', 'TerakhirSimpanMs', 'DiserahkanMs', 'Nilai', 'NilaiMaks'],
  LOGIN_LIMIT: ['Key', 'Count', 'LastFailMs']
});

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Rentang dibatasi sampai kolom terakhir yang dipakai, bukan seluruh sheet.
// Kuotanya sama, tapi payload yang diunduh jauh lebih kecil.
const RANGE = Object.freeze(Object.fromEntries(
  Object.keys(HEADERS).map(name => [name, `'${name}'!A:${colLetter(HEADERS[name].length)}`])
));
// Kolom H pada UJIAN menyimpan PIN sesi secara opsional. Header lama A:G tetap
// kompatibel sehingga spreadsheet yang sudah ada tidak perlu diubah formatnya.
const READ_RANGE = Object.freeze({ ...RANGE, [SHEETS.UJIAN]: `'${SHEETS.UJIAN}'!A:H` });

let sheetsClient = null;
let driveClient = null;

function jwt(scopes) {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!email || !key) {
    throw new Error('Kredensial Google belum diatur. Isi GOOGLE_CLIENT_EMAIL dan GOOGLE_PRIVATE_KEY di Environment Variables Vercel.');
  }
  key = key.replace(/\\n/g, '\n');
  return new google.auth.JWT({ email, key, scopes });
}

export function sheetsApi() {
  if (sheetsClient) return sheetsClient;
  sheetsClient = google.sheets({ version: 'v4', auth: jwt(['https://www.googleapis.com/auth/spreadsheets']) });
  return sheetsClient;
}

export function driveApi() {
  if (driveClient) return driveClient;
  driveClient = google.drive({ version: 'v3', auth: jwt(['https://www.googleapis.com/auth/drive.readonly']) });
  return driveClient;
}

export function spreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID belum diatur di Environment Variables Vercel.');
  return id;
}

// ---------------------------------------------------------------------------
// Coba-lagi otomatis saat Google menolak karena kuota (429) atau sedang gangguan
// (5xx). Tanpa ini, satu lonjakan sesaat langsung tampil sebagai "gagal simpan"
// di layar siswa. Jeda memakai jitter supaya 35 perangkat tidak mencoba ulang
// pada milidetik yang sama.
// ---------------------------------------------------------------------------

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_TRIES = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function statusOf(e) {
  const raw = e && (e.code !== undefined ? e.code : (e.status !== undefined ? e.status : (e.response && e.response.status)));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function friendly(e, status) {
  if (status === 429) {
    return new Error('Server sedang sibuk (batas kuota Google Sheets). Jawaban Anda masih tersimpan di perangkat — tunggu beberapa detik, sistem akan mencoba lagi sendiri.');
  }
  if (status === 403) {
    return new Error('Akses Google ditolak. Pastikan Spreadsheet sudah dibagikan sebagai Editor ke akun layanan (service account).');
  }
  if (status === 404) {
    return new Error('Spreadsheet atau tab tidak ditemukan. Periksa SPREADSHEET_ID dan nama tab.');
  }
  return e;
}

async function apiCall(fn) {
  let wait = 600;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = statusOf(e);
      if (attempt >= MAX_TRIES || !RETRYABLE.has(status)) throw friendly(e, status);
      await sleep(wait + Math.floor(Math.random() * 300));
      wait *= 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Cache dua lapis.
//
// 1. Cache per-permintaan (AsyncLocalStorage): selama satu panggilan API,
//    sheet yang sama tidak pernah diunduh dua kali. Inilah yang membuat
//    preload() + batchGet efektif — dashboardSiswa(), getStudents(), dan
//    getExams() semuanya membaca dari salinan yang sama.
// 2. Cache antar-permintaan (opsional, SHEET_CACHE_MS): menyimpan sheet yang
//    jarang berubah di memori instance Vercel. Standarnya MATI supaya perilaku
//    persis sama seperti sebelumnya; hidupkan saat hari-H kalau perlu.
// ---------------------------------------------------------------------------

const requestScope = new AsyncLocalStorage();

export function withRequestCache(fn) {
  return requestScope.run(new Map(), fn);
}

const WARM_MS = Math.max(0, Math.min(Number(process.env.SHEET_CACHE_MS || 0), 120000));
const WARM_SHEETS = new Set([SHEETS.SISWA, SHEETS.UJIAN, SHEETS.SOAL]);
const warm = new Map();

function cacheGet(sheet) {
  const scope = requestScope.getStore();
  if (scope && scope.has(sheet)) return scope.get(sheet);
  if (WARM_MS > 0 && WARM_SHEETS.has(sheet)) {
    const hit = warm.get(sheet);
    if (hit && Date.now() - hit.at < WARM_MS) {
      if (scope) scope.set(sheet, hit.rows);
      return hit.rows;
    }
  }
  return null;
}

function cachePut(sheet, rows) {
  const scope = requestScope.getStore();
  if (scope) scope.set(sheet, rows);
  if (WARM_MS > 0 && WARM_SHEETS.has(sheet)) warm.set(sheet, { rows, at: Date.now() });
}

export function invalidate(sheet) {
  const scope = requestScope.getStore();
  if (scope) scope.delete(sheet);
  warm.delete(sheet);
}

// Ambil beberapa sheet sekaligus lewat values.batchGet. Google menghitungnya
// sebagai SATU permintaan, berapa pun jumlah rentangnya. Sheet yang sudah ada
// di cache dilewati; kalau semuanya sudah ada, tidak ada permintaan sama sekali.
export async function preload(sheetNames) {
  const need = [...new Set(sheetNames)].filter(s => !cacheGet(s));
  if (!need.length) return;
  const res = await apiCall(() => sheetsApi().spreadsheets.values.batchGet({
    spreadsheetId: spreadsheetId(),
    ranges: need.map(s => READ_RANGE[s]),
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE'
  }));
  const ranges = res.data.valueRanges || [];
  need.forEach((sheet, i) => cachePut(sheet, (ranges[i] && ranges[i].values) || []));
}

// opts.fresh = true melewati cache. Dipakai di jalur yang wajib membaca versi
// terbaru tepat sebelum menulis (lihat catatan concurrency di README).
export async function readRows(sheet, opts) {
  if (!opts || !opts.fresh) {
    const hit = cacheGet(sheet);
    if (hit) return hit;
  }
  const res = await apiCall(() => sheetsApi().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: READ_RANGE[sheet] || `'${sheet}'`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  }));
  const rows = res.data.values || [];
  cachePut(sheet, rows);
  return rows;
}

// Mengembalikan nomor baris hasil append (dibaca dari updatedRange), sehingga
// pemanggil tidak perlu membaca ulang sheet hanya untuk tahu barisnya.
export async function appendRows(sheet, rows) {
  if (!rows || !rows.length) return 0;
  const res = await apiCall(() => sheetsApi().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `'${sheet}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  }));
  invalidate(sheet);
  const updated = res.data && res.data.updates && res.data.updates.updatedRange;
  const m = updated ? String(updated).match(/![A-Z]+(\d+)/) : null;
  return m ? Number(m[1]) : 0;
}

export async function writeCells(sheet, a1, values) {
  await apiCall(() => sheetsApi().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `'${sheet}'!${a1}`,
    valueInputOption: 'RAW',
    requestBody: { values }
  }));
  invalidate(sheet);
}

export async function clearCells(sheet, a1) {
  await apiCall(() => sheetsApi().spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `'${sheet}'!${a1}`
  }));
  invalidate(sheet);
}

// ---------------------------------------------------------------------------
// Tanggal disimpan sebagai epoch milidetik (angka biasa) di sheet SESI, bukan
// tipe Tanggal bawaan Spreadsheet. Ini menghindari ambiguitas zona waktu saat
// dibaca lewat Sheets API dari server yang bisa saja berjalan di zona waktu
// mana pun. Kolom Mulai/Selesai di sheet UJIAN tetap memakai tanggal biasa
// yang diketik guru, dan ditafsirkan sebagai waktu Asia/Makassar (WITA, UTC+8).
// ---------------------------------------------------------------------------

const TZ_OFFSET_HOURS = 8; // Asia/Makassar (WITA), tidak ada DST

function naiveToEpoch(y, mo, d, h, mi, s) {
  return Date.UTC(y, mo - 1, d, h, mi, s || 0) - TZ_OFFSET_HOURS * 3600000;
}

// Terima sel tanggal Spreadsheet asli (angka serial) atau string 'yyyy-mm-dd hh:mm:ss'.
export function cellToEpoch(v) {
  if (typeof v === 'number') {
    // Serial Google Sheets: hari sejak 30 Des 1899. 25569 = jumlah hari sampai 1 Jan 1970.
    const msNaive = Math.round((v - 25569) * 86400000);
    const dt = new Date(msNaive);
    return naiveToEpoch(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds());
  }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/);
  if (!m) throw new Error('Format tanggal harus sel tanggal asli, atau yyyy-mm-dd hh:mm:ss.');
  const epoch = naiveToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  if (Number.isNaN(epoch)) throw new Error('Tanggal tidak valid.');
  return epoch;
}

export function fmtEpoch(ms) {
  if (ms === null || ms === undefined || ms === '') return '';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Makassar',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date(n)).replace('T', ' ');
}

export function nowMs() {
  return Date.now();
}
