import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MockVehicleProvider, type VehicleStatus } from '@gauss-hud/shared';
import { createI18n, pickLocale } from '../src/core/i18n/index.ts';
import { toQuickActions } from '../src/core/view/commands.ts';
import { formatUpdated, toStatusView } from '../src/core/view/status.ts';

const en = createI18n('en');
const fr = createI18n('fr');
const NOW = Date.parse('2026-10-18T12:00:00Z');
const base: VehicleStatus = new MockVehicleProvider({ now: () => new Date(NOW) }).lastKnownStatus();

describe('i18n', () => {
  it('picks French for fr-* and English otherwise', () => {
    assert.equal(pickLocale(['fr-FR', 'en']), 'fr');
    assert.equal(pickLocale(['de-DE', 'en-GB']), 'en');
    assert.equal(pickLocale(['ja']), 'en');
  });
});

describe('status view', () => {
  it('formats the figures and the charging session', () => {
    const view = toStatusView(base, { monthCost: 2.4, monthlyCredit: 10, currency: 'EUR' }, NOW, en);
    assert.equal(view.battery, '72 %');
    assert.equal(view.range, '318 km');
    assert.equal(view.charging, 'Charging');
    assert.equal(view.chargingValue, '11 kW');
    assert.match(view.chargingDetail ?? '', /^Until \d{2}:\d{2}/);
    assert.equal(view.badge, null);
    assert.equal(view.usage?.text, 'API €2.40 / €10.00');
    assert.equal(view.usage.progress, 0.24);
    assert.equal(view.batteryProgress, 0.72);
    assert.equal(view.batteryLabel, 'Battery 72 %');
  });

  it('caps the usage bar once the credit is spent', () => {
    const view = toStatusView(base, { monthCost: 13, monthlyCredit: 10, currency: 'EUR' }, NOW, en);
    assert.equal(view.usage?.progress, 1);
  });

  it('flags a sleeping vehicle', () => {
    assert.equal(toStatusView({ ...base, connection: 'asleep' }, null, NOW, fr).badge, 'Endormie');
  });

  it('says how old the data is', () => {
    const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
    assert.equal(formatUpdated(ago(0), NOW, en), 'Updated just now');
    assert.equal(formatUpdated(ago(5), NOW, fr), 'Mis à jour il y a 5 min');
    assert.equal(formatUpdated(ago(180), NOW, en), 'Updated 3 h ago');
  });
});

describe('quick actions', () => {
  const all = new MockVehicleProvider().capabilities;

  it('lists lock, trunk, guard, charge port, climate, charging, in that order', () => {
    const actions = toQuickActions(all, { ...base, climateOn: true, guardOn: true }, en);
    assert.deepEqual(
      actions.map((a) => a.command),
      ['lock', 'trunk.rear', 'guard.off', 'chargePort.close', 'climate.off', 'charging.stop'],
    );
    assert.deepEqual(
      actions.filter((a) => a.active).map((a) => a.key),
      ['guard', 'chargePort', 'climate', 'charging'],
    );
    assert.equal(actions.find((a) => a.key === 'trunk')?.needsPin, true);
  });

  it('marks the lock as done when already locked, and never offers to unlock', () => {
    const locked = toQuickActions(all, base, fr).find((a) => a.key === 'lock');
    assert.equal(locked?.done, true);
    assert.equal(locked.label, 'Verrouillée');
    const unlocked = toQuickActions(all, { ...base, locked: false }, en).find((a) => a.key === 'lock');
    assert.equal(unlocked?.done, false);
    assert.equal(unlocked.command, 'lock');
  });

  it('hides commands the vehicle does not support', () => {
    const actions = toQuickActions(['lock', 'climate.on', 'climate.off'], base, en);
    assert.deepEqual(
      actions.map((a) => a.key),
      ['lock', 'climate'],
    );
  });
});
