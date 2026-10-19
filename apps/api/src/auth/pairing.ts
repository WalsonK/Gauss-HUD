import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Now } from '../clock.ts';
import type { Db } from '../db.ts';

export const PAIRING_CODE_TTL_MS = 10 * 60_000;
export const PAIRING_CODE_DIGITS = 6;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Glasses pairing: a single-use 6-digit code printed on the server becomes a long-lived session
 * token, sent only as an HttpOnly cookie. Codes and tokens are stored hashed.
 */
export class Pairing {
  readonly #db: Db;
  readonly #now: Now;

  constructor(db: Db, now: Now = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  /** New code, valid 10 minutes. Earlier unused codes stay valid until they expire. */
  createCode(): string {
    const code = String(randomInt(10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, '0');
    this.#db.prepare('DELETE FROM pairing_codes WHERE expires_at <= ?').run(this.#now());
    this.#db
      .prepare('INSERT OR REPLACE INTO pairing_codes (hash, expires_at) VALUES (?, ?)')
      .run(sha256(code), this.#now() + PAIRING_CODE_TTL_MS);
    return code;
  }

  /** Consumes a valid code and returns a new session token, or null. */
  redeem(code: string): string | null {
    if (!new RegExp(`^\\d{${PAIRING_CODE_DIGITS}}$`).test(code)) return null;
    const now = this.#now();
    const used = this.#db
      .prepare('UPDATE pairing_codes SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?')
      .run(now, sha256(code), now);
    if (used.changes === 0) return null;
    const token = randomBytes(32).toString('base64url');
    this.#db
      .prepare('INSERT INTO sessions (hash, created_at, last_seen_at) VALUES (?, ?, ?)')
      .run(sha256(token), now, now);
    return token;
  }

  /** Whether the token belongs to a live session; records the visit. */
  verify(token: string | undefined): boolean {
    if (!token) return false;
    const result = this.#db
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE hash = ? AND revoked_at IS NULL')
      .run(this.#now(), sha256(token));
    return result.changes > 0;
  }

  /** Revokes every session; returns how many were live. */
  revokeAll(): number {
    return Number(
      this.#db.prepare('UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(this.#now()).changes,
    );
  }
}
