import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MockVehicleProvider,
  refreshStatus,
  runCommand,
  type CommandProgress,
  type MockScenario,
  type VehicleProvider,
} from '../src/index.ts';

/** Mock without delays, wrapped to count calls per method. */
function spyProvider(scenario: MockScenario, wakeDelayMs = 0) {
  const inner = new MockVehicleProvider({ scenario, latencyMs: 0, wakeDelayMs });
  const calls: string[] = [];
  const provider: VehicleProvider = {
    capabilities: inner.capabilities,
    connection: () => (calls.push('connection'), inner.connection()),
    readStatus: () => (calls.push('readStatus'), inner.readStatus()),
    wake: (ms) => (calls.push('wake'), inner.wake(ms)),
    hasKey: () => (calls.push('hasKey'), inner.hasKey()),
    execute: (cmd) => (calls.push(`execute:${cmd}`), inner.execute(cmd)),
  };
  return { provider, calls };
}

describe('refreshStatus', () => {
  it('reads an online vehicle', async () => {
    const { provider, calls } = spyProvider('online');
    const status = await refreshStatus(provider, null);
    assert.equal(status?.connection, 'online');
    assert.deepEqual(calls, ['connection', 'readStatus']);
  });

  it('never wakes or reads a sleeping vehicle, and keeps the last status', async () => {
    const { provider, calls } = spyProvider('asleep');
    const last = await new MockVehicleProvider({ latencyMs: 0 }).readStatus();
    const status = await refreshStatus(provider, last);
    assert.deepEqual(calls, ['connection']);
    assert.equal(status?.connection, 'asleep');
    assert.equal(status.batteryPercent, last.batteryPercent);
  });
});

describe('runCommand', () => {
  it('sends a command to an online, parked vehicle', async () => {
    const { provider, calls } = spyProvider('online');
    const progress: CommandProgress[] = [];
    const outcome = await runCommand(provider, 'climate.on', { onProgress: (p) => progress.push(p) });
    assert.equal(outcome, 'ok');
    assert.deepEqual(calls, ['hasKey', 'connection', 'readStatus', 'execute:climate.on']);
    assert.deepEqual(progress, [{ phase: 'sending' }, { phase: 'done', outcome: 'ok' }]);
  });

  it('refuses when the vehicle is moving, without sending anything', async () => {
    const { provider, calls } = spyProvider('driving');
    assert.equal(await runCommand(provider, 'trunk.rear'), 'moving');
    assert.ok(!calls.some((c) => c.startsWith('execute')));
  });

  it('wakes a sleeping vehicle (no shift read) and then sends', async () => {
    const { provider, calls } = spyProvider('asleep');
    const phases: string[] = [];
    const outcome = await runCommand(provider, 'lock', { onProgress: (p) => phases.push(p.phase) });
    assert.equal(outcome, 'ok');
    assert.deepEqual(calls, ['hasKey', 'connection', 'wake', 'execute:lock']);
    assert.deepEqual(phases, ['sending', 'waking', 'done']);
  });

  it('gives up after the wake timeout and never retries', async () => {
    const { provider, calls } = spyProvider('asleep', 50);
    assert.equal(await runCommand(provider, 'trunk.rear', { wakeTimeoutMs: 10 }), 'timeout');
    assert.equal(calls.filter((c) => c === 'wake').length, 1);
    assert.ok(!calls.some((c) => c.startsWith('execute')));
  });

  it('refuses without the virtual key or when offline', async () => {
    assert.equal(await runCommand(spyProvider('no_key').provider, 'lock'), 'no_key');
    assert.equal(await runCommand(spyProvider('offline').provider, 'lock'), 'offline');
  });

  it('refuses a command outside the vehicle capabilities', async () => {
    const provider = new MockVehicleProvider({ latencyMs: 0, capabilities: ['lock'] });
    assert.equal(await runCommand(provider, 'trunk.rear'), 'failed');
  });

  it('sends a failing command once', async () => {
    const { provider, calls } = spyProvider('failing');
    assert.equal(await runCommand(provider, 'charging.stop'), 'failed');
    assert.equal(calls.filter((c) => c.startsWith('execute')).length, 1);
  });
});
