import { MockVehicleProvider, type VehicleProvider } from '@gauss-hud/shared';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Pairing } from './auth/pairing.ts';
import { PinStore } from './auth/pin.ts';
import type { Now } from './clock.ts';
import type { Config } from './config.ts';
import { KeyValue, openDb, type Db } from './db.ts';
import { createNotify } from './notify.ts';
import { Journal } from './safety/journal.ts';
import { Usage } from './safety/usage.ts';
import { STATUS_KEY, VehicleService } from './vehicle/service.ts';
import { createTesla, type Tesla } from './vehicle/tesla/index.ts';
import { dryRun, metered } from './vehicle/wrappers.ts';

const STATUS_SOURCE_KEY = 'status.source';

export type RouteRegistrar = (app: FastifyInstance) => Promise<void> | void;

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
  /** Set when the vehicle API application is configured (TESLA_CLIENT_ID), even before a VIN is chosen. */
  readonly tesla: Tesla | null;
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
  /** Tests: stands in for the network in the vehicle API adapter. */
  readonly fetch?: typeof fetch;
}

export function createContext(config: Config, { log, now = Date.now, provider, fetch }: ContextOptions): Context {
  const db = openDb(config.dbPath);
  const kv = new KeyValue(db);
  const usage = new Usage(db, { timeZone: config.timeZone, monthlyCredit: config.monthlyCreditEur }, now);

  const tesla = config.tesla && createTesla(config, config.tesla, { kv, usage, log, now, fetch });
  if (tesla && !tesla.provider) log.warn('TESLA_VIN is not set: running on the mock (see `npm run tesla:vehicles`)');

  // The vehicle API adapter meters its own HTTP calls; the mock is metered per method.
  const source = provider ? 'test' : tesla?.provider ? 'tesla' : 'mock';
  let vehicle =
    provider?.(usage) ?? tesla?.provider ?? metered(new MockVehicleProvider({ scenario: config.mockScenario }), usage);
  if (config.dryRun) vehicle = dryRun(vehicle);
  log.info({ vehicle: source, dryRun: config.dryRun }, 'vehicle provider');
  // Never show a status cached from another vehicle source (e.g. the mock before going live).
  if (kv.get(STATUS_SOURCE_KEY, z.string()) !== source) {
    kv.delete(STATUS_KEY);
    kv.set(STATUS_SOURCE_KEY, source);
  }

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

  return {
    config,
    log,
    db,
    kv,
    usage,
    pairing: new Pairing(db, now),
    pin,
    service,
    tesla,
    routes: tesla ? [tesla.routes] : [],
    background: tesla ? [tesla.refreshTask] : [],
  };
}
