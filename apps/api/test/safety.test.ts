import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localDay } from '../src/clock.ts';
import { openDb } from '../src/db.ts';
import { Journal } from '../src/safety/journal.ts';
import { Usage } from '../src/safety/usage.ts';
import { clock } from './helpers.ts';

describe('localDay', () => {
  it('follows the configured time zone', () => {
    const at = Date.parse('2026-10-19T22:30:00Z');
    assert.equal(localDay(at, 'UTC'), '2026-10-19');
    assert.equal(localDay(at, 'Europe/Paris'), '2026-10-20');
  });
});

describe('Usage', () => {
  it('estimates the month cost from the price list', () => {
    const usage = new Usage(openDb(':memory:'), { timeZone: 'UTC', monthlyCredit: 10 });
    usage.record('data', 250); // 0.50 €
    usage.record('commands', 100); // 0.10 €
    usage.record('wakes', 5); // 0.10 €
    assert.deepEqual(usage.summary(), { monthCost: 0.7, monthlyCredit: 10, currency: 'EUR' });
  });

  it('counts per local day and per month', () => {
    const time = clock(Date.parse('2026-10-31T12:00:00Z'));
    const usage = new Usage(openDb(':memory:'), { timeZone: 'UTC', monthlyCredit: 10 }, time.now);
    usage.record('wakes', 2);
    assert.equal(usage.today('wakes'), 2);
    time.advance(24 * 3600_000);
    assert.equal(usage.today('wakes'), 0);
    assert.equal(usage.summary().monthCost, 0);
  });
});

describe('Journal', () => {
  it('counts only the commands that went past the PIN and the caps', () => {
    const journal = new Journal(openDb(':memory:'), 'UTC');
    const entry = { command: 'climate.on', value: undefined, dryRun: false, ip: '127.0.0.1' } as const;
    journal.add({ ...entry, outcome: 'ok' });
    journal.add({ ...entry, outcome: 'timeout' });
    journal.add({ ...entry, outcome: 'wrong_pin' });
    journal.add({ ...entry, outcome: 'cap_reached' });
    assert.equal(journal.sentToday(), 2);
  });
});
