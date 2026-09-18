import { strict as assert } from 'node:assert';
import test from 'node:test';
import { completionReportPercent } from '../src/game/core/progressReporting.ts';

test('completion progress is only reported for a completed run', () => {
  assert.equal(completionReportPercent(0), null);
  assert.equal(completionReportPercent(0.12), null);
  assert.equal(completionReportPercent(0.999), null);
  assert.equal(completionReportPercent(1), 100);
  assert.equal(completionReportPercent(1.5), 100);
});
