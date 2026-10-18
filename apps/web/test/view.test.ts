import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MockVehicleProvider, type VehicleStatus } from '@gauss-hud/shared';
import { createI18n, pickLocale } from '../src/core/i18n/index.ts';
import { toCommandRows } from '../src/core/view/commands.ts';
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
    assert.equal(view.cost, 'API this month: €2.40 of €10.00');
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

describe('command rows', () => {
  it('offers the command that fits the current state', () => {
    const rows = toCommandRows(new MockVehicleProvider().capabilities, { ...base, climateOn: true }, en);
    assert.deepEqual(
      rows.map((r) => r.command),
      ['climate.off', 'charging.stop', 'chargePort.close', 'lock', 'trunk.rear'],
    );
    assert.equal(rows.find((r) => r.key === 'trunk')?.needsPin, true);
  });

  it('hides commands the vehicle does not support', () => {
    const rows = toCommandRows(['lock', 'climate.on', 'climate.off'], base, en);
    assert.deepEqual(
      rows.map((r) => r.key),
      ['climate', 'lock'],
    );
  });
});
