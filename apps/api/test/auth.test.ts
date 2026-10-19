import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Pairing, PAIRING_CODE_TTL_MS } from '../src/auth/pairing.ts';
import { PIN_LOCK_MS, PinStore } from '../src/auth/pin.ts';
import { KeyValue, openDb } from '../src/db.ts';
import { clock } from './helpers.ts';

describe('Pairing', () => {
  it('turns a code into a session token, once', () => {
    const pairing = new Pairing(openDb(':memory:'));
    const code = pairing.createCode();
    assert.match(code, /^\d{6}$/);
    const token = pairing.redeem(code);
    assert.ok(token);
    assert.equal(pairing.verify(token), true);
    assert.equal(pairing.redeem(code), null);
  });

  it('refuses an expired code', () => {
    const time = clock();
    const pairing = new Pairing(openDb(':memory:'), time.now);
    const code = pairing.createCode();
    time.advance(PAIRING_CODE_TTL_MS);
    assert.equal(pairing.redeem(code), null);
  });

  it('refuses malformed codes and unknown tokens', () => {
    const pairing = new Pairing(openDb(':memory:'));
    pairing.createCode();
    assert.equal(pairing.redeem('12345'), null);
    assert.equal(pairing.redeem("1' OR 1"), null);
    assert.equal(pairing.verify(undefined), false);
    assert.equal(pairing.verify('nope'), false);
  });

  it('revokes every session', () => {
    const pairing = new Pairing(openDb(':memory:'));
    const token = pairing.redeem(pairing.createCode());
    assert.equal(pairing.revokeAll(), 1);
    assert.equal(pairing.verify(token ?? undefined), false);
  });
});

describe('PinStore', () => {
  const store = (now?: () => number) => new PinStore(new KeyValue(openDb(':memory:')), now);

  it('stores a hash, never the PIN', async () => {
    const kv = new KeyValue(openDb(':memory:'));
    await new PinStore(kv).set('246810');
    const raw = JSON.stringify(kv.get('pin', (await import('zod')).z.unknown()));
    assert.doesNotMatch(raw, /246810/);
    assert.match(raw, /argon2id\$/);
  });

  it('accepts the right PIN and refuses a wrong one', async () => {
    const pins = store();
    assert.equal(await pins.check('246810'), 'not_set');
    await pins.set('246810');
    assert.equal(await pins.check('246810'), 'ok');
    assert.equal(await pins.check('000000'), 'wrong_pin');
    assert.equal(await pins.check(undefined), 'wrong_pin');
  });

  it('locks for 15 minutes after 3 failures, even for the right PIN', async () => {
    const time = clock();
    const pins = store(time.now);
    await pins.set('246810');
    assert.equal(await pins.check('1'), 'wrong_pin');
    assert.equal(await pins.check('2'), 'wrong_pin');
    assert.equal(await pins.check('3'), 'pin_locked');
    assert.equal(await pins.check('246810'), 'pin_locked');
    time.advance(PIN_LOCK_MS);
    assert.equal(await pins.check('246810'), 'ok');
  });

  it('resets the failure count after a success', async () => {
    const pins = store();
    await pins.set('246810');
    await pins.check('1');
    await pins.check('2');
    assert.equal(await pins.check('246810'), 'ok');
    assert.equal(await pins.check('1'), 'wrong_pin');
  });

  it('refuses a malformed PIN', async () => {
    await assert.rejects(store().set('12ab56'));
  });
});
