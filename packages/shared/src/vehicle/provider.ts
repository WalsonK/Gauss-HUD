import type { VehicleCommand } from './commands.ts';
import type { ConnectionState, VehicleStatus } from './status.ts';

export type ExecuteResult = 'ok' | 'failed' | 'timeout';

/**
 * Port implemented by each vehicle integration (mock today, a vehicle API adapter later).
 * Every method maps to at most one billable call; orchestration and safety rules live in the
 * use cases (`runCommand`, `refreshStatus`), not in adapters.
 */
export interface VehicleProvider {
  /** Commands this vehicle supports; the HUD hides the others. */
  readonly capabilities: readonly VehicleCommand[];
  /** Cheap reachability check that never wakes the vehicle. */
  connection(): Promise<ConnectionState>;
  /** Full read. Callers only use it when the vehicle is already online. */
  readStatus(): Promise<VehicleStatus>;
  /** Wakes the vehicle; resolves true once online, false if `timeoutMs` elapsed first. */
  wake(timeoutMs: number): Promise<boolean>;
  /** Whether this app's key is installed on the vehicle (needed for signed commands). */
  hasKey(): Promise<boolean>;
  /** Sends one command, once. */
  execute(command: VehicleCommand): Promise<ExecuteResult>;
}
