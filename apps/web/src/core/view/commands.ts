import { COMMAND_INFO, type VehicleCommand, type VehicleStatus } from '@gauss-hud/shared';
import type { I18n } from '../i18n/index.ts';

export type CommandRowKey = 'climate' | 'charging' | 'chargePort' | 'lock' | 'trunk';

export interface CommandRow {
  /** Stable identity of the row, whichever command it currently offers. */
  readonly key: CommandRowKey;
  readonly command: VehicleCommand;
  readonly label: string;
  readonly needsPin: boolean;
}

/**
 * One row per action, offering the command that makes sense for the current state (climate on →
 * "turn off"). Rows whose command the vehicle doesn't support are left out.
 */
export function toCommandRows(
  capabilities: readonly VehicleCommand[],
  status: VehicleStatus | null,
  { t }: I18n,
): CommandRow[] {
  const candidates: [CommandRowKey, VehicleCommand][] = [
    ['climate', status?.climateOn ? 'climate.off' : 'climate.on'],
    ['charging', status?.charging ? 'charging.stop' : 'charging.start'],
    ['chargePort', status?.chargePortOpen ? 'chargePort.close' : 'chargePort.open'],
    ['lock', 'lock'],
    ['trunk', 'trunk.rear'],
  ];
  return candidates
    .filter(([, command]) => capabilities.includes(command))
    .map(([key, command]) => ({ key, command, label: t.commands[command], needsPin: COMMAND_INFO[command].needsPin }));
}
