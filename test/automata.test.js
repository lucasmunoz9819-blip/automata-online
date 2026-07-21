import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalTier } from '../src/state.js';
import { inside } from '../src/util.js';

test('niveles de supervivencia', () => {
  assert.equal(survivalTier(100, 100), 'normal');
  assert.equal(survivalTier(20, 100), 'low_compute');
  assert.equal(survivalTier(2, 100), 'critical');
  assert.equal(survivalTier(0, 100), 'dead');
});

test('impide escapar del espacio autorizado', () => {
  assert.throws(() => inside('C:/safe', '../secret'));
});
