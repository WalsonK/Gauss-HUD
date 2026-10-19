import type { UsageSummary } from './usage.ts';
import type { VehicleCommand } from './vehicle/commands.ts';
import type { VehicleStatus } from './vehicle/status.ts';

/** Everything a HUD screen displays (`GET /api/snapshot`, `POST /api/refresh`). */
export interface HudSnapshot {
  readonly status: VehicleStatus | null;
  readonly usage: UsageSummary | null;
  readonly capabilities: readonly VehicleCommand[];
}

export type PairResult = 'ok' | 'invalid' | 'too_many';

/**
 * Required on every POST: a cross-site form cannot set a custom header, and a cross-site fetch
 * that does needs a CORS preflight the API never grants.
 */
export const CSRF_HEADER = 'x-gauss-hud';
