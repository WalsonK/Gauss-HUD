import type { ConnectionState, ExecuteResult, VehicleCommand, VehicleStatus } from '@gauss-hud/shared';
import { z } from 'zod';

const KM_PER_MILE = 1.609344;

/**
 * The fields read from `vehicle_data`, fetched with only the `charge_state`, `climate_state`,
 * `vehicle_state` and `drive_state` endpoints (no `location_data`, so no location is ever read).
 * Everything optional is tolerated as missing: firmware versions differ.
 */
export const VehicleDataSchema = z.object({
  display_name: z.string().nullish(),
  charge_state: z.object({
    battery_level: z.number(),
    /** Miles. */
    battery_range: z.number(),
    charging_state: z.string().nullish(),
    charger_power: z.number().nullish(),
    minutes_to_full_charge: z.number().nullish(),
    charge_port_door_open: z.boolean().nullish(),
  }),
  climate_state: z
    .object({
      /** °C, as every temperature of the API. */
      inside_temp: z.number().nullish(),
      driver_temp_setting: z.number().nullish(),
      is_climate_on: z.boolean().nullish(),
    })
    .nullish(),
  vehicle_state: z
    .object({
      locked: z.boolean().nullish(),
      sentry_mode: z.boolean().nullish(),
      vehicle_name: z.string().nullish(),
    })
    .nullish(),
  drive_state: z.object({ shift_state: z.string().nullish() }).nullish(),
});
export type VehicleData = z.infer<typeof VehicleDataSchema>;

/** Fleet API payload → brand-neutral status. */
export function toVehicleStatus(data: VehicleData, now: number): VehicleStatus {
  const charge = data.charge_state;
  const charging = charge.charging_state === 'Charging';
  const minutesLeft = charge.minutes_to_full_charge ?? 0;
  return {
    name: data.vehicle_state?.vehicle_name ?? data.display_name ?? null,
    connection: 'online',
    updatedAt: new Date(now).toISOString(),
    batteryPercent: Math.min(100, Math.max(0, charge.battery_level)),
    rangeKm: Math.max(0, Math.round(charge.battery_range * KM_PER_MILE)),
    pluggedIn: !!charge.charging_state && charge.charging_state !== 'Disconnected',
    charging: charging
      ? {
          powerKw: Math.max(0, charge.charger_power ?? 0),
          endsAt: minutesLeft > 0 ? new Date(now + minutesLeft * 60_000).toISOString() : null,
        }
      : null,
    chargePortOpen: charge.charge_port_door_open ?? false,
    locked: data.vehicle_state?.locked ?? false,
    cabinTempC: data.climate_state?.inside_temp ?? null,
    targetTempC: data.climate_state?.driver_temp_setting ?? null,
    climateOn: data.climate_state?.is_climate_on ?? false,
    guardOn: data.vehicle_state?.sentry_mode ?? false,
    // Drive, reverse and neutral all count as moving; park (or no gear reported) does not.
    moving: ['D', 'R', 'N'].includes(data.drive_state?.shift_state ?? ''),
  };
}

/** `GET /api/1/vehicles/{vin}` → `state`. Anything unexpected counts as offline: never read nor woken blindly. */
export function toConnectionState(state: unknown): ConnectionState {
  if (state === 'online') return 'online';
  if (state === 'asleep' || state === 'waking') return 'asleep';
  return 'offline';
}

/** The whitelist, mapped to Fleet API commands. Anything else simply has no mapping. */
export function toFleetCommand(command: VehicleCommand, value?: number): { name: string; body: object } {
  switch (command) {
    case 'climate.on':
      return { name: 'auto_conditioning_start', body: {} };
    case 'climate.off':
      return { name: 'auto_conditioning_stop', body: {} };
    case 'climate.setTemp':
      return { name: 'set_temps', body: { driver_temp: value, passenger_temp: value } };
    case 'charging.start':
      return { name: 'charge_start', body: {} };
    case 'charging.stop':
      return { name: 'charge_stop', body: {} };
    case 'chargePort.open':
      return { name: 'charge_port_door_open', body: {} };
    case 'chargePort.close':
      return { name: 'charge_port_door_close', body: {} };
    case 'lock':
      return { name: 'door_lock', body: {} };
    case 'trunk.rear':
      return { name: 'actuate_trunk', body: { which_trunk: 'rear' } };
    case 'guard.on':
      return { name: 'set_sentry_mode', body: { on: true } };
    case 'guard.off':
      return { name: 'set_sentry_mode', body: { on: false } };
  }
}

const CommandResponseSchema = z.object({
  response: z.object({ result: z.boolean(), reason: z.string().nullish() }).nullish(),
});

/** Refusals that mean the requested state is already there. */
const ALREADY_DONE = new Set(['already_set', 'is_charging', 'not_charging', 'already closed']);

/** Command HTTP result → port result. A 408 means the vehicle didn't answer: never retried. */
export function toExecuteResult(status: number, body: unknown): ExecuteResult {
  if (status === 408) return 'timeout';
  const response = CommandResponseSchema.safeParse(body).data?.response;
  if (status !== 200 || !response) return 'failed';
  if (response.result) return 'ok';
  return ALREADY_DONE.has(response.reason ?? '') ? 'ok' : 'failed';
}
