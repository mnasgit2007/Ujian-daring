import { handler, norm, checkThrottle, recordFailure, clearThrottle, hashSiswa, hashAdmin, hash, signToken } from './_lib/auth.js';
import { getStudents, dashboardSiswa, adminDashboard } from './_lib/exam.js';
import { SHEETS, preload, readRows } from './_lib/store.js';

export default handler(async (body) => {
  const role = norm(body.role) === 'admin' ? 'A' : 'S';
  return role === 'S' ? await loginSiswa(body) : await loginAdmin(body);
});

async function loginSiswa(body) {
  const id = norm(body.id);
  const pin = norm(body.pin);
  if (!id || !pin || id.length > 40 || pin.length > 30) throw new Error('ID atau PIN tidak valid.');

  // Satu batchGet menyiapkan semua yang dibutuhkan login siswa: pembatas
  // percobaan, data siswa, daftar ujian, dan riwayat sesi untuk dashboard.
  // Sebelumnya bagian ini memakan 6 permintaan terpisah.
  await preload([SHEETS.LOGIN_LIMIT, SHEETS.SISWA, SHEETS.UJIAN, SHEETS.SESI]);

  const key = 'S:' + id;
  const throttle = await checkThrottle(key);

  const students = await getStudents();
  const siswa = students.find(s => s.id === id && s.active);
  if (!siswa || siswa.hash !== hashSiswa(id, pin)) {
    await recordFailure(key, throttle);
    throw new Error('ID/PIN salah atau akun tidak aktif.');
  }
  await clearThrottle(key, throttle);

  const token = signToken({ role: 'S', id });
  const dash = await dashboardSiswa(id);
  return { token, ...dash };
}

async function loginAdmin(body) {
  const password = norm(body.password);
  const teacherId = norm(body.teacherId);
  if (teacherId) {
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(teacherId) || password.length > 80) throw new Error('ID/kata sandi guru tidak valid.');
    const key = 'G:' + teacherId, throttle = await checkThrottle(key);
    const rows = await readRows(SHEETS.GURU, { fresh: true });
    const teacher = rows.slice(1).find(r => norm(r[0]) === teacherId && norm(r[3]) === 'YA');
    if (!teacher || teacher[2] !== hash('GURU:' + teacherId + ':' + password)) {
      await recordFailure(key, throttle); throw new Error('ID/kata sandi guru salah atau akun tidak aktif.');
    }
    await clearThrottle(key, throttle);
    return { token: signToken({ role: 'A', id: teacherId }), ...(await adminDashboard()) };
  }
  await preload([SHEETS.LOGIN_LIMIT, SHEETS.UJIAN, SHEETS.SISWA, SHEETS.SESI]);
  const throttle = await checkThrottle('ADMIN');

  const expected = norm(process.env.ADMIN_HASH);
  if (!expected) throw new Error('ADMIN_HASH belum diatur di Environment Variables Vercel.');
  if (!password || hashAdmin(password) !== expected) {
    await recordFailure('ADMIN', throttle);
    throw new Error('Kata sandi admin salah.');
  }
  await clearThrottle('ADMIN', throttle);

  const token = signToken({ role: 'A' });
  const dash = await adminDashboard();
  return { token, ...dash };
}
