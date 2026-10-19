import type { VehicleProvider } from '@gauss-hud/shared';
import type { Usage } from '../safety/usage.ts';

/**
 * Counts one billable call per port method. Used for the mock, whose methods map to one call each;
 * real adapters meter their own HTTP calls instead (a wake-up is several calls).
 */
export function metered(provider: VehicleProvider, usage: Usage): VehicleProvider {
  return {
    capabilities: provider.capabilities,
    connection: () => (usage.record('data'), provider.connection()),
    readStatus: () => (usage.record('data'), provider.readStatus()),
    hasKey: () => (usage.record('data'), provider.hasKey()),
    wake: (timeoutMs) => (usage.record('wakes'), provider.wake(timeoutMs)),
    execute: (command, value) => (usage.record('commands'), provider.execute(command, value)),
  };
}

/** Dry-run: reads stay real, but nothing that acts on the vehicle (wake-up, command) is sent. */
export function dryRun(provider: VehicleProvider): VehicleProvider {
  return {
    capabilities: provider.capabilities,
    connection: () => provider.connection(),
    readStatus: () => provider.readStatus(),
    hasKey: () => provider.hasKey(),
    wake: () => Promise.resolve(true),
    execute: () => Promise.resolve('ok'),
  };
}

export class CapReachedError extends Error {
  constructor() {
    super('Daily wake-up cap reached');
  }
}

/** Refuses a wake-up once the daily cap is reached. */
export function wakeCapped(provider: VehicleProvider, allowed: () => boolean): VehicleProvider {
  return {
    capabilities: provider.capabilities,
    connection: () => provider.connection(),
    readStatus: () => provider.readStatus(),
    hasKey: () => provider.hasKey(),
    wake: (timeoutMs) => (allowed() ? provider.wake(timeoutMs) : Promise.reject(new CapReachedError())),
    execute: (command, value) => provider.execute(command, value),
  };
}
