import type { CommandOutcome, CommandProgress, UsageSummary, VehicleCommand, VehicleStatus } from '@gauss-hud/shared';

/** Everything a HUD screen displays. */
export interface HudSnapshot {
  readonly status: VehicleStatus | null;
  readonly usage: UsageSummary | null;
  readonly capabilities: readonly VehicleCommand[];
}

export type PairResult = 'ok' | 'invalid' | 'too_many';

export interface SendOptions {
  readonly pin?: string;
  /** For commands that carry one (`COMMAND_VALUES`), e.g. the target temperature. */
  readonly value?: number;
  readonly onProgress?: (progress: CommandProgress) => void;
}

/**
 * What the HUD needs from the backend. The mock implements it in the browser today; an HTTP
 * client against the API will replace it without touching the screens.
 */
export interface HudClient {
  isPaired(): Promise<boolean>;
  pair(code: string): Promise<PairResult>;
  /** Last known data, without contacting the vehicle. */
  snapshot(): Promise<HudSnapshot>;
  /** One read of the vehicle, only if it is awake. Called when the HUD opens or on request. */
  refresh(): Promise<HudSnapshot>;
  send(command: VehicleCommand, options?: SendOptions): Promise<CommandOutcome>;
}
