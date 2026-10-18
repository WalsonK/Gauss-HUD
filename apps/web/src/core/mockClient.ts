import {
  COMMAND_INFO,
  MockVehicleProvider,
  refreshStatus,
  runCommand,
  type CommandOutcome,
  type MockOptions,
  type UsageSummary,
  type VehicleCommand,
  type VehicleStatus,
} from '@gauss-hud/shared';
import type { HudClient, HudSnapshot, PairResult, SendOptions } from './client.ts';

/**
 * Development-only codes. The real pairing code is generated on the server and the real PIN is
 * stored hashed there; nothing like this exists outside the mock.
 */
export const MOCK_PAIRING_CODE = '123456';
export const MOCK_PIN = '246810';

const PIN_MAX_FAILURES = 3;
const PIN_LOCK_MS = 15 * 60_000;
const PAIRED_KEY = 'gauss-hud.mock.paired';

const USAGE: UsageSummary = { monthCost: 2.4, monthlyCredit: 10, currency: 'EUR' };

/** Remembers the pairing for the browser tab, so a reload doesn't ask again. */
function readPaired(): boolean {
  try {
    return sessionStorage.getItem(PAIRED_KEY) === '1';
  } catch {
    return false;
  }
}

function writePaired(): void {
  try {
    sessionStorage.setItem(PAIRED_KEY, '1');
  } catch {
    // Storage unavailable: pairing lasts until the next reload.
  }
}

/** In-browser stand-in for the API, built on the shared mock vehicle and use cases. */
export class MockHudClient implements HudClient {
  readonly #vehicle: MockVehicleProvider;
  readonly #now: () => number;
  #paired = readPaired();
  /** Stands for the server cache: shown at once, before the first refresh. */
  #status: VehicleStatus | null;
  #pinFailures = 0;
  #pinLockedUntil = 0;

  constructor(options: MockOptions = {}, now: () => number = Date.now) {
    this.#vehicle = new MockVehicleProvider(options);
    this.#status = this.#vehicle.lastKnownStatus();
    this.#now = now;
  }

  isPaired(): Promise<boolean> {
    return Promise.resolve(this.#paired);
  }

  pair(code: string): Promise<PairResult> {
    if (code !== MOCK_PAIRING_CODE) return Promise.resolve('invalid');
    this.#paired = true;
    writePaired();
    return Promise.resolve('ok');
  }

  snapshot(): Promise<HudSnapshot> {
    return Promise.resolve({ status: this.#status, usage: USAGE, capabilities: this.#vehicle.capabilities });
  }

  async refresh(): Promise<HudSnapshot> {
    this.#status = await refreshStatus(this.#vehicle, this.#status);
    return this.snapshot();
  }

  async send(command: VehicleCommand, { pin, onProgress }: SendOptions = {}): Promise<CommandOutcome> {
    const refuse = (outcome: CommandOutcome) => {
      onProgress?.({ phase: 'done', outcome });
      return outcome;
    };
    if (COMMAND_INFO[command].needsPin) {
      const pinOutcome = this.#checkPin(pin);
      if (pinOutcome) return refuse(pinOutcome);
    }
    const outcome = await runCommand(this.#vehicle, command, { onProgress });
    // Show the effect right away, as the server would after re-reading the vehicle.
    if (outcome === 'ok' || outcome === 'timeout') this.#status = await refreshStatus(this.#vehicle, this.#status);
    return outcome;
  }

  /** Same rules as the server: 3 failures lock the PIN for 15 minutes. */
  #checkPin(pin: string | undefined): CommandOutcome | null {
    if (this.#now() < this.#pinLockedUntil) return 'pin_locked';
    if (pin === MOCK_PIN) {
      this.#pinFailures = 0;
      return null;
    }
    this.#pinFailures += 1;
    if (this.#pinFailures >= PIN_MAX_FAILURES) {
      this.#pinFailures = 0;
      this.#pinLockedUntil = this.#now() + PIN_LOCK_MS;
      return 'pin_locked';
    }
    return 'wrong_pin';
  }
}
