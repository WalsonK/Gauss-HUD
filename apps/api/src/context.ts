import { MockVehicleProvider, type VehicleProvider } from '@gauss-hud/shared';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { Pairing } from './auth/pairing.ts';
import { PinStore } from './auth/pin.ts';
import type { Now } from './clock.ts';
import type { Config } from './config.ts';
import { KeyValue, openDb, type Db } from './db.ts';
import { createNotify } from './notify.ts';
import { Journal } from './safety/journal.ts';
import { Usage } from './safety/usage.ts';
import { VehicleService } from './vehicle/service.ts';
import { dryRun, metered } from './vehicle/wrappers.ts';

export type RouteRegistrar = (app: FastifyInstance) => Promise<void>;

/** Everything the server and the CLI share, wired from the configuration. */
export interface Context {
  readonly config: Config;
  readonly log: FastifyBaseLogger;
  readonly db: Db;
  readonly kv: KeyValue;
  readonly usage: Usage;
  readonly pairing: Pairing;
  readonly pin: PinStore;
  readonly service: VehicleService;
  /** Extra routes from the vehicle adapter (OAuth callback, public key). */
  readonly routes: readonly RouteRegistrar[];
  /** Started with the server, stopped on close. */
  readonly background: readonly { start(): void; stop(): void }[];
}

export interface ContextOptions {
  readonly log: FastifyBaseLogger;
  readonly now?: Now;
  /** Tests: builds the vehicle in place of the configured one (metering is up to the factory). */
  readonly provider?: (usage: Usage) => VehicleProvider;
}

export function createContext(config: Config, { log, now = Date.now, provider }: ContextOptions): Context {
  const db = openDb(config.dbPath);
  const kv = new KeyValue(db);
  const usage = new Usage(db, { timeZone: config.timeZone, monthlyCredit: config.monthlyCreditEur }, now);

  let vehicle = provider?.(usage) ?? metered(new MockVehicleProvider({ scenario: config.mockScenario }), usage);
  if (config.dryRun) vehicle = dryRun(vehicle);
  log.info({ vehicle: 'mock', scenario: config.mockScenario, dryRun: config.dryRun }, 'vehicle provider');

  const pin = new PinStore(kv, now);
  const service = new VehicleService({
    provider: vehicle,
    kv,
    usage,
    journal: new Journal(db, config.timeZone, now),
    pin,
    notify: createNotify(config.ntfy, log),
    log,
    dryRun: config.dryRun,
    dailyMaxCommands: config.dailyMaxCommands,
    dailyMaxWakes: config.dailyMaxWakes,
    dataMinIntervalMs: config.dataMinIntervalMs,
    now,
  });

  return { config, log, db, kv, usage, pairing: new Pairing(db, now), pin, service, routes: [], background: [] };
}
