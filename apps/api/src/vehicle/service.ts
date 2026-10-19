import {
  COMMAND_INFO,
  refreshStatus,
  runCommand,
  type CommandOutcome,
  type CommandProgress,
  type HudSnapshot,
  type VehicleCommand,
  type VehicleProvider,
  VehicleStatusSchema,
} from '@gauss-hud/shared';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { PinStore } from '../auth/pin.ts';
import type { Now } from '../clock.ts';
import type { KeyValue } from '../db.ts';
import type { Notify } from '../notify.ts';
import type { Journal } from '../safety/journal.ts';
import type { Usage } from '../safety/usage.ts';
import { CapReachedError, wakeCapped } from './wrappers.ts';

export const STATUS_KEY = 'status';
const CHECKED_AT_KEY = 'status.checkedAt';

export interface VehicleServiceOptions {
  /** Already metered, and wrapped for dry-run when enabled. */
  readonly provider: VehicleProvider;
  readonly kv: KeyValue;
  readonly usage: Usage;
  readonly journal: Journal;
  readonly pin: PinStore;
  readonly notify: Notify;
  readonly log: FastifyBaseLogger;
  readonly dryRun: boolean;
  readonly dailyMaxCommands: number;
  readonly dailyMaxWakes: number;
  readonly dataMinIntervalMs: number;
  readonly now?: Now;
}

export interface SendRequest {
  readonly pin?: string;
  readonly value?: number;
  readonly ip?: string;
  readonly onProgress?: (progress: CommandProgress) => void;
}

/**
 * Server side of the HUD: status cache, cost-aware reads, and the command flow around the shared
 * `runCommand` (PIN, daily caps, journal, notification).
 */
export class VehicleService {
  readonly #o: VehicleServiceOptions;
  readonly #provider: VehicleProvider;
  readonly #now: Now;
  #busy = false;

  constructor(options: VehicleServiceOptions) {
    this.#o = options;
    this.#now = options.now ?? Date.now;
    this.#provider = wakeCapped(options.provider, () => options.usage.today('wakes') < options.dailyMaxWakes);
  }

  /** Cached data only, no vehicle call. */
  snapshot(): HudSnapshot {
    return {
      status: this.#o.kv.get(STATUS_KEY, VehicleStatusSchema) ?? null,
      usage: this.#o.usage.summary(),
      capabilities: this.#o.provider.capabilities,
    };
  }

  /**
   * Checks the connection, then reads the vehicle if it is online. Skipped entirely when the last
   * check is more recent than `DATA_MIN_INTERVAL_SEC`, unless `force` (right after a command).
   */
  async refresh({ force = false }: { force?: boolean } = {}): Promise<HudSnapshot> {
    const now = this.#now();
    const checkedAt = this.#o.kv.get(CHECKED_AT_KEY, z.number()) ?? 0;
    if (force || now - checkedAt >= this.#o.dataMinIntervalMs) {
      // Stamped before the call: a failing or concurrent refresh doesn't trigger more calls.
      this.#o.kv.set(CHECKED_AT_KEY, now);
      try {
        const status = await refreshStatus(this.#provider, this.#o.kv.get(STATUS_KEY, VehicleStatusSchema) ?? null);
        if (status) this.#o.kv.set(STATUS_KEY, status);
      } catch (error) {
        this.#o.log.warn({ err: error }, 'vehicle refresh failed');
      }
    }
    return this.snapshot();
  }

  async send(command: VehicleCommand, { pin, value, ip, onProgress }: SendRequest = {}): Promise<CommandOutcome> {
    const finish = (outcome: CommandOutcome) => {
      const { dryRun } = this.#o;
      this.#o.journal.add({ command, value, outcome, dryRun, ip });
      this.#o.notify(`Gauss HUD: ${command}`, `${outcome}${dryRun ? ' (dry run)' : ''}`);
      onProgress?.({ phase: 'done', outcome });
      return outcome;
    };

    if (this.#busy) return finish('failed');
    this.#busy = true;
    try {
      if (COMMAND_INFO[command].needsPin) {
        const check = await this.#o.pin.check(pin);
        if (check === 'not_set') this.#o.log.warn('PIN not set: run `pin:set` on the server');
        if (check !== 'ok') return finish(check === 'not_set' ? 'failed' : check);
      }
      if (this.#o.journal.sentToday() >= this.#o.dailyMaxCommands) return finish('cap_reached');

      let outcome: CommandOutcome;
      try {
        outcome = await runCommand(this.#provider, command, {
          value,
          onProgress: (progress) => {
            if (progress.phase !== 'done') onProgress?.(progress);
          },
        });
      } catch (error) {
        if (!(error instanceof CapReachedError)) this.#o.log.error({ err: error, command }, 'command failed');
        outcome = error instanceof CapReachedError ? 'cap_reached' : 'failed';
      }
      // The vehicle is awake now: show the effect (or, after a timeout, what actually happened).
      if (outcome === 'ok' || outcome === 'timeout') await this.refresh({ force: true });
      return finish(outcome);
    } finally {
      this.#busy = false;
    }
  }
}
