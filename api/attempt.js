import { handler, authSiswa, norm } from './_lib/auth.js';
import { startUjian, saveJawaban, submitUjian } from './_lib/exam.js';

export default handler(async (body) => {
  const studentId = authSiswa(body.token);
  const action = norm(body.action);
  const examId = norm(body.examId);
  if (!examId) throw new Error('ID ujian kosong.');

  if (action === 'start') return await startUjian(studentId, examId, norm(body.sessionPin));
  // body.ticket memungkinkan autosave menulis langsung ke baris SESI-nya
  // tanpa membaca sheet lebih dulu (lihat catatan di _lib/auth.js).
  if (action === 'save') return await saveJawaban(studentId, examId, body.answers, Number(body.revision), norm(body.ticket));
  if (action === 'submit') return await submitUjian(studentId, examId, body.answers, Number(body.revision));
  throw new Error('Aksi tidak dikenal: ' + action);
});
