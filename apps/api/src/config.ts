import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_SCENARIOS } from '@gauss-hud/shared';
import { z } from 'zod';

/** Repository root: relative paths in `.env` resolve against it, whatever the working directory. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const flag = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');
const int = (fallback: number) => z.coerce.number().int().nonnegative().default(fallback);

/** Every variable of `.env.example`. Empty values count as unset and take the default. */
const EnvSchema = z.object({
  PORT: int(3000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_PATH: z.string().default('data/gauss-hud.db'),
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
  TRUST_PROXY: flag.default(false),
  APP_TIMEZONE: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC', 'Unknown IANA time zone')
    .default('UTC'),
  WEB_DIST: z.string().default('apps/web/dist'),

  DRY_RUN: flag.default(false),
  DAILY_MAX_COMMANDS: int(30),
  DAILY_MAX_WAKES: int(4),
  DATA_MIN_INTERVAL_SEC: int(120),
  MONTHLY_CREDIT_EUR: z.coerce.number().nonnegative().default(10),

  MOCK_SCENARIO: z.enum(MOCK_SCENARIOS).default('online'),

  TESLA_CLIENT_ID: z.string().optional(),
  TESLA_CLIENT_SECRET: z.string().optional(),
  TESLA_REGION: z.enum(['eu', 'na']).default('eu'),
  TESLA_VIN: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'A VIN is 17 characters')
    .optional(),
  TESLA_PUBLIC_KEY_PATH: z.string().default('secrets/public-key.pem'),
  TESLA_PRIVATE_KEY_PATH: z.string().default('secrets/private-key.pem'),
  TESLA_COMMAND_PROXY_URL: z.url({ protocol: /^https$/ }).optional(),
  TESLA_PROXY_CA_PATH: z.string().optional(),
  TESLA_PROXY_TLS_KEY_PATH: z.string().default('secrets/proxy-tls/tls-key.pem'),

  NTFY_URL: z.url().optional(),
  NTFY_TOPIC: z.string().optional(),
  NTFY_TOKEN: z.string().optional(),
});

export interface NtfyConfig {
  readonly url: string;
  readonly topic: string;
  readonly token: string | undefined;
}

/** Fleet API base URL per region; also the OAuth `audience`. */
export const FLEET_API_URLS = {
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
} as const;

export interface TeslaConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fleetApiUrl: string;
  /** Unset until chosen with `tesla:vehicles`. */
  readonly vin: string | undefined;
  readonly publicKeyPath: string;
  /** The signing proxy (tesla-http-proxy); commands need it, reads don't. */
  readonly commandProxyUrl: string | undefined;
  /** The proxy's own (usually self-signed) TLS certificate, trusted on top of the system ones. */
  readonly proxyCaPath: string | undefined;
}

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  /** Absolute path, or `:memory:`. */
  readonly dbPath: string;
  readonly publicOrigin: string | undefined;
  readonly trustProxy: boolean;
  readonly timeZone: string;
  readonly webDist: string;
  readonly dryRun: boolean;
  readonly dailyMaxCommands: number;
  readonly dailyMaxWakes: number;
  readonly dataMinIntervalMs: number;
  readonly monthlyCreditEur: number;
  readonly mockScenario: z.infer<typeof EnvSchema>['MOCK_SCENARIO'];
  /** Key pair for signed commands; generated before the application even exists. */
  readonly teslaKeys: { readonly publicKeyPath: string; readonly privateKeyPath: string };
  /** Where `tesla:proxy-cert` writes the signing proxy's TLS pair, and the URL the app reaches it at. */
  readonly proxyTls: { readonly keyPath: string; readonly certPath: string; readonly url: string | undefined };
  /** Null while the vehicle API application is not set up: the server then runs on the mock. */
  readonly tesla: TeslaConfig | null;
  readonly ntfy: NtfyConfig | null;
}

const fromRoot = (path: string) => (path === ':memory:' || isAbsolute(path) ? path : resolve(ROOT, path));

/** Parses an environment (`process.env` by default). Throws with every invalid variable listed. */
export function parseConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  if (e.TESLA_CLIENT_ID && !e.TESLA_CLIENT_SECRET)
    throw new Error('Invalid configuration: TESLA_CLIENT_SECRET is missing');
  return {
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    dbPath: fromRoot(e.DB_PATH),
    publicOrigin: e.PUBLIC_ORIGIN?.replace(/\/+$/, ''),
    trustProxy: e.TRUST_PROXY,
    timeZone: e.APP_TIMEZONE,
    webDist: fromRoot(e.WEB_DIST),
    dryRun: e.DRY_RUN,
    dailyMaxCommands: e.DAILY_MAX_COMMANDS,
    dailyMaxWakes: e.DAILY_MAX_WAKES,
    dataMinIntervalMs: e.DATA_MIN_INTERVAL_SEC * 1000,
    monthlyCreditEur: e.MONTHLY_CREDIT_EUR,
    mockScenario: e.MOCK_SCENARIO,
    teslaKeys: {
      publicKeyPath: fromRoot(e.TESLA_PUBLIC_KEY_PATH),
      privateKeyPath: fromRoot(e.TESLA_PRIVATE_KEY_PATH),
    },
    proxyTls: {
      keyPath: fromRoot(e.TESLA_PROXY_TLS_KEY_PATH),
      certPath: fromRoot(e.TESLA_PROXY_CA_PATH ?? 'secrets/proxy-tls/tls-cert.pem'),
      url: e.TESLA_COMMAND_PROXY_URL?.replace(/\/+$/, ''),
    },
    tesla:
      e.TESLA_CLIENT_ID && e.TESLA_CLIENT_SECRET
        ? {
            clientId: e.TESLA_CLIENT_ID,
            clientSecret: e.TESLA_CLIENT_SECRET,
            fleetApiUrl: FLEET_API_URLS[e.TESLA_REGION],
            vin: e.TESLA_VIN,
            publicKeyPath: fromRoot(e.TESLA_PUBLIC_KEY_PATH),
            commandProxyUrl: e.TESLA_COMMAND_PROXY_URL?.replace(/\/+$/, ''),
            proxyCaPath: e.TESLA_PROXY_CA_PATH && fromRoot(e.TESLA_PROXY_CA_PATH),
          }
        : null,
    ntfy: e.NTFY_URL && e.NTFY_TOPIC ? { url: e.NTFY_URL, topic: e.NTFY_TOPIC, token: e.NTFY_TOKEN } : null,
  };
}

/** Loads the repository's `.env` into `process.env` when it exists (real environment wins). */
export function loadEnvFile(): void {
  const path = resolve(ROOT, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
