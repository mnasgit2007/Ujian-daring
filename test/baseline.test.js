import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.HASH_SECRET = 'baseline-test-hash-secret';
process.env.SESSION_SECRET = 'baseline-test-session-secret';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { hashSiswa, hashAdmin, signToken, verifyToken, signAttemptTicket, readAttemptTicket } =
  await import('../api/_lib/auth.js');
const { validateAnswers } = await import('../api/_lib/exam.js');
const { cellToEpoch, fmtEpoch } = await import('../api/_lib/store.js');

test('baseline files and API routes exist', async () => {
  const required = [
    'public/index.html',
    'api/login.js',
    'api/dashboard.js',
    'api/attempt.js',
    'api/admin.js',
    'api/image.js',
    'api/_lib/auth.js',
    'api/_lib/exam.js',
    'api/_lib/store.js'
  ];

  for (const file of required) {
    await assert.doesNotReject(fs.access(path.join(root, file)), file);
  }
});

test('frontend copies remain identical', async () => {
  const [rootIndex, publicIndex] = await Promise.all([
    fs.readFile(path.join(root, 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'public/index.html'), 'utf8')
  ]);
  assert.equal(rootIndex, publicIndex);
});

test('frontend element references remain complete and unique', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const referenced = [...html.matchAll(/\bel\(["']([^"']+)["']\)/g)].map(match => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const missingIds = [...new Set(referenced.filter(id => !ids.includes(id)))];

  assert.deepEqual(duplicateIds, [], 'duplicate frontend IDs');
  assert.deepEqual(missingIds, [], 'element references without matching IDs');
});

test('admin UI keeps class, student, and QR endpoint bindings', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  for (const endpoint of [
    'adminCreateClass',
    'adminAssignStudentClass',
    'adminCreateStudent',
    'adminStudentQrs',
    'adminCreateAttendanceSession',
    'adminCloseAttendanceSession',
    'adminScanAttendanceQr',
    'adminListQuestions',
    'adminResetAttempt'
  ]) {
    assert.match(html, new RegExp(`\\b${endpoint}:`), endpoint);
  }
});

test('student and admin hashes are deterministic and distinct', () => {
  assert.equal(hashSiswa('XI-DKV-001', '12345678'), hashSiswa('XI-DKV-001', '12345678'));
  assert.notEqual(hashSiswa('XI-DKV-001', '12345678'), hashSiswa('XI-DKV-002', '12345678'));
  assert.notEqual(hashAdmin('password-admin'), hashSiswa('XI-DKV-001', 'password-admin'));
});

test('session token round trip and expiry validation', () => {
  const token = signToken({ role: 'S', id: 'XI-DKV-001' });
  assert.deepEqual(verifyToken(token, 'S').id, 'XI-DKV-001');
  assert.throws(() => verifyToken(token, 'A'), /Akses ditolak/);
  assert.throws(() => verifyToken('invalid-token', 'S'), /Sesi tidak valid/);
});

test('exam attempt ticket is bound to student and exam', () => {
  const ticket = signAttemptTicket('XI-DKV-001', 'P02', 7, Date.now() + 60_000, 'attempt-1');
  assert.equal(readAttemptTicket(ticket, 'XI-DKV-001', 'P02').row, 7);
  assert.equal(readAttemptTicket(ticket, 'XI-DKV-002', 'P02'), null);
  assert.equal(readAttemptTicket(ticket, 'XI-DKV-001', 'P03'), null);
});

test('answer validation accepts normal answers', () => {
  assert.deepEqual(validateAnswers({ Q1: 'A', Q2: 'D' }, 2), {
    answers: { Q1: 'A', Q2: 'D' },
    revision: 2
  });
});

test('answer validation rejects invalid input and excessive questions', () => {
  assert.throws(() => validateAnswers(null, 0), /Jawaban tidak valid/);
  assert.throws(() => validateAnswers({ Q1: 'E' }, 1), /Format jawaban tidak valid/);
  assert.throws(() => validateAnswers({ Q1: 'A' }, -1), /Revisi tidak valid/);

  const tooMany = Object.fromEntries(Array.from({ length: 81 }, (_, i) => [`Q${i}`, 'A']));
  assert.throws(() => validateAnswers(tooMany, 81), /Jumlah jawaban melebihi batas/);
});

test('exam date conversion consistently uses WITA', () => {
  const epoch = cellToEpoch('2026-09-22 08:30:00');
  assert.equal(fmtEpoch(epoch), '2026-09-22 08:30:00');
  assert.throws(() => cellToEpoch('22/09/2026 08:30:00'), /Format tanggal/);
});
