import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffleQuestions } from '../api/_lib/exam.js';

const questions = [
  { id: 'Q01' }, { id: 'Q02' }, { id: 'Q03' }, { id: 'Q04' }, { id: 'Q05' }
];

test('question shuffle is deterministic for the same attempt', () => {
  const first = shuffleQuestions(questions, 'attempt-001').map(q => q.id);
  const second = shuffleQuestions(questions, 'attempt-001').map(q => q.id);
  assert.deepEqual(first, second);
});

test('question shuffle does not mutate the source and preserves all IDs', () => {
  const shuffled = shuffleQuestions(questions, 'attempt-002');
  assert.deepEqual(questions.map(q => q.id), ['Q01', 'Q02', 'Q03', 'Q04', 'Q05']);
  assert.deepEqual([...shuffled].map(q => q.id).sort(), ['Q01', 'Q02', 'Q03', 'Q04', 'Q05']);
});
