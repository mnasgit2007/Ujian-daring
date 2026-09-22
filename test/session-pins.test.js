import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionPin } from '../api/_lib/exam.js';

test('session PIN is a six-digit numeric value', () => {
  for (let i = 0; i < 20; i++) assert.match(createSessionPin(), /^\d{6}$/);
});
