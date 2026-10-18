import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CODE_LENGTH, emptyDigits, stepDigit, toCode } from '../src/core/digits.ts';

describe('digit wheels', () => {
  it('starts at 000000', () => {
    assert.equal(toCode(emptyDigits()), '0'.repeat(CODE_LENGTH));
  });

  it('turns one wheel and wraps 9 ↔ 0', () => {
    const up = stepDigit(emptyDigits(), 2, 1);
    assert.equal(toCode(up), '001000');
    assert.equal(toCode(stepDigit(emptyDigits(), 0, -1)), '900000');
    assert.equal(toCode(stepDigit([9, 0, 0, 0, 0, 0], 0, 1)), '000000');
  });

  it('ignores out-of-range positions', () => {
    const digits = emptyDigits();
    assert.equal(stepDigit(digits, 6, 1), digits);
  });
});
