import test from 'node:test';
import assert from 'node:assert/strict';

process.env.HASH_SECRET = 'student-admin-test-hash-secret';
process.env.SESSION_SECRET = 'student-admin-test-session-secret';

const { normalizeStudentInput, attendancePayload } = await import('../api/_lib/exam.js');

test('student admin input accepts a class placement', () => {
  assert.deepEqual(normalizeStudentInput({
    studentId: 'XI-DKV-001',
    name: 'Siswa Contoh',
    classId: 'KLS-XI-DKV-ABC123',
    group: '1'
  }), {
    id: 'XI-DKV-001',
    name: 'Siswa Contoh',
    classId: 'KLS-XI-DKV-ABC123',
    group: '1'
  });
});

test('student admin input rejects invalid or incomplete data', () => {
  assert.throws(() => normalizeStudentInput({ studentId: 'ID SISWA', name: 'Nama', classId: 'KLS-1' }), /ID siswa/);
  assert.throws(() => normalizeStudentInput({ studentId: 'S-01', name: '', classId: 'KLS-1' }), /Nama siswa/);
  assert.throws(() => normalizeStudentInput({ studentId: 'S-01', name: 'Nama', classId: '' }), /Pilih kelas/);
});

test('attendance QR payload contains only its opaque token', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz_123456';
  assert.equal(attendancePayload(token), 'UJIAN-ABSEN:' + token);
  assert.throws(() => attendancePayload('short'), /Token QR/);
});
