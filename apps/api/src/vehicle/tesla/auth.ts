import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Now } from '../../clock.ts';
import type { TeslaConfig } from '../../config.ts';
import type { KeyValue } from '../../db.ts';

export const AUTHORIZE_URL = 'https://auth.tesla.com/oauth2/v3/authorize';
/** Every `/token` call must use this domain, whatever the region. */
export const TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
/** Least privilege: no location, no user data. `vehicle_cmds` still allows unlocking: hence "PIN to Drive". */
export const SCOPES = 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds';
export const CALLBACK_PATH = '/api/auth/tesla/callback';

/** The refresh token lives 3 months: refresh well before, even without any use. */
export const PERIODIC_REFRESH_MS = 25 * 24 * 3600_000;
const STATE_TTL_MS = 10 * 60_000;
/** Refresh this long before the access token expires. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

const TOKENS_KEY = 'tesla.tokens';
const STATE_KEY = 'tesla.oauthState';

const StoredTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  refreshedAt: z.number(),
});
type StoredTokens = z.infer<typeof StoredTokensSchema>;

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

const StateSchema = z.object({ value: z.string(), expiresAt: z.number() });

export type Fetch = typeof fetch;

export class TeslaAuthError extends Error {}

/** Redirect URI registered with the application: `PUBLIC_ORIGIN` + the callback route. */
export function redirectUri(publicOrigin: string | undefined): string {
  if (!publicOrigin) throw new TeslaAuthError('PUBLIC_ORIGIN must be set (e.g. https://car.example.com)');
  return `${publicOrigin}${CALLBACK_PATH}`;
}

/**
 * OAuth for the owner's account. Tokens live in the database, not in `.env`: every refresh returns
 * a new single-use refresh token, which is saved before anything else.
 */
export class TeslaAuth {
  readonly #config: TeslaConfig;
  readonly #publicOrigin: string | undefined;
  readonly #kv: KeyValue;
  readonly #fetch: Fetch;
  readonly #now: Now;
  #refreshing: Promise<string> | null = null;

  constructor(
    config: TeslaConfig,
    {
      publicOrigin,
      kv,
      fetch: fetchImpl = fetch,
      now = Date.now,
    }: {
      publicOrigin: string | undefined;
      kv: KeyValue;
      fetch?: Fetch;
      now?: Now;
    },
  ) {
    this.#config = config;
    this.#publicOrigin = publicOrigin;
    this.#kv = kv;
    this.#fetch = fetchImpl;
    this.#now = now;
  }

  hasTokens(): boolean {
    return this.#tokens() !== undefined;
  }

  /** Link to open on a phone or computer (sign-in is blocked inside the glasses' web view). */
  authorizeUrl(): string {
    const state = randomBytes(24).toString('base64url');
    this.#kv.set(STATE_KEY, { value: state, expiresAt: this.#now() + STATE_TTL_MS });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.#config.clientId,
      redirect_uri: redirectUri(this.#publicOrigin),
      scope: SCOPES,
      state,
      prompt_missing_scopes: 'true',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** OAuth callback: checks the single-use state, then exchanges the code for tokens. */
  async handleCallback(code: string, state: string): Promise<void> {
    const expected = this.#kv.get(STATE_KEY, StateSchema);
    this.#kv.delete(STATE_KEY);
    const valid =
      expected !== undefined &&
      expected.expiresAt > this.#now() &&
      expected.value.length === state.length &&
      timingSafeEqual(Buffer.from(expected.value), Buffer.from(state));
    if (!valid) throw new TeslaAuthError('Unknown or expired sign-in link: run `tesla:login` again');
    await this.#requestTokens({
      grant_type: 'authorization_code',
      client_id: this.#config.clientId,
      client_secret: this.#config.clientSecret,
      code,
      audience: this.#config.fleetApiUrl,
      redirect_uri: redirectUri(this.#publicOrigin),
    });
  }

  /** A valid access token, refreshed first when it is about to expire. */
  async accessToken(): Promise<string> {
    const tokens = this.#tokens();
    if (!tokens) throw new TeslaAuthError('Not signed in to the vehicle API: run `tesla:login`');
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > this.#now()) return tokens.accessToken;
    return this.refresh();
  }

  /** Refreshes now. Concurrent callers share one request, so a refresh token is never used twice. */
  refresh(): Promise<string> {
    this.#refreshing ??= (async () => {
      try {
        const tokens = this.#tokens();
        if (!tokens) throw new TeslaAuthError('Not signed in to the vehicle API: run `tesla:login`');
        return await this.#requestTokens({
          grant_type: 'refresh_token',
          client_id: this.#config.clientId,
          refresh_token: tokens.refreshToken,
        });
      } finally {
        this.#refreshing = null;
      }
    })();
    return this.#refreshing;
  }

  /** The only background call: keeps the 3-month refresh token alive. Returns whether it refreshed. */
  async refreshIfStale(): Promise<boolean> {
    const tokens = this.#tokens();
    if (!tokens || this.#now() - tokens.refreshedAt < PERIODIC_REFRESH_MS) return false;
    await this.refresh();
    return true;
  }

  /** Partner token for the one-time registration of this domain (client credentials). */
  async partnerToken(): Promise<string> {
    const response = await this.#post({
      grant_type: 'client_credentials',
      client_id: this.#config.clientId,
      client_secret: this.#config.clientSecret,
      scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
      audience: this.#config.fleetApiUrl,
    });
    return response.access_token;
  }

  #tokens(): StoredTokens | undefined {
    return this.#kv.get(TOKENS_KEY, StoredTokensSchema);
  }

  async #requestTokens(form: Record<string, string>): Promise<string> {
    const response = await this.#post(form);
    const previous = this.#tokens();
    const refreshToken = response.refresh_token ?? previous?.refreshToken;
    if (!refreshToken) throw new TeslaAuthError('No refresh token returned: is offline_access granted?');
    const now = this.#now();
    this.#kv.set(TOKENS_KEY, {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: now + response.expires_in * 1000,
      refreshedAt: now,
    } satisfies StoredTokens);
    return response.access_token;
  }

  async #post(form: Record<string, string>): Promise<z.infer<typeof TokenResponseSchema>> {
    const response = await this.#fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      // The body may echo a token: keep only the error code.
      const error = await response
        .json()
        .then((body: unknown) => z.object({ error: z.string() }).safeParse(body).data?.error)
        .catch(() => undefined);
      throw new TeslaAuthError(`Token request refused (${response.status}${error ? ` ${error}` : ''})`);
    }
    return TokenResponseSchema.parse(await response.json());
  }
}
