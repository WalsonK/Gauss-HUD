import { MockVehicleProvider, type MockScenario, type VehicleProvider } from '@gauss-hud/shared';
import { parseConfig, type Config } from '../src/config.ts';
import { createContext, type Context } from '../src/context.ts';
import { createLogger } from '../src/logger.ts';
import { metered } from '../src/vehicle/wrappers.ts';

/** Controllable clock. */
export function clock(start = Date.parse('2026-10-19T10:00:00Z')) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

export const silentLog = createLogger('silent');

export function testConfig(env: Record<string, string> = {}): Config {
  return parseConfig({ DB_PATH: ':memory:', APP_TIMEZONE: 'Europe/Paris', WEB_DIST: '/nonexistent', ...env });
}

/** In-memory context on an instant mock vehicle, metered like in production. */
export function testContext({
  scenario = 'online',
  env = {},
  now = Date.now,
  wrap = (provider) => provider,
}: {
  scenario?: MockScenario;
  env?: Record<string, string>;
  now?: () => number;
  /** Wraps the metered mock, e.g. to spy on calls. */
  wrap?: (provider: VehicleProvider) => VehicleProvider;
} = {}): Context {
  return createContext(testConfig(env), {
    log: silentLog,
    now,
    provider: (usage) =>
      wrap(
        metered(new MockVehicleProvider({ scenario, latencyMs: 0, wakeDelayMs: 0, now: () => new Date(now()) }), usage),
      ),
  });
}
