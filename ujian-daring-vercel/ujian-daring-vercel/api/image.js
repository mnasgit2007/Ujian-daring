import { handler, authSiswa, norm } from './_lib/auth.js';
import { getQuestions, attemptForImage, MAX_GAMBAR } from './_lib/exam.js';
import { SHEETS, preload, driveApi, nowMs } from './_lib/store.js';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Gambar soal praktis tidak pernah berubah selama ujian berlangsung, sedangkan
// satu gambar bisa diminta oleh 35 siswa. Salinannya disimpan sebentar di
// memori instance supaya Drive tidak diunduh berulang kali. Batasnya kecil
// (12 × maks 220 KB) agar aman untuk memori fungsi Vercel.
const IMAGE_CACHE_MS = 10 * 60 * 1000;
const IMAGE_CACHE_MAX = 12;
const imageCache = new Map();

function cachedImage(fileId) {
  const hit = imageCache.get(fileId);
  if (!hit) return null;
  if (Date.now() - hit.at > IMAGE_CACHE_MS) { imageCache.delete(fileId); return null; }
  return hit.dataUrl;
}

function cacheImage(fileId, dataUrl) {
  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
  imageCache.set(fileId, { dataUrl, at: Date.now() });
}

export default handler(async (body) => {
  const studentId = authSiswa(body.token);
  const examId = norm(body.examId);
  const questionId = norm(body.questionId);

  // SESI dan SOAL diambil sekaligus: 1 permintaan, bukan 2.
  await preload([SHEETS.SESI, SHEETS.SOAL]);

  const a = await attemptForImage(studentId, examId);
  if (!a || a.status !== 'SEDANG' || nowMs() > a.deadline) throw new Error('Akses gambar ujian sudah berakhir.');

  const questions = await getQuestions(examId);
  const q = questions.find(x => x.id === questionId);
  if (!q || !q.fileId) throw new Error('Gambar tidak ada.');
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(q.fileId)) throw new Error('DriveFileId tidak valid.');

  const cached = cachedImage(q.fileId);
  if (cached) return { dataUrl: cached };

  const drive = driveApi();

  const meta = await drive.files.get({ fileId: q.fileId, fields: 'mimeType,size' }).catch(() => {
    throw new Error('Gambar tidak dapat diakses. Pastikan folder Drive sudah dibagikan ke akun layanan (service account).');
  });
  const mime = meta.data.mimeType;
  if (!ALLOWED_MIME.includes(mime)) throw new Error('Gunakan JPG, PNG, atau WEBP.');
  if (Number(meta.data.size || 0) > MAX_GAMBAR) throw new Error('Gambar terlalu besar (>220 KB). Kompres di Drive dan coba lagi.');

  const res = await drive.files.get({ fileId: q.fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  const buf = Buffer.from(res.data);
  if (buf.length > MAX_GAMBAR) throw new Error('Gambar terlalu besar (>220 KB). Kompres di Drive dan coba lagi.');

  const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
  cacheImage(q.fileId, dataUrl);
  return { dataUrl };
});
