import crypto from 'node:crypto';
import { SHEETS, readRows, appendRows, writeCells, clearCells, preload, cellToEpoch, fmtEpoch, nowMs } from './store.js';
import { norm, isYa, signAttemptTicket, readAttemptTicket } from './auth.js';

export const MAX_SOAL = 80;
export const MAX_JAWAB_BYTES = 30000;
export const MAX_GAMBAR = 220000;
export const RANDOMIZE_QUESTIONS = isYa(process.env.SHUFFLE_QUESTIONS);

// Pengacakan ditentukan dari AttemptID, bukan Math.random(), sehingga urutan
// tetap sama saat siswa memuat ulang atau melanjutkan sesi yang sama.
export function shuffleQuestions(questions, attemptId) {
  const out = [...questions];
  let counter = 0;
  for (let i = out.length - 1; i > 0; i--) {
    const seed = crypto.createHash('sha256').update(`${attemptId}:${counter++}`).digest();
    const random = seed.readUInt32BE(0) / 0x100000000;
    const j = Math.floor(random * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function getStudents() {
  const rows = await readRows(SHEETS.SISWA);
  return rows.slice(1).filter(r => norm(r[0])).map(r => ({
    id: norm(r[0]), name: String(r[1] || ''), kelas: String(r[2] || ''), kelompok: String(r[3] || ''),
    hash: String(r[4] || ''), active: isYa(r[5])
  }));
}

export async function getExams() {
  const rows = await readRows(SHEETS.UJIAN);
  return rows.slice(1).filter(r => norm(r[0])).map(r => {
    const e = {
      id: norm(r[0]), title: String(r[1] || ''), duration: Number(r[2]),
      start: cellToEpoch(r[3]), end: cellToEpoch(r[4]),
      status: norm(r[5]).toUpperCase(), showScore: isYa(r[6]), sessionPin: norm(r[7])
    };
    if (!e.title || !(e.duration >= 1 && e.duration <= 180) || e.end <= e.start) {
      throw new Error('Periksa konfigurasi ujian ' + e.id);
    }
    return e;
  });
}

export async function examById(id) {
  const exams = await getExams();
  return exams.find(e => e.id === String(id));
}

export async function getQuestions(examId) {
  const rows = await readRows(SHEETS.SOAL);
  const seen = {};
  return rows.slice(1).filter(r => String(r[0]) === String(examId)).map(r => {
    const q = {
      id: String(r[1] || '').trim(), text: String(r[2] || ''), a: String(r[3] || ''), b: String(r[4] || ''),
      c: String(r[5] || ''), d: String(r[6] || ''), key: String(r[7] || '').trim().toUpperCase(),
      weight: Number(r[8]), fileId: String(r[9] || '').trim()
    };
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(q.id) || seen[q.id] || !q.text || !q.a || !q.b || !q.c || !q.d ||
        !['A', 'B', 'C', 'D'].includes(q.key) || !(q.weight > 0)) {
      throw new Error('Ada SoalID duplikat/soal tidak lengkap untuk ' + examId + ' (' + q.id + ').');
    }
    seen[q.id] = true;
    return q;
  });
}

function questionText(value, field, max = 2000) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} wajib diisi.`);
  if (text.length > max) throw new Error(`${field} terlalu panjang.`);
  return text;
}

export function normalizeQuestionInput(input = {}) {
  const id = norm(input.questionId);
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(id)) throw new Error('ID soal hanya boleh berisi huruf, angka, garis bawah, atau tanda hubung (maksimal 30 karakter).');
  const key = norm(input.key).toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(key)) throw new Error('Kunci jawaban harus A, B, C, atau D.');
  const weight = Number(input.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) throw new Error('Bobot harus lebih besar dari 0 dan maksimal 1000.');
  const fileId = norm(input.fileId);
  if (fileId.length > 200) throw new Error('ID gambar terlalu panjang.');
  return {
    examId: norm(input.examId), id,
    text: questionText(input.text, 'Pertanyaan'),
    a: questionText(input.a, 'Pilihan A', 1000), b: questionText(input.b, 'Pilihan B', 1000),
    c: questionText(input.c, 'Pilihan C', 1000), d: questionText(input.d, 'Pilihan D', 1000),
    key, weight, fileId
  };
}

export async function adminListQuestions(examId) {
  const exam = await examById(examId);
  if (!exam) throw new Error('Ujian tidak ditemukan.');
  const questions = await getQuestions(exam.id);
  return { examId: exam.id, questions: questions.map(q => ({ id: q.id, text: q.text, a: q.a, b: q.b, c: q.c, d: q.d, key: q.key, weight: q.weight, fileId: q.fileId })) };
}

function questionRow(q) {
  return [q.examId, q.id, q.text, q.a, q.b, q.c, q.d, q.key, q.weight, q.fileId];
}

function assertQuestionEditingAllowed(exam) {
  if (exam.status === 'BUKA') throw new Error('Bank soal tidak dapat diubah saat ujian sedang BUKA. Tutup ujian terlebih dahulu.');
}

export async function adminCreateQuestion(input) {
  const q = normalizeQuestionInput(input);
  const exam = await examById(q.examId);
  if (!exam) throw new Error('Ujian tidak ditemukan.');
  assertQuestionEditingAllowed(exam);
  const rows = await readRows(SHEETS.SOAL, { fresh: true });
  const existing = rows.slice(1).filter(r => String(r[0]) === q.examId);
  if (existing.length >= MAX_SOAL) throw new Error(`Jumlah soal melebihi batas ${MAX_SOAL}.`);
  if (existing.some(r => String(r[1]).trim() === q.id)) throw new Error(`SoalID sudah ada untuk ${q.examId}: ${q.id}.`);
  await appendRows(SHEETS.SOAL, [questionRow(q)]);
  return adminListQuestions(q.examId);
}

export async function adminUpdateQuestion(input) {
  const q = normalizeQuestionInput(input);
  const originalId = norm(input.originalQuestionId || q.id);
  const exam = await examById(q.examId);
  if (!exam) throw new Error('Ujian tidak ditemukan.');
  assertQuestionEditingAllowed(exam);
  const rows = await readRows(SHEETS.SOAL, { fresh: true });
  const index = rows.findIndex((r, n) => n > 0 && String(r[0]) === q.examId && String(r[1]).trim() === originalId);
  if (index < 0) throw new Error('Soal yang akan diubah tidak ditemukan.');
  if (q.id !== originalId && rows.some((r, n) => n > 0 && String(r[0]) === q.examId && String(r[1]).trim() === q.id)) throw new Error(`SoalID sudah ada untuk ${q.examId}: ${q.id}.`);
  await writeCells(SHEETS.SOAL, `A${index + 1}:J${index + 1}`, [questionRow(q)]);
  return adminListQuestions(q.examId);
}

export async function adminDeleteQuestion(examId, questionId) {
  const id = norm(questionId);
  const exam = await examById(examId);
  if (!exam) throw new Error('Ujian tidak ditemukan.');
  assertQuestionEditingAllowed(exam);
  const rows = await readRows(SHEETS.SOAL, { fresh: true });
  const index = rows.findIndex((r, n) => n > 0 && String(r[0]) === exam.id && String(r[1]).trim() === id);
  if (index < 0) throw new Error('Soal yang akan dihapus tidak ditemukan.');
  await clearCells(SHEETS.SOAL, `A${index + 1}:J${index + 1}`);
  return adminListQuestions(exam.id);
}

function attemptFromRow(r, row) {
  let answers = {};
  try { answers = JSON.parse(String(r[6] || '{}')); } catch (e) { answers = {}; }
  return {
    row, attemptId: String(r[0]), examId: String(r[1]), studentId: String(r[2]),
    start: Number(r[3]), deadline: Number(r[4]), status: String(r[5]),
    answers, revision: Number(r[7]) || 0,
    saved: r[8] ? Number(r[8]) : null,
    submitted: r[9] ? Number(r[9]) : null,
    score: r[10] === '' || r[10] === undefined ? null : Number(r[10]),
    maxScore: r[11] === '' || r[11] === undefined ? null : Number(r[11])
  };
}

export async function getAttempts() {
  const rows = await readRows(SHEETS.SESI);
  return rows.slice(1).filter(r => norm(r[0])).map(r => attemptFromRow(r, 0));
}

// Mengambil baris SESI paling akhir (bukan RESET) untuk pasangan ujian+siswa ini.
// Dibaca dari salinan sheet milik permintaan ini (lihat cache di store.js) — lihat
// catatan "concurrency" di README tentang mengapa ini bukan pengganti LockService
// yang 100% setara.
async function lookupAttempt(examId, studentId) {
  const rows = await readRows(SHEETS.SESI);
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === String(examId) && String(rows[i][2]) === String(studentId) && String(rows[i][5]) !== 'RESET') {
      return attemptFromRow(rows[i], i + 1);
    }
  }
  return null;
}

export function validateAnswers(answers, revision) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Jawaban tidak valid.');
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 1000000) throw new Error('Revisi tidak valid.');
  const keys = Object.keys(answers);
  if (keys.length > MAX_SOAL) throw new Error('Jumlah jawaban melebihi batas.');
  const clean = {};
  keys.forEach(k => {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(k) || !['A', 'B', 'C', 'D'].includes(answers[k])) throw new Error('Format jawaban tidak valid.');
    clean[k] = answers[k];
  });
  if (JSON.stringify(clean).length > MAX_JAWAB_BYTES) throw new Error('Ukuran jawaban terlalu besar.');
  return { answers: clean, revision };
}

function scoreOf(answers, questions) {
  let score = 0, max = 0;
  questions.forEach(q => { max += q.weight; if (answers[q.id] === q.key) score += q.weight; });
  return { score, max };
}

async function finishAttempt(attempt, questions, expired) {
  const { score, max } = scoreOf(attempt.answers, questions);
  const now = nowMs();
  await writeCells(SHEETS.SESI, `F${attempt.row}:L${attempt.row}`, [[
    expired ? 'WAKTU_HABIS' : 'SELESAI', JSON.stringify(attempt.answers), attempt.revision, now, now, score, max
  ]]);
  attempt.status = expired ? 'WAKTU_HABIS' : 'SELESAI';
  attempt.score = score;
  attempt.maxScore = max;
  return attempt;
}

export async function dashboardSiswa(id) {
  await preload([SHEETS.SISWA, SHEETS.UJIAN, SHEETS.SESI]);
  const students = await getStudents();
  const s = students.find(x => x.id === id && x.active);
  if (!s) throw new Error('Akun tidak aktif.');
  const exams = await getExams();
  const attempts = (await getAttempts()).filter(a => a.studentId === id && a.status !== 'RESET');
  const byExam = {};
  attempts.forEach(a => { byExam[a.examId] = a; });
  const now = nowMs();
  const list = exams.filter(e => e.status === 'BUKA' || byExam[e.id]).map(e => {
    const a = byExam[e.id];
    let state = now < e.start ? 'BELUM_DIMULAI' : now > e.end ? 'BERAKHIR' : 'TERSEDIA';
    if (e.status !== 'BUKA' && !a) state = 'DITUTUP';
    if (a) state = a.status === 'SEDANG' ? (now > a.deadline ? 'WAKTU_HABIS' : 'LANJUTKAN') : a.status;
    return {
      id: e.id, title: e.title, duration: e.duration, start: fmtEpoch(e.start), end: fmtEpoch(e.end), state,
      sessionPinRequired: Boolean(e.sessionPin),
      score: a && a.status !== 'SEDANG' && e.showScore ? a.score : null,
      maxScore: a && a.status !== 'SEDANG' && e.showScore ? a.maxScore : null
    };
  });
  return { student: { id: s.id, name: s.name, kelas: s.kelas, kelompok: s.kelompok }, exams: list };
}

export async function adminDashboard() {
  await preload([SHEETS.UJIAN, SHEETS.SISWA, SHEETS.SESI]);
  const [exams, students, attempts] = await Promise.all([getExams(), getStudents(), getAttempts()]);
  return {
    exams: exams.map(e => ({ id: e.id, title: e.title, status: e.status, duration: e.duration, start: fmtEpoch(e.start), end: fmtEpoch(e.end), showScore: e.showScore, sessionPin: e.sessionPin })),
    students: students.map(s => ({ id: s.id, name: s.name, kelas: s.kelas, kelompok: s.kelompok, active: s.active })),
    attempts: attempts.map(a => ({
      examId: a.examId, studentId: a.studentId, attemptId: a.attemptId, status: a.status,
      start: fmtEpoch(a.start), lastSaved: fmtEpoch(a.saved), submitted: fmtEpoch(a.submitted),
      revision: a.revision, score: a.score, maxScore: a.maxScore
    })),
    refreshed: fmtEpoch(nowMs())
  };
}

export async function adminSetStatus(examId, status) {
  if (!['BUKA', 'TUTUP'].includes(status)) throw new Error('Status tidak valid.');
  const rows = await readRows(SHEETS.UJIAN);
  const i = rows.findIndex((r, n) => n > 0 && String(r[0]) === String(examId));
  if (i < 0) throw new Error('Ujian tidak ditemukan.');
  const sessionPin = status === 'BUKA' ? createSessionPin() : '';
  await writeCells(SHEETS.UJIAN, `F${i + 1}:H${i + 1}`, [[status, rows[i][6] || '', sessionPin]]);
  return adminDashboard();
}

export async function adminRotateSessionPin(examId) {
  const rows = await readRows(SHEETS.UJIAN, { fresh: true });
  const i = rows.findIndex((r, n) => n > 0 && String(r[0]) === String(examId));
  if (i < 0) throw new Error('Ujian tidak ditemukan.');
  if (norm(rows[i][5]).toUpperCase() !== 'BUKA') throw new Error('PIN hanya dapat diacak untuk ujian yang sedang BUKA.');
  await writeCells(SHEETS.UJIAN, `H${i + 1}`, [[createSessionPin()]]);
  return adminDashboard();
}

export async function adminResetAttempt(examId, studentId) {
  const rows = await readRows(SHEETS.SESI);
  let rowNum = -1;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === String(examId) && String(rows[i][2]) === String(studentId) && String(rows[i][5]) !== 'RESET') { rowNum = i + 1; break; }
  }
  if (rowNum < 0) throw new Error('Percobaan tidak ditemukan.');
  await writeCells(SHEETS.SESI, `F${rowNum}`, [['RESET']]);
  return adminDashboard();
}

export async function startUjian(studentId, examId, sessionPin = '') {
  // Satu batchGet untuk ketiga sheet yang dibutuhkan alur ini.
  await preload([SHEETS.UJIAN, SHEETS.SOAL, SHEETS.SESI]);

  const exam = await examById(examId);
  if (!exam) throw new Error('Ujian tidak ditemukan.');
  if (exam.sessionPin && norm(sessionPin) !== exam.sessionPin) throw new Error('PIN sesi ujian salah atau belum diisi.');
  const questions = await getQuestions(examId);
  if (!questions.length || questions.length > MAX_SOAL) throw new Error('Bank soal kosong atau melebihi batas 80 soal.');

  let current = await lookupAttempt(examId, studentId);
  const now = nowMs();

  if (current) {
    if (current.status === 'SEDANG' && now > current.deadline) {
      current = await finishAttempt(current, questions, true);
    }
  } else {
    if (exam.status !== 'BUKA' || now < exam.start || now > exam.end) throw new Error('Ujian belum dibuka atau sudah berakhir.');
    const start = now, deadline = Math.min(now + exam.duration * 60000, exam.end);
    const attemptId = cryptoRandomId();
    // appendRows mengembalikan nomor baris hasil tulis, jadi sheet SESI tidak
    // perlu dibaca ulang hanya untuk mencari baris yang baru saja dibuat.
    const row = await appendRows(SHEETS.SESI, [[attemptId, String(examId), studentId, start, deadline, 'SEDANG', '{}', 0, start, '', '', '']]);
    current = row >= 2
      ? {
          row, attemptId, examId: String(examId), studentId, start, deadline, status: 'SEDANG',
          answers: {}, revision: 0, saved: start, submitted: null, score: null, maxScore: null
        }
      : await lookupAttempt(examId, studentId);
  }

  if (current.status !== 'SEDANG') {
    return { done: true, score: exam.showScore ? current.score : null, maxScore: exam.showScore ? current.maxScore : null, status: current.status };
  }
  const orderedQuestions = RANDOMIZE_QUESTIONS
    ? shuffleQuestions(questions, current.attemptId)
    : questions;
  return {
    done: false,
    exam: { id: exam.id, title: exam.title, deadline: fmtEpoch(current.deadline), serverNow: fmtEpoch(now), showScore: exam.showScore },
    attemptId: current.attemptId,
    ticket: signAttemptTicket(studentId, examId, current.row, current.deadline, current.attemptId),
    answers: current.answers, revision: current.revision,
    randomized: RANDOMIZE_QUESTIONS,
    questions: orderedQuestions.map(q => ({
      id: q.id, text: q.text,
      options: [{ key: 'A', text: q.a }, { key: 'B', text: q.b }, { key: 'C', text: q.c }, { key: 'D', text: q.d }],
      hasImage: !!q.fileId
    }))
  };
}

export async function saveJawaban(studentId, examId, answers, revision, ticket) {
  const validated = validateAnswers(answers, revision);

  // Jalur cepat: tiket menyebutkan baris dan batas waktu, jadi autosave cukup
  // SATU permintaan tulis — tidak ada pembacaan sheet sama sekali.
  const t = ticket ? readAttemptTicket(ticket, studentId, examId) : null;
  if (t && nowMs() <= t.deadline) {
    const now = nowMs();
    await writeCells(SHEETS.SESI, `G${t.row}:I${t.row}`, [[JSON.stringify(validated.answers), validated.revision, now]]);
    return { done: false, revision: validated.revision, savedAt: fmtEpoch(now) };
  }

  // Jalur lengkap: tanpa tiket, atau tiket sudah lewat batas waktu (perlu
  // penilaian otomatis). Di sini sheet memang harus dibaca lebih dulu. Kalau
  // tiketnya sudah kedaluwarsa, SOAL pasti dibutuhkan untuk menilai — jadi
  // sekalian diambil dalam batchGet yang sama.
  await preload(t ? [SHEETS.SESI, SHEETS.SOAL] : [SHEETS.SESI]);
  const a = await lookupAttempt(examId, studentId);
  if (!a) throw new Error('Sesi ujian belum dimulai.');
  if (a.status !== 'SEDANG') return { done: true, status: a.status };
  if (nowMs() > a.deadline) {
    await preload([SHEETS.SOAL]);
    await finishAttempt(a, await getQuestions(examId), true);
    return { done: true, status: 'WAKTU_HABIS' };
  }
  if (validated.revision > a.revision) {
    a.answers = validated.answers; a.revision = validated.revision;
    await writeCells(SHEETS.SESI, `G${a.row}:I${a.row}`, [[JSON.stringify(a.answers), a.revision, nowMs()]]);
  }
  return { done: false, revision: Math.max(a.revision, validated.revision), savedAt: fmtEpoch(nowMs()) };
}

export async function submitUjian(studentId, examId, answers, revision) {
  const validated = validateAnswers(answers, revision);
  // Pengumpulan tetap memverifikasi status asli di sheet (sekali per siswa),
  // supaya percobaan yang sudah di-RESET atau sudah selesai tidak tertimpa.
  await preload([SHEETS.SESI, SHEETS.SOAL, SHEETS.UJIAN]);
  const questions = await getQuestions(examId);
  const exam = await examById(examId);
  const a = await lookupAttempt(examId, studentId);
  if (!a) throw new Error('Sesi ujian belum dimulai.');
  if (a.status === 'SEDANG') {
    const expired = nowMs() > a.deadline;
    if (!expired && validated.revision >= a.revision) {
      a.answers = validated.answers; a.revision = validated.revision;
    }
    await finishAttempt(a, questions, expired);
  }
  return { done: true, status: a.status, score: exam.showScore ? a.score : null, maxScore: exam.showScore ? a.maxScore : null };
}

export async function attemptForImage(studentId, examId) {
  return lookupAttempt(examId, studentId);
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

export function createSessionPin() {
  return String(crypto.randomInt(100000, 1000000));
}
