import { z } from 'zod';

/** Reachability of the vehicle. Only `online` allows a read without waking it up. */
export const ConnectionStateSchema = z.enum(['online', 'asleep', 'offline']);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const ChargingStatusSchema = z.object({
  powerKw: z.number().nonnegative(),
  /** Estimated end of the session, when the vehicle reports one. */
  endsAt: z.iso.datetime().nullable(),
});
export type ChargingStatus = z.infer<typeof ChargingStatusSchema>;

/**
 * Brand-neutral snapshot of a vehicle. Provider adapters translate their own payloads into this
 * shape; nothing above the adapter layer knows which vehicle API produced it.
 */
export const VehicleStatusSchema = z.object({
  /** The name the owner gave the vehicle, when the vehicle API reports one. */
  name: z.string().nullable(),
  connection: ConnectionStateSchema,
  /** When the vehicle data was last read (not when the connection state was checked). */
  updatedAt: z.iso.datetime(),
  batteryPercent: z.number().min(0).max(100),
  rangeKm: z.number().nonnegative(),
  pluggedIn: z.boolean(),
  /** Null when not charging. */
  charging: ChargingStatusSchema.nullable(),
  chargePortOpen: z.boolean(),
  locked: z.boolean(),
  cabinTempC: z.number().nullable(),
  /** Climate target temperature, °C. */
  targetTempC: z.number().nullable(),
  climateOn: z.boolean(),
  /** Guard mode: the parked vehicle watches and records its surroundings. */
  guardOn: z.boolean(),
  /** True when the vehicle is in gear (drive, reverse or neutral); commands are refused. */
  moving: z.boolean(),
});
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;
