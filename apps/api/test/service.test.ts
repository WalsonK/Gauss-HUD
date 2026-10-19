import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommandProgress, VehicleProvider } from '@gauss-hud/shared';
import { clock, testContext } from './helpers.ts';

/** Records the vehicle calls that reach the (metered) mock. */
function spy() {
  const calls: string[] = [];
  const wrap = (p: VehicleProvider): VehicleProvider => ({
    capabilities: p.capabilities,
    connection: () => (calls.push('connection'), p.connection()),
    readStatus: () => (calls.push('readStatus'), p.readStatus()),
    hasKey: () => (calls.push('hasKey'), p.hasKey()),
    wake: (ms) => (calls.push('wake'), p.wake(ms)),
    execute: (c, v) => (calls.push(`execute:${c}`), p.execute(c, v)),
  });
  return { calls, wrap };
}

describe('VehicleService.refresh', () => {
  it('reads at most once per minimum interval', async () => {
    const time = clock();
    const { calls, wrap } = spy();
    const { service } = testContext({ now: time.now, wrap, env: { DATA_MIN_INTERVAL_SEC: '120' } });
    await service.refresh();
    await service.refresh();
    assert.deepEqual(calls, ['connection', 'readStatus']);
    time.advance(120_000);
    await service.refresh();
    assert.equal(calls.length, 4);
  });

  it('never wakes a sleeping vehicle to show its status', async () => {
    const { calls, wrap } = spy();
    const { service } = testContext({ scenario: 'asleep', wrap });
    await service.refresh();
    assert.deepEqual(calls, ['connection']);
  });

  it('counts billable calls', async () => {
    const { service, usage } = testContext();
    await service.refresh();
    assert.equal(usage.today('data'), 2);
  });
});

describe('VehicleService.send', () => {
  it('runs a command, streams progress and shows its effect', async () => {
    const { service } = testContext();
    const progress: CommandProgress[] = [];
    const outcome = await service.send('climate.on', { onProgress: (p) => progress.push(p) });
    assert.equal(outcome, 'ok');
    assert.deepEqual(progress, [{ phase: 'sending' }, { phase: 'done', outcome: 'ok' }]);
    assert.equal(service.snapshot().status?.climateOn, true);
  });

  it('refuses while the vehicle is moving', async () => {
    const { calls, wrap } = spy();
    const { service } = testContext({ scenario: 'driving', wrap });
    assert.equal(await service.send('climate.on'), 'moving');
    assert.ok(!calls.some((c) => c.startsWith('execute')));
  });

  it('asks the PIN for the trunk, and refuses when none is set', async () => {
    const { service, pin } = testContext();
    assert.equal(await service.send('trunk.rear', { pin: '246810' }), 'failed');
    await pin.set('246810');
    assert.equal(await service.send('trunk.rear', { pin: '000000' }), 'wrong_pin');
    assert.equal(await service.send('trunk.rear', { pin: '246810' }), 'ok');
  });

  it('applies the daily command cap', async () => {
    const { service } = testContext({ env: { DAILY_MAX_COMMANDS: '2' } });
    assert.equal(await service.send('climate.on'), 'ok');
    assert.equal(await service.send('climate.off'), 'ok');
    assert.equal(await service.send('climate.on'), 'cap_reached');
  });

  it('applies the daily wake-up cap', async () => {
    const { service } = testContext({ scenario: 'asleep', env: { DAILY_MAX_WAKES: '0' } });
    const progress: CommandProgress[] = [];
    assert.equal(await service.send('climate.on', { onProgress: (p) => progress.push(p) }), 'cap_reached');
    assert.deepEqual(progress.at(-1), { phase: 'done', outcome: 'cap_reached' });
  });

  it('dry-run never wakes nor commands the vehicle', async () => {
    const { service, usage } = testContext({ scenario: 'asleep', env: { DRY_RUN: 'true' } });
    assert.equal(await service.send('climate.on'), 'ok');
    assert.equal(usage.today('wakes'), 0);
    assert.equal(usage.today('commands'), 0);
  });

  it('refuses a value outside the allowed range', async () => {
    const { service } = testContext();
    assert.equal(await service.send('climate.setTemp', { value: 35 }), 'failed');
    assert.equal(await service.send('climate.setTemp', { value: 21.5 }), 'ok');
    assert.equal(service.snapshot().status?.targetTempC, 21.5);
  });
});
