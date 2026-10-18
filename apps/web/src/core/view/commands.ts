import { COMMAND_INFO, type VehicleCommand, type VehicleStatus } from '@gauss-hud/shared';
import type { I18n } from '../i18n/index.ts';

export type QuickActionKey = 'climate' | 'trunk' | 'guard' | 'charge';

export interface QuickAction {
  /** Stable identity of the button, whichever command it currently sends. */
  readonly key: QuickActionKey;
  readonly command: VehicleCommand;
  /** What Enter does. */
  readonly label: string;
  /** The function is on (climate, guard mode, charge port open or charging). */
  readonly active: boolean;
  readonly needsPin: boolean;
}

/**
 * The charge button follows the cable: unplugged it opens or closes the port, plugged in it starts
 * or stops charging.
 */
function chargeCommand(status: VehicleStatus | null): [VehicleCommand, boolean] {
  if (status?.pluggedIn) return status.charging ? ['charging.stop', true] : ['charging.start', false];
  return status?.chargePortOpen ? ['chargePort.close', true] : ['chargePort.open', false];
}

/**
 * The quick-action buttons, left to right by how often they are used (climate first), each offering
 * the command that fits the current state (climate on → turn off). Buttons whose command the vehicle
 * doesn't support are left out. The lock state is displayed, not offered as a button.
 */
export function toQuickActions(
  capabilities: readonly VehicleCommand[],
  status: VehicleStatus | null,
  { t }: I18n,
): QuickAction[] {
  const candidates: [QuickActionKey, VehicleCommand, boolean][] = [
    ['climate', status?.climateOn ? 'climate.off' : 'climate.on', status?.climateOn ?? false],
    ['trunk', 'trunk.rear', false],
    ['guard', status?.guardOn ? 'guard.off' : 'guard.on', status?.guardOn ?? false],
    ['charge', ...chargeCommand(status)],
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
