import { COMMAND_INFO, type VehicleCommand, type VehicleStatus } from '@gauss-hud/shared';
import type { I18n } from '../i18n/index.ts';

export type QuickActionKey = 'trunk' | 'guard' | 'chargePort' | 'climate' | 'charging';

export interface QuickAction {
  /** Stable identity of the button, whichever command it currently sends. */
  readonly key: QuickActionKey;
  readonly command: VehicleCommand;
  /** What Enter does. */
  readonly label: string;
  /** The function is on (guard mode, port open, climate, charging). */
  readonly active: boolean;
  readonly needsPin: boolean;
}

/**
 * The quick-action buttons, left to right, each offering the command that fits the current state
 * (climate on → turn off). Buttons whose command the vehicle doesn't support are left out. The lock
 * state is displayed, not offered as a button.
 */
export function toQuickActions(
  capabilities: readonly VehicleCommand[],
  status: VehicleStatus | null,
  { t }: I18n,
): QuickAction[] {
  const candidates: [QuickActionKey, VehicleCommand, boolean][] = [
    ['trunk', 'trunk.rear', false],
    ['guard', status?.guardOn ? 'guard.off' : 'guard.on', status?.guardOn ?? false],
    ['chargePort', status?.chargePortOpen ? 'chargePort.close' : 'chargePort.open', status?.chargePortOpen ?? false],
    ['climate', status?.climateOn ? 'climate.off' : 'climate.on', status?.climateOn ?? false],
    ['charging', status?.charging ? 'charging.stop' : 'charging.start', Boolean(status?.charging)],
  ];
  return candidates
    .filter(([, command]) => capabilities.includes(command))
    .map(([key, command, active]) => ({
      key,
      command,
      label: t.commands[command],
      active,
      needsPin: COMMAND_INFO[command].needsPin,
    }));
}
