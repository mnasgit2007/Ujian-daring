import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionRows } from '../scripts/question-import.mjs';

const header = ['Soal ID', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Kunci', 'Bobot', 'Drive File ID'];

test('question import maps spreadsheet headers to SOAL rows', () => {
  const rows = parseQuestionRows([header, ['Q01', 'Apa tujuan desain?', 'A', 'B', 'C', 'D', 'B', '20', '']], 'P02', 'uji.tsv');
  assert.deepEqual(rows, [['P02', 'Q01', 'Apa tujuan desain?', 'A', 'B', 'C', 'D', 'B', 20, '']]);
});

test('question import rejects duplicate or invalid questions', () => {
  assert.throws(() => parseQuestionRows([header, ['Q01', 'Pertanyaan 1', 'A', 'B', 'C', 'D', 'A', '10', ''], ['Q01', 'Pertanyaan 2', 'A', 'B', 'C', 'D', 'B', '10', '']], 'P02'), /SoalID duplikat/);
  assert.throws(() => parseQuestionRows([header, ['Q02', 'Pertanyaan', 'A', 'B', 'C', 'D', 'E', '10', '']], 'P02'), /Kunci harus/);
});
