import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIDENCE, toConfidenceTier } from '../constants';

describe('toConfidenceTier', () => {
  test('passes every known tier through unchanged', () => {
    assert.equal(toConfidenceTier(CONFIDENCE.confirmed), 'confirmed');
    assert.equal(toConfidenceTier(CONFIDENCE.provisional), 'provisional');
    assert.equal(toConfidenceTier(CONFIDENCE.setterOnly), 'setter_only');
    // Raw string literals, in case a caller passes the DB value directly.
    assert.equal(toConfidenceTier('confirmed'), 'confirmed');
    assert.equal(toConfidenceTier('provisional'), 'provisional');
    assert.equal(toConfidenceTier('setter_only'), 'setter_only');
  });

  test('withholds an unknown or future tier as null', () => {
    // A tier the DB might grow before the zod enum + CONFIDENCE catch up: it
    // must be dropped, not surfaced, so party-mode round-trip validation holds.
    assert.equal(toConfidenceTier('experimental'), null);
    assert.equal(toConfidenceTier('CONFIRMED'), null); // case-sensitive
    assert.equal(toConfidenceTier(''), null);
  });

  test('maps null and undefined to null', () => {
    assert.equal(toConfidenceTier(null), null);
    assert.equal(toConfidenceTier(undefined), null);
  });
});
