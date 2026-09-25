import test from 'node:test';
import assert from 'node:assert/strict';

process.env.HASH_SECRET = 'attendance-test-hash-secret';
process.env.SESSION_SECRET = 'attendance-test-session-secret';

const { attendancePayload, attendanceTokenFromPayload, normalizeAttendanceSessionInput } =
  await import('../api/_lib/exam.js');
const { HEADERS } = await import('../api/_lib/store.js');

test('attendance QR payload round trip keeps only the opaque token', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz_123456';
  const payload = attendancePayload(token);
  assert.equal(attendanceTokenFromPayload(payload), token);
  assert.throws(() => attendanceTokenFromPayload('https://example.com/student/1'), /bukan kartu siswa/);
  assert.throws(() => attendanceTokenFromPayload('UJIAN-ABSEN:short'), /Token QR/);
});

test('attendance session input requires a class and limits its title', () => {
  assert.deepEqual(normalizeAttendanceSessionInput({ classId: 'KLS-XI-DKV-01', title: 'Apel pagi' }), {
    classId: 'KLS-XI-DKV-01',
    title: 'Apel pagi'
  });
  assert.deepEqual(normalizeAttendanceSessionInput({ classId: 'KLS-XI-DKV-01', title: '' }).title, 'Absensi kelas');
  assert.throws(() => normalizeAttendanceSessionInput({ classId: '' }), /Pilih kelas/);
  assert.throws(() => normalizeAttendanceSessionInput({ classId: 'KLS-1', title: 'x'.repeat(121) }), /terlalu panjang/);
});

test('attendance sheets expose stable append-only headers', () => {
  assert.deepEqual(HEADERS.ABSENSI_SESI, [
    'SesiAbsenID', 'KelasID', 'NamaKelas', 'Judul', 'DibukaMs', 'DitutupMs', 'Status'
  ]);
  assert.deepEqual(HEADERS.ABSENSI, [
    'AbsenID', 'SesiAbsenID', 'SiswaID', 'NamaSiswa', 'KelasID', 'NamaKelas', 'Kelompok', 'WaktuMs', 'Status'
  ]);
});
