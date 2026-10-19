import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Now } from '../clock.ts';
import type { KeyValue } from '../db.ts';

export const PIN_DIGITS = 6;
export const PIN_MAX_FAILURES = 3;
export const PIN_LOCK_MS = 15 * 60_000;

const argon2Async = promisify(argon2);

interface Argon2Params {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly tagLength: number;
}

/** OWASP's argon2id baseline (19 MiB, 2 passes, 1 lane). */
const PARAMS: Argon2Params = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

const StoredPinSchema = z.object({
  /** `argon2id$memory$passes$parallelism$nonce$tag`, base64url. */
  hash: z.string(),
  failures: z.number(),
  lockedUntil: z.number(),
});
type StoredPin = z.infer<typeof StoredPinSchema>;

const KEY = 'pin';

async function derive(pin: string, nonce: Buffer, params: Argon2Params = PARAMS): Promise<Buffer> {
  return argon2Async('argon2id', { message: pin, nonce, ...params });
}

export type PinCheck = 'ok' | 'wrong_pin' | 'pin_locked' | 'not_set';

/** PIN for sensitive commands: argon2id hash, locked 15 minutes after 3 failures in a row. */
export class PinStore {
  readonly #kv: KeyValue;
  readonly #now: Now;

  constructor(kv: KeyValue, now: Now = Date.now) {
    this.#kv = kv;
    this.#now = now;
  }

  isSet(): boolean {
    return this.#kv.get(KEY, StoredPinSchema) !== undefined;
  }

  async set(pin: string): Promise<void> {
    if (!new RegExp(`^\\d{${PIN_DIGITS}}$`).test(pin)) throw new Error(`The PIN must be ${PIN_DIGITS} digits`);
    const nonce = randomBytes(16);
    const tag = await derive(pin, nonce);
    const { memory, passes, parallelism } = PARAMS;
    const hash = ['argon2id', memory, passes, parallelism, nonce.toString('base64url'), tag.toString('base64url')];
    this.#kv.set(KEY, { hash: hash.join('$'), failures: 0, lockedUntil: 0 } satisfies StoredPin);
  }

  async check(pin: string | undefined): Promise<PinCheck> {
    const stored = this.#kv.get(KEY, StoredPinSchema);
    if (!stored) return 'not_set';
    if (this.#now() < stored.lockedUntil) return 'pin_locked';
    if (pin !== undefined && (await matches(pin, stored.hash))) {
      if (stored.failures > 0) this.#kv.set(KEY, { ...stored, failures: 0 });
      return 'ok';
    }
    const failures = stored.failures + 1;
    if (failures >= PIN_MAX_FAILURES) {
      this.#kv.set(KEY, { ...stored, failures: 0, lockedUntil: this.#now() + PIN_LOCK_MS });
      return 'pin_locked';
    }
    this.#kv.set(KEY, { ...stored, failures });
    return 'wrong_pin';
  }
}

async function matches(pin: string, encoded: string): Promise<boolean> {
  const [algorithm, memory, passes, parallelism, nonce, tag] = encoded.split('$');
  if (algorithm !== 'argon2id' || !nonce || !tag) return false;
  const expected = Buffer.from(tag, 'base64url');
  const actual = await derive(pin, Buffer.from(nonce, 'base64url'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    tagLength: expected.length,
  });
  return timingSafeEqual(actual, expected);
}
