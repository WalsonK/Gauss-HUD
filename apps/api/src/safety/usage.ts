import type { UsageSummary } from '@gauss-hud/shared';
import { localDay, type Now } from '../clock.ts';
import type { Db } from '../db.ts';

export type UsageKind = 'data' | 'commands' | 'wakes';

/** Vehicle API price list (euro zone): how many calls one euro buys. */
export const CALLS_PER_EUR: Readonly<Record<UsageKind, number>> = { data: 500, commands: 1000, wakes: 50 };

/** Counts billable vehicle API calls per local day; the source of the cost estimate and the wake cap. */
export class Usage {
  readonly #db: Db;
  readonly #timeZone: string;
  readonly #monthlyCredit: number;
  readonly #now: Now;

  constructor(db: Db, { timeZone, monthlyCredit }: { timeZone: string; monthlyCredit: number }, now: Now = Date.now) {
    this.#db = db;
    this.#timeZone = timeZone;
    this.#monthlyCredit = monthlyCredit;
    this.#now = now;
  }

  record(kind: UsageKind, count = 1): void {
    this.#db
      .prepare(
        `INSERT INTO usage (day, kind, count) VALUES (?, ?, ?)
         ON CONFLICT (day, kind) DO UPDATE SET count = count + excluded.count`,
      )
      .run(this.#today(), kind, count);
  }

  today(kind: UsageKind): number {
    const row = this.#db.prepare('SELECT count FROM usage WHERE day = ? AND kind = ?').get(this.#today(), kind) as
      { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** This month's estimated spend, before the monthly credit. */
  summary(): UsageSummary {
    const month = this.#today().slice(0, 7);
    const rows = this.#db
      .prepare('SELECT kind, SUM(count) AS count FROM usage WHERE day LIKE ? GROUP BY kind')
      .all(`${month}-%`) as { kind: UsageKind; count: number }[];
    const cost = rows.reduce((sum, { kind, count }) => sum + count / CALLS_PER_EUR[kind], 0);
    return { monthCost: Math.round(cost * 100) / 100, monthlyCredit: this.#monthlyCredit, currency: 'EUR' };
  }

  #today(): string {
    return localDay(this.#now(), this.#timeZone);
  }
}
