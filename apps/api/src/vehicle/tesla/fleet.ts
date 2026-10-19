import type { TeslaConfig } from '../../config.ts';
import type { Usage, UsageKind } from '../../safety/usage.ts';
import type { Fetch, TeslaAuth } from './auth.ts';

export class FleetApiError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`Fleet API ${path.split('?')[0] ?? path}: HTTP ${status}`);
    this.status = status;
  }
}

/** Fleet API envelope: `{ response: ... }`. */
export interface FleetResponse {
  readonly status: number;
  readonly body: unknown;
}

interface RequestOptions {
  readonly kind: UsageKind;
  readonly body?: unknown;
  /** Commands go through the signing proxy; everything else straight to the Fleet API. */
  readonly viaProxy?: boolean;
  /** A read may be retried once after a 401 and a token refresh; a command never is. */
  readonly retryAfterRefresh?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Thin HTTP client. Every response below 500 is billed by the vehicle API (a 408 from a sleeping
 * vehicle included), so each one is recorded. Tokens never reach the logs or error messages.
 */
export class FleetClient {
  readonly #config: TeslaConfig;
  readonly #auth: TeslaAuth;
  readonly #usage: Usage;
  readonly #fetch: Fetch;

  constructor(
    config: TeslaConfig,
    {
      auth,
      usage,
      fetch: fetchImpl = fetch,
    }: {
      auth: TeslaAuth;
      usage: Usage;
      fetch?: Fetch;
    },
  ) {
    this.#config = config;
    this.#auth = auth;
    this.#usage = usage;
    this.#fetch = fetchImpl;
  }

  get(path: string, kind: UsageKind = 'data'): Promise<FleetResponse> {
    return this.#request('GET', path, { kind, retryAfterRefresh: true });
  }

  post(path: string, options: RequestOptions): Promise<FleetResponse> {
    return this.#request('POST', path, options);
  }

  async #request(method: 'GET' | 'POST', path: string, options: RequestOptions): Promise<FleetResponse> {
    const base = options.viaProxy ? this.#config.commandProxyUrl : this.#config.fleetApiUrl;
    if (!base) throw new Error('TESLA_COMMAND_PROXY_URL is not set: commands need the signing proxy');
    const send = async (token: string) => {
      const response = await this.#fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (response.status < 500) this.#usage.record(options.kind);
      const body: unknown = await response.json().catch(() => null);
      return { status: response.status, body };
    };

    let result = await send(await this.#auth.accessToken());
    if (result.status === 401) {
      const token = await this.#auth.refresh();
      if (options.retryAfterRefresh) result = await send(token);
    }
    return result;
  }
}
