import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeQuestionInput } = await import('../api/_lib/exam.js');

const valid = {
  examId: 'P02', questionId: 'Q01', text: 'Apa fungsi focal point?',
  a: 'Menentukan pusat perhatian', b: 'Menghapus warna', c: 'Mengubah ukuran kertas', d: 'Menambah jumlah halaman',
  key: 'A', weight: '1', fileId: ''
};

test('question editor normalizes a valid question', () => {
  assert.deepEqual(normalizeQuestionInput(valid), {
    examId: 'P02', id: 'Q01', text: 'Apa fungsi focal point?',
    a: 'Menentukan pusat perhatian', b: 'Menghapus warna', c: 'Mengubah ukuran kertas', d: 'Menambah jumlah halaman',
    key: 'A', weight: 1, fileId: ''
  });
});

test('question editor rejects invalid question data', () => {
  assert.throws(() => normalizeQuestionInput({ ...valid, questionId: 'Q 01' }), /ID soal/);
  assert.throws(() => normalizeQuestionInput({ ...valid, key: 'E' }), /Kunci jawaban/);
  assert.throws(() => normalizeQuestionInput({ ...valid, text: '' }), /Pertanyaan wajib/);
  assert.throws(() => normalizeQuestionInput({ ...valid, weight: 0 }), /Bobot/);
});
