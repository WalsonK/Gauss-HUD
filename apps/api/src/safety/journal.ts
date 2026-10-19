import type { CommandOutcome, VehicleCommand } from '@gauss-hud/shared';
import { localDay, type Now } from '../clock.ts';
import type { Db } from '../db.ts';

export interface JournalEntry {
  readonly command: VehicleCommand;
  readonly value: number | undefined;
  readonly outcome: CommandOutcome;
  readonly dryRun: boolean;
  readonly ip: string | undefined;
}

/** Every command request, refused ones included. Also the source of the daily command cap. */
export class Journal {
  readonly #db: Db;
  readonly #timeZone: string;
  readonly #now: Now;

  constructor(db: Db, timeZone: string, now: Now = Date.now) {
    this.#db = db;
    this.#timeZone = timeZone;
    this.#now = now;
  }

  add({ command, value, outcome, dryRun, ip }: JournalEntry): void {
    const at = this.#now();
    this.#db
      .prepare('INSERT INTO journal (at, day, command, value, outcome, dry_run, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(at, localDay(at, this.#timeZone), command, value ?? null, outcome, dryRun ? 1 : 0, ip ?? null);
  }

  /** Commands sent to the vehicle today (refusals before sending don't count against the cap). */
  sentToday(): number {
    const row = this.#db
      .prepare(
        `SELECT COUNT(*) AS count FROM journal
         WHERE day = ? AND outcome NOT IN ('wrong_pin', 'pin_locked', 'cap_reached')`,
      )
      .get(localDay(this.#now(), this.#timeZone)) as { count: number };
    return row.count;
  }
}
