import type { CommandOutcome, CommandProgress, HudSnapshot, PairResult, VehicleCommand } from '@gauss-hud/shared';

export type { HudSnapshot, PairResult };

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
