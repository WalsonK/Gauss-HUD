import type { CommandOutcome, CommandProgress, VehicleCommand } from './commands.ts';
import type { VehicleProvider } from './provider.ts';
import type { VehicleStatus } from './status.ts';

/** A wake-up takes 10 to 60 s. */
export const WAKE_TIMEOUT_MS = 60_000;

/**
 * Reads the vehicle only if it is already online. A sleeping or offline vehicle is never woken
 * to display data: the last known status is returned with the fresh connection state.
 */
export async function refreshStatus(
  provider: VehicleProvider,
  last: VehicleStatus | null,
): Promise<VehicleStatus | null> {
  const connection = await provider.connection();
  if (connection === 'online') return provider.readStatus();
  return last && { ...last, connection };
}

export interface RunCommandOptions {
  onProgress?: (progress: CommandProgress) => void;
  wakeTimeoutMs?: number;
}

/**
 * Safety-critical command flow, identical for every vehicle:
 * key check → connection → (online: fresh read, refuse if moving | asleep: wake) → send once.
 * Never retries: after a timeout the next status read tells what actually happened.
 */
export async function runCommand(
  provider: VehicleProvider,
  command: VehicleCommand,
  { onProgress, wakeTimeoutMs = WAKE_TIMEOUT_MS }: RunCommandOptions = {},
): Promise<CommandOutcome> {
  const finish = (outcome: CommandOutcome) => {
    onProgress?.({ phase: 'done', outcome });
    return outcome;
  };

  onProgress?.({ phase: 'sending' });
  if (!provider.capabilities.includes(command)) return finish('failed');
  if (!(await provider.hasKey())) return finish('no_key');

  const connection = await provider.connection();
  if (connection === 'offline') return finish('offline');
  if (connection === 'online') {
    // An online vehicle may be driving; an asleep one is parked, so only the online case is read.
    if ((await provider.readStatus()).moving) return finish('moving');
  } else {
    onProgress?.({ phase: 'waking' });
    if (!(await provider.wake(wakeTimeoutMs))) return finish('timeout');
  }

  return finish(await provider.execute(command));
}
