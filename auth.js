import crypto from 'node:crypto';
import { SHEETS, readRows, appendRows, writeCells, nowMs, withRequestCache } from './store.js';

export function norm(v) {
  return String(v == null ? '' : v).trim();
}

export function isYa(v) {
  return norm(v).toUpperCase() === 'YA';
}

// Setara hash_() di Code.gs: sha256(secret + '|' + text). HASH_SECRET dibuat
// bebas — proyek ini belum pernah dipasang di akun Google (lihat PANDUAN_INSTALASI.md),
// jadi tidak ada PIN lama yang perlu tetap kompatibel.
export function hash(text) {
  const secret = process.env.HASH_SECRET;
  if (!secret) throw new Error('HASH_SECRET belum diatur di Environment Variables Vercel.');
  return crypto.createHash('sha256').update(secret + '|' + text, 'utf8').digest('hex');
}

export function hashSiswa(id, pin) {
  return hash('SISWA:' + id + ':' + pin);
}

export function hashAdmin(password) {
  return hash('ADMIN:' + password);
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET belum diatur di Environment Variables Vercel.');
  return s;
}

export const SESSION_SECONDS = Math.max(900, Math.min(Number(process.env.SESSION_TTL_SECONDS || 21600), 21600));

// --- primitif tanda tangan bersama (dipakai token sesi dan tiket sesi ujian) ---

function sig(p) {
  return crypto.createHmac('sha256', secret()).update(p).digest('base64url');
}

function sign(obj) {
  const p = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  return p + '.' + sig(p);
}

function open(value) {
  const parts = norm(value).split('.');
  if (parts.length !== 2) return null;
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(sig(parts[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

export function signToken(payload) {
  return sign({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
}

export function verifyToken(token, role) {
  const payload = open(token);
  if (!payload) throw new Error('Sesi tidak valid. Silakan login kembali.');
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Sesi berakhir. Login kembali (jawaban lokal mungkin masih tersimpan).');
  }
  if (payload.k) throw new Error('Sesi tidak valid. Silakan login kembali.');
  if (role && payload.role !== role) throw new Error('Akses ditolak untuk peran ini.');
  return payload;
}

export function authSiswa(token) {
  return verifyToken(token, 'S').id;
}

export function authAdmin(token) {
  verifyToken(token, 'A');
}

// ---------------------------------------------------------------------------
// Tiket sesi ujian.
//
// Saat siswa menekan "Mulai Ujian", server sudah tahu di baris SESI mana
// jawabannya disimpan dan kapan batas waktunya. Informasi itu ditandatangani
// (HMAC, kunci yang sama dengan token sesi) lalu dititipkan ke perangkat siswa.
// Pada autosave berikutnya server cukup memverifikasi tandatangannya dan
// langsung menulis ke baris tersebut — TANPA membaca sheet SESI lebih dulu.
// Ini memangkas biaya setiap autosave dari 2 permintaan (baca + tulis) menjadi
// 1 (tulis saja), yang merupakan jalur tersibuk selama ujian berlangsung.
//
// Tiket tidak bisa dipalsukan atau dipakai siswa lain karena ID siswa dan ID
// ujian ikut ditandatangani dan dicocokkan ulang dengan token sesi.
// ---------------------------------------------------------------------------

export function signAttemptTicket(studentId, examId, row, deadline, attemptId) {
  if (!Number.isSafeInteger(row) || row < 2) return '';
  return sign({ k: 'T', s: String(studentId), e: String(examId), r: row, d: Number(deadline), a: String(attemptId || '') });
}

export function readAttemptTicket(ticket, studentId, examId) {
  const t = open(ticket);
  if (!t || t.k !== 'T') return null;
  if (t.s !== String(studentId) || t.e !== String(examId)) return null;
  if (!Number.isSafeInteger(t.r) || t.r < 2) return null;
  if (!Number.isFinite(t.d)) return null;
  return { row: t.r, deadline: Number(t.d), attemptId: String(t.a || '') };
}

// ---------------------------------------------------------------------------
// Pembatasan percobaan login (setara throttle_() Code.gs, yang aslinya memakai
// CacheService). Karena fungsi Vercel bersifat stateless lintas instance,
// hitungannya disimpan di sheet LOGIN_LIMIT — hanya ditulis saat login GAGAL,
// jadi tidak membebani kuota Google Sheets API pada login yang berhasil.
//
// Barisnya dibaca sekali oleh checkThrottle() lalu dioper ke recordFailure()/
// clearThrottle(), sehingga satu login tidak pernah membaca sheet ini dua kali.
// ---------------------------------------------------------------------------

const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

async function throttleRow(key) {
  const rows = await readRows(SHEETS.LOGIN_LIMIT);
  for (let i = 1; i < rows.length; i++) {
    if (norm(rows[i][0]) === key) return { row: i + 1, count: Number(rows[i][1] || 0), lastFail: Number(rows[i][2] || 0) };
  }
  return { row: 0, count: 0, lastFail: 0 };
}

// Dipanggil sebelum memeriksa kredensial. Melempar error kalau kunci ini
// (mis. "S:XI-DKV-001" atau "ADMIN") sudah gagal 5 kali dalam 15 menit terakhir.
export async function checkThrottle(key) {
  const t = await throttleRow(key);
  if (t.count >= THROTTLE_MAX && nowMs() - t.lastFail < THROTTLE_WINDOW_MS) {
    throw new Error('Terlalu banyak percobaan. Coba lagi sekitar 15 menit.');
  }
  return t;
}

export async function recordFailure(key, known) {
  const t = known || await throttleRow(key);
  if (t.row) {
    await writeCells(SHEETS.LOGIN_LIMIT, `B${t.row}:C${t.row}`, [[t.count + 1, nowMs()]]);
  } else {
    await appendRows(SHEETS.LOGIN_LIMIT, [[key, 1, nowMs()]]);
  }
}

export async function clearThrottle(key, known) {
  const t = known || await throttleRow(key);
  if (t.row && t.count > 0) {
    await writeCells(SHEETS.LOGIN_LIMIT, `B${t.row}:C${t.row}`, [[0, 0]]);
  }
}

export function handler(fn) {
  return async function (req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Metode tidak didukung. Gunakan POST.' });
      return;
    }
    try {
      let body = req.body || {};
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      // Semua pembacaan sheet dalam satu permintaan berbagi satu cache.
      const out = await withRequestCache(() => fn(body, req));
      res.status(200).json(out === undefined ? { ok: true } : out);
    } catch (e) {
      console.error(e);
      res.status(e.status || 400).json({ error: e.message || 'Terjadi kesalahan.' });
    }
  };
}
