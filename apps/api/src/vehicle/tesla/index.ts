import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Now } from '../../clock.ts';
import type { Config, TeslaConfig } from '../../config.ts';
import type { KeyValue } from '../../db.ts';
import type { Usage } from '../../safety/usage.ts';
import { CALLBACK_PATH, TeslaAuth, type Fetch } from './auth.ts';
import { FleetClient } from './fleet.ts';
import { TeslaFleetProvider } from './provider.ts';

/** Where the vehicle API fetches this application's public key, on the registered domain. */
export const PUBLIC_KEY_PATH = '/.well-known/appspecific/com.tesla.3p.public-key.pem';
const REFRESH_CHECK_MS = 24 * 3600_000;

export interface Tesla {
  readonly config: TeslaConfig;
  readonly auth: TeslaAuth;
  readonly client: FleetClient;
  /** Null until TESLA_VIN is set. */
  readonly provider: TeslaFleetProvider | null;
  readonly routes: (app: FastifyInstance) => void;
  /** Daily check that keeps the refresh token alive (refreshes every 25 days). */
  readonly refreshTask: { start(): void; stop(): void };
}

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const page = (title: string, text: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>` +
  `<body style="font:18px system-ui;margin:2rem;max-width:32rem"><h1>${title}</h1><p>${escape(text)}</p>`;

export function createTesla(
  config: Config,
  tesla: TeslaConfig,
  {
    kv,
    usage,
    log,
    now = Date.now,
    fetch: fetchImpl = fetch,
  }: {
    kv: KeyValue;
    usage: Usage;
    log: FastifyBaseLogger;
    now?: Now;
    fetch?: Fetch;
  },
): Tesla {
  if (tesla.proxyCaPath && existsSync(tesla.proxyCaPath)) {
    // Process-wide, so the built-in fetch accepts the proxy's certificate without NODE_EXTRA_CA_CERTS.
    setDefaultCACertificates([...getCACertificates('default'), readFileSync(tesla.proxyCaPath, 'utf8')]);
  } else if (tesla.proxyCaPath) {
    log.warn('TESLA_PROXY_CA_PATH does not exist yet: run `tesla:proxy-cert`, then restart');
  }
  const auth = new TeslaAuth(tesla, { publicOrigin: config.publicOrigin, kv, fetch: fetchImpl, now });
  const client = new FleetClient(tesla, { auth, usage, fetch: fetchImpl });
  const provider = tesla.vin ? new TeslaFleetProvider(client, tesla.vin, { kv, now }) : null;

  const routes = (app: FastifyInstance) => {
    app.get(PUBLIC_KEY_PATH, async (_request, reply) => {
      const pem = await readFile(tesla.publicKeyPath, 'utf8').catch(() => null);
      if (!pem) return reply.code(404).send('Public key not generated yet: run `tesla:keys`');
      return reply.type('application/x-pem-file').send(pem);
    });

    app.get(CALLBACK_PATH, { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const query = z
        .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
        .parse(request.query);
      void reply.type('text/html; charset=utf-8');
      if (query.error || !query.code || !query.state) {
        return reply.code(400).send(page('Sign-in cancelled', 'No access was granted. You can close this page.'));
      }
      try {
        await auth.handleCallback(query.code, query.state);
        request.log.info('vehicle API account connected');
        return page('Connected', 'The vehicle API account is connected. You can close this page.');
      } catch (error) {
        request.log.warn({ err: error }, 'vehicle API sign-in failed');
        return reply.code(400).send(page('Sign-in failed', error instanceof Error ? error.message : 'Unknown error'));
      }
    });
  };

  let timer: NodeJS.Timeout | undefined;
  const check = () => {
    auth
      .refreshIfStale()
      .then((refreshed) => {
        if (refreshed) log.info('vehicle API token refreshed');
      })
      .catch((error: unknown) => {
        log.error({ err: error }, 'vehicle API token refresh failed: run `tesla:login` if it persists');
      });
  };

  return {
    config: tesla,
    auth,
    client,
    provider,
    routes,
    refreshTask: {
      start() {
        check();
        timer = setInterval(check, REFRESH_CHECK_MS);
        timer.unref();
      },
      stop() {
        clearInterval(timer);
      },
    },
  };
}
