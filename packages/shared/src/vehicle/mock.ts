import { VEHICLE_COMMANDS, type VehicleCommand } from './commands.ts';
import type { ExecuteResult, VehicleProvider } from './provider.ts';
import type { ConnectionState, VehicleStatus } from './status.ts';

/** Runs in Node and in the browser, so no `node:timers` import. */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const MOCK_SCENARIOS = ['online', 'asleep', 'offline', 'driving', 'no_key', 'failing'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export interface MockOptions {
  scenario?: MockScenario;
  /** Simulated network latency per call. */
  latencyMs?: number;
  /** Simulated wake-up duration (a real one takes 10 to 60 s). */
  wakeDelayMs?: number;
  capabilities?: readonly VehicleCommand[];
  now?: () => Date;
}

export const isMockScenario = (value: unknown): value is MockScenario =>
  (MOCK_SCENARIOS as readonly unknown[]).includes(value);

/** In-memory vehicle for development and tests. Commands change its state like a real car would. */
export class MockVehicleProvider implements VehicleProvider {
  readonly capabilities: readonly VehicleCommand[];
  readonly #scenario: MockScenario;
  readonly #latencyMs: number;
  readonly #wakeDelayMs: number;
  readonly #now: () => Date;
  #connection: ConnectionState;
  #status: VehicleStatus;

  constructor({
    scenario = 'online',
    latencyMs = 400,
    wakeDelayMs = 4_000,
    capabilities = VEHICLE_COMMANDS,
    now = () => new Date(),
  }: MockOptions = {}) {
    this.capabilities = capabilities;
    this.#scenario = scenario;
    this.#latencyMs = latencyMs;
    this.#wakeDelayMs = wakeDelayMs;
    this.#now = now;
    this.#connection = scenario === 'asleep' ? 'asleep' : scenario === 'offline' ? 'offline' : 'online';
    const at = this.#now().getTime();
    this.#status = {
      connection: this.#connection,
      // A sleeping or offline car was last read a while ago.
      updatedAt: new Date(at - (this.#connection === 'online' ? 0 : 47 * 60_000)).toISOString(),
      batteryPercent: 72,
      rangeKm: 318,
      pluggedIn: true,
      charging:
        this.#connection === 'online' ? { powerKw: 11, endsAt: new Date(at + 100 * 60_000).toISOString() } : null,
      chargePortOpen: true,
      locked: true,
      cabinTempC: 19.5,
      climateOn: false,
      guardOn: false,
      moving: scenario === 'driving',
    };
  }

  /** Mock-only: the status a server would have cached from an earlier read. */
  lastKnownStatus(): VehicleStatus {
    return this.#status;
  }

  async connection(): Promise<ConnectionState> {
    await delay(this.#latencyMs);
    return this.#connection;
  }

  async readStatus(): Promise<VehicleStatus> {
    await delay(this.#latencyMs);
    if (this.#connection !== 'online') throw new Error('readStatus() called while the vehicle is not online');
    this.#status = { ...this.#status, connection: 'online', updatedAt: this.#now().toISOString() };
    return this.#status;
  }

  async wake(timeoutMs: number): Promise<boolean> {
    if (this.#connection === 'offline') {
      await delay(Math.min(timeoutMs, this.#wakeDelayMs));
      return false;
    }
    if (this.#connection === 'asleep') {
      if (this.#wakeDelayMs > timeoutMs) {
        await delay(timeoutMs);
        return false;
      }
      await delay(this.#wakeDelayMs);
      this.#connection = 'online';
    }
    return true;
  }

  async hasKey(): Promise<boolean> {
    await delay(this.#latencyMs);
    return this.#scenario !== 'no_key';
  }

  async execute(command: VehicleCommand): Promise<ExecuteResult> {
    await delay(this.#latencyMs);
    if (this.#connection !== 'online') return 'timeout';
    if (this.#scenario === 'failing') return 'failed';
    this.#status = { ...this.#status, ...this.#effect(command) };
    return 'ok';
  }

  #effect(command: VehicleCommand): Partial<VehicleStatus> {
    switch (command) {
      case 'climate.on':
        return { climateOn: true };
      case 'climate.off':
        return { climateOn: false };
      case 'charging.start':
        return this.#status.pluggedIn
          ? { charging: { powerKw: 11, endsAt: new Date(this.#now().getTime() + 100 * 60_000).toISOString() } }
          : {};
      case 'charging.stop':
        return { charging: null };
      case 'chargePort.open':
        return { chargePortOpen: true };
      case 'chargePort.close':
        return this.#status.pluggedIn ? {} : { chargePortOpen: false };
      case 'lock':
        return { locked: true };
      case 'trunk.rear':
        return {};
      case 'guard.on':
        return { guardOn: true };
      case 'guard.off':
        return { guardOn: false };
    }
  }
}
