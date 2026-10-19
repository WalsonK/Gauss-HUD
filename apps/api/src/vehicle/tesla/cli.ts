import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Context } from '../../context.ts';
import type { Tesla } from './index.ts';
import { PUBLIC_KEY_PATH } from './index.ts';
import { createProxyTlsPair } from './proxyCert.ts';

export type CliCommand = (ctx: Context, args: string[]) => Promise<void> | void;

function requireTesla(ctx: Context): Tesla {
  if (!ctx.tesla) throw new Error('Set TESLA_CLIENT_ID and TESLA_CLIENT_SECRET in .env first');
  return ctx.tesla;
}

/** The registered domain: the host of PUBLIC_ORIGIN, served over HTTPS. */
function domain(ctx: Context): string {
  const origin = ctx.config.publicOrigin;
  if (!origin?.startsWith('https://')) throw new Error("Set PUBLIC_ORIGIN to this instance's HTTPS origin first");
  return new URL(origin).hostname;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Writes a private key; `wx` never overwrites one, since a new key means redoing a setup step. */
function writePrivate(path: string, pem: string): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, pem, { flag: 'wx', mode: 0o600 });
  } catch {
    throw new Error(`${path} already exists: delete it yourself if you really want a new one`);
  }
}

function writePublic(path: string, pem: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { mode: 0o644 });
}

/** One-time onboarding steps with the vehicle API, in the order of the README. */
export const TESLA_COMMANDS: Record<string, CliCommand> = {
  /** EC P-256 key pair: the private key goes to the signing proxy only, the public one is served. */
  'tesla:keys': ({ config }) => {
    const { publicKeyPath, privateKeyPath } = config.teslaKeys;
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'sec1', format: 'pem' },
    });
    // A new key pair means pairing the vehicle again.
    writePrivate(privateKeyPath, privateKey);
    writePublic(publicKeyPath, publicKey);
    console.log(`Private key: ${privateKeyPath} (for the signing proxy only, never share it)`);
    console.log(`Public key:  ${publicKeyPath} (served at ${PUBLIC_KEY_PATH})`);
  },

  /** Self-signed TLS pair of the signing proxy, valid for the host of TESLA_COMMAND_PROXY_URL. */
  'tesla:proxy-cert': ({ config }) => {
    const { keyPath, certPath, url } = config.proxyTls;
    const proxyHost = url ? [new URL(url).hostname] : [];
    const hostnames = [...new Set([...proxyHost, 'localhost', '127.0.0.1'])];
    const { key, cert } = createProxyTlsPair(hostnames);
    writePrivate(keyPath, key);
    writePublic(certPath, cert);
    console.log(`Proxy TLS key:         ${keyPath} (for the signing proxy only)`);
    console.log(`Proxy TLS certificate: ${certPath} (valid for ${hostnames.join(', ')})`);
    if (!url) console.log('TESLA_COMMAND_PROXY_URL is not set: the certificate only covers localhost.');
  },

  /** Registers this domain with the vehicle API in the configured region. */
  'tesla:register': async (ctx) => {
    const tesla = requireTesla(ctx);
    const host = domain(ctx);
    const token = await tesla.auth.partnerToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const base = tesla.config.fleetApiUrl;
    const register = await fetch(`${base}/api/1/partner_accounts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ domain: host }),
    });
    console.log(`Registration of ${host} on ${base}: HTTP ${register.status}`);
    console.log(json(await register.json().catch(() => null)));
    if (!register.ok) throw new Error(`Check that ${ctx.config.publicOrigin}${PUBLIC_KEY_PATH} serves the public key`);
    const check = await fetch(`${base}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(host)}`, {
      headers,
    });
    console.log(`Registered public key: HTTP ${check.status}`);
    console.log(json(await check.json().catch(() => null)));
  },

  /** Prints the sign-in link; the server must be running at PUBLIC_ORIGIN to receive the callback. */
  'tesla:login': (ctx) => {
    const url = requireTesla(ctx).auth.authorizeUrl();
    console.log('Open this link on your phone or computer (not on the glasses), within 10 minutes:\n');
    console.log(url);
    console.log('\nThe server must be running at PUBLIC_ORIGIN to receive the answer.');
  },

  /** Lists the account's vehicles, to pick TESLA_VIN. One billed data call. */
  'tesla:vehicles': async (ctx) => {
    const { status, body } = await requireTesla(ctx).client.get('/api/1/vehicles');
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const vehicles = z
      .object({
        response: z.array(
          z.object({ vin: z.string(), display_name: z.string().nullish(), state: z.string().nullish() }),
        ),
      })
      .parse(body).response;
    for (const v of vehicles) console.log(`${v.vin}  ${v.display_name ?? ''}  (${v.state ?? 'unknown'})`);
    console.log('\nCopy the VIN into TESLA_VIN in .env, then restart the server.');
  },

  /** Link that installs this application's key on the vehicle, approved in the owner's phone app. */
  'tesla:pair-link': (ctx) => {
    console.log('Open this link on the phone that has the vehicle app, then approve the key in the car app:\n');
    console.log(`https://tesla.com/_ak/${domain(ctx)}`);
  },

  /** Checks token, connection state and key pairing. Two or three billed data calls. */
  'tesla:check': async (ctx) => {
    const tesla = requireTesla(ctx);
    await tesla.auth.refresh();
    console.log('Token: refreshed and saved');
    if (!tesla.provider || !tesla.config.vin) throw new Error('Set TESLA_VIN (see `tesla:vehicles`)');
    console.log(`Connection: ${await tesla.provider.connection()}`);
    const fleetStatus = await tesla.client.post('/api/1/vehicles/fleet_status', {
      kind: 'data',
      body: { vins: [tesla.config.vin] },
    });
    console.log(`fleet_status: HTTP ${fleetStatus.status}`);
    console.log(json(fleetStatus.body));
    console.log(`Key paired: ${String(await tesla.provider.hasKey())}`);
    console.log(`Command proxy: ${tesla.config.commandProxyUrl ?? 'not set (TESLA_COMMAND_PROXY_URL)'}`);
  },
};
