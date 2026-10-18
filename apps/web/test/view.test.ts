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
    assert.equal(view.usage.alert, false);
    assert.equal(view.batteryProgress, 0.72);
    assert.equal(view.batteryLabel, 'Battery 72 %');
  });

  it('caps the usage bar once the credit is spent', () => {
    const view = toStatusView(base, { monthCost: 13, monthlyCredit: 10, currency: 'EUR' }, NOW, en);
    assert.equal(view.usage?.progress, 1);
  });

  it('flags the API spend from 80 % of the credit', () => {
    const at = (monthCost: number) =>
      toStatusView(base, { monthCost, monthlyCredit: 10, currency: 'EUR' }, NOW, en).usage?.alert;
    assert.equal(at(7.9), false);
    assert.equal(at(8), true);
  });

  it('has no charging value when unplugged', () => {
    const view = toStatusView({ ...base, pluggedIn: false, charging: null }, null, NOW, en);
    assert.equal(view.chargingValue, null);
    assert.equal(view.chargingDetail, null);
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

  it('lists climate, trunk, guard, charge, in that order (lock is a state, not a button)', () => {
    const actions = toQuickActions(all, { ...base, climateOn: true, guardOn: true }, en);
    assert.deepEqual(
      actions.map((a) => a.key),
      ['climate', 'trunk', 'guard', 'charge'],
    );
    assert.deepEqual(
      actions.filter((a) => a.active).map((a) => a.key),
      ['climate', 'guard', 'charge'],
    );
    assert.equal(actions.find((a) => a.key === 'trunk')?.needsPin, true);
  });

  it('makes the charge button follow the cable', () => {
    const charge = (status: Partial<VehicleStatus>) =>
      toQuickActions(all, { ...base, ...status }, en).find((a) => a.key === 'charge');
    assert.equal(charge({ pluggedIn: true, charging: { powerKw: 11, endsAt: null } })?.command, 'charging.stop');
    assert.equal(charge({ pluggedIn: true, charging: null })?.command, 'charging.start');
    assert.equal(charge({ pluggedIn: false, charging: null, chargePortOpen: true })?.command, 'chargePort.close');
    assert.equal(charge({ pluggedIn: false, charging: null, chargePortOpen: false })?.command, 'chargePort.open');
  });

  it('hides commands the vehicle does not support', () => {
    const actions = toQuickActions(['lock', 'climate.on', 'climate.off'], base, en);
    assert.deepEqual(
      actions.map((a) => a.key),
      ['climate'],
    );
  });
});
