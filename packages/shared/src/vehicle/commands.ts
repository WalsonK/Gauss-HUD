import { z } from 'zod';

/**
 * The complete command whitelist, with brand-neutral ids. Anything not listed here (unlocking,
 * remote start, location…) does not exist for this project. Provider adapters map each id to
 * their own API call.
 */
export const VEHICLE_COMMANDS = [
  'climate.on',
  'climate.off',
  'climate.setTemp',
  'charging.start',
  'charging.stop',
  'chargePort.open',
  'chargePort.close',
  'lock',
  'trunk.rear',
  'guard.on',
  'guard.off',
] as const;

export const VehicleCommandSchema = z.enum(VEHICLE_COMMANDS);
export type VehicleCommand = z.infer<typeof VehicleCommandSchema>;

export interface CommandInfo {
  /** Requires the PIN on top of the session. */
  readonly needsPin: boolean;
  /** The same call opens or closes: never retried automatically, state is re-read instead. */
  readonly toggle: boolean;
}

export const COMMAND_INFO: Readonly<Record<VehicleCommand, CommandInfo>> = {
  'climate.on': { needsPin: false, toggle: false },
  'climate.off': { needsPin: false, toggle: false },
  'climate.setTemp': { needsPin: false, toggle: false },
  'charging.start': { needsPin: false, toggle: false },
  'charging.stop': { needsPin: false, toggle: false },
  'chargePort.open': { needsPin: false, toggle: false },
  'chargePort.close': { needsPin: false, toggle: false },
  lock: { needsPin: false, toggle: false },
  'trunk.rear': { needsPin: true, toggle: true },
  'guard.on': { needsPin: false, toggle: false },
  'guard.off': { needsPin: false, toggle: false },
};

export interface ValueRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Commands that carry a value, with the values accepted. Every other command takes none. */
export const COMMAND_VALUES: Readonly<Partial<Record<VehicleCommand, ValueRange>>> = {
  /** Cabin target temperature, °C. */
  'climate.setTemp': { min: 16, max: 28, step: 0.5 },
};

/** Whether `value` fits `command`: none for a plain command, a step within range otherwise. */
export function isValidCommandValue(command: VehicleCommand, value: number | undefined): boolean {
  const range = COMMAND_VALUES[command];
  if (!range) return value === undefined;
  if (value === undefined || !Number.isFinite(value) || value < range.min || value > range.max) return false;
  const steps = (value - range.min) / range.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** Final result of a command request, as shown to the wearer. */
export const CommandOutcomeSchema = z.enum([
  'ok',
  'failed',
  /** The vehicle reported being in gear. */
  'moving',
  'offline',
  /** No answer in time (wake-up or command). Never retried: the next read tells what happened. */
  'timeout',
  /** This app's key is not installed on the vehicle. */
  'no_key',
  'wrong_pin',
  'pin_locked',
  /** Daily cap on commands or wake-ups reached. */
  'cap_reached',
]);
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;

/** Progress of a command, streamed to the HUD so it never has to poll. */
export type CommandProgress =
  | { readonly phase: 'sending' }
  | { readonly phase: 'waking' }
  | { readonly phase: 'done'; readonly outcome: CommandOutcome };
