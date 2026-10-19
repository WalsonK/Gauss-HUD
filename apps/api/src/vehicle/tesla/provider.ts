import {
  VEHICLE_COMMANDS,
  type ConnectionState,
  type ExecuteResult,
  type VehicleCommand,
  type VehicleProvider,
  type VehicleStatus,
} from '@gauss-hud/shared';
import { z } from 'zod';
import type { Now } from '../../clock.ts';
import type { KeyValue } from '../../db.ts';
import { FleetApiError, type FleetClient } from './fleet.ts';
import { toConnectionState, toExecuteResult, toFleetCommand, toVehicleStatus, VehicleDataSchema } from './mapping.ts';

/** No location: the `location_data` endpoint is never requested. */
const VEHICLE_DATA_ENDPOINTS = ['charge_state', 'climate_state', 'vehicle_state', 'drive_state'].join(';');
/** Delay between connection checks while waking up (each check is a billed data call). */
const WAKE_POLL_MS = 5_000;
/** A paired key rarely goes away: re-checked weekly. A missing one is re-checked every time. */
const KEY_CACHE_MS = 7 * 24 * 3600_000;
const KEY_CACHE = 'tesla.keyPaired';

const KeyCacheSchema = z.object({ paired: z.boolean(), checkedAt: z.number() });
const VehicleResponseSchema = z.object({ response: z.object({ state: z.string().nullish() }) });
const FleetStatusSchema = z.object({ response: z.object({ key_paired_vins: z.array(z.string()).nullish() }) });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The Fleet API behind the vehicle port. Each method follows the API's best practices on cost. */
export class TeslaFleetProvider implements VehicleProvider {
  readonly capabilities: readonly VehicleCommand[] = VEHICLE_COMMANDS;
  readonly #client: FleetClient;
  readonly #vin: string;
  readonly #kv: KeyValue;
  readonly #now: Now;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(
    client: FleetClient,
    vin: string,
    { kv, now = Date.now, wait = sleep }: { kv: KeyValue; now?: Now; wait?: (ms: number) => Promise<void> },
  ) {
    this.#client = client;
    // Validated as 17 alphanumeric characters by the configuration: safe in a path as is.
    this.#vin = vin;
    this.#kv = kv;
    this.#now = now;
    this.#sleep = wait;
  }

  /** `GET /vehicles/{vin}`: never wakes the vehicle. */
  async connection(): Promise<ConnectionState> {
    const { status, body } = await this.#client.get(`/api/1/vehicles/${this.#vin}`);
    if (status !== 200) throw new FleetApiError(status, '/api/1/vehicles/{vin}');
    return toConnectionState(VehicleResponseSchema.parse(body).response.state);
  }

  async readStatus(): Promise<VehicleStatus> {
    const path = `/api/1/vehicles/${this.#vin}/vehicle_data?endpoints=${encodeURIComponent(VEHICLE_DATA_ENDPOINTS)}`;
    const { status, body } = await this.#client.get(path);
    if (status !== 200) throw new FleetApiError(status, path);
    const data = z.object({ response: VehicleDataSchema }).parse(body).response;
    return toVehicleStatus(data, this.#now());
  }

  async wake(timeoutMs: number): Promise<boolean> {
    const deadline = this.#now() + timeoutMs;
    const { status } = await this.#client.post(`/api/1/vehicles/${this.#vin}/wake_up`, { kind: 'wakes' });
    if (status >= 400) return false;
    while (this.#now() + WAKE_POLL_MS <= deadline) {
      await this.#sleep(WAKE_POLL_MS);
      if ((await this.connection()) === 'online') return true;
    }
    return false;
  }

  async hasKey(): Promise<boolean> {
    const cached = this.#kv.get(KEY_CACHE, KeyCacheSchema);
    if (cached?.paired && this.#now() - cached.checkedAt < KEY_CACHE_MS) return true;
    const { status, body } = await this.#client.post('/api/1/vehicles/fleet_status', {
      kind: 'data',
      body: { vins: [this.#vin] },
      retryAfterRefresh: true,
    });
    if (status !== 200) throw new FleetApiError(status, '/api/1/vehicles/fleet_status');
    const paired = (FleetStatusSchema.parse(body).response.key_paired_vins ?? []).includes(this.#vin);
    this.#kv.set(KEY_CACHE, { paired, checkedAt: this.#now() });
    return paired;
  }

  /** Signed by the proxy, sent once. */
  async execute(command: VehicleCommand, value?: number): Promise<ExecuteResult> {
    const { name, body } = toFleetCommand(command, value);
    const { status, body: response } = await this.#client.post(`/api/1/vehicles/${this.#vin}/command/${name}`, {
      kind: 'commands',
      body,
      viaProxy: true,
      timeoutMs: 60_000,
    });
    return toExecuteResult(status, response);
  }
}
