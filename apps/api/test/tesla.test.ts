import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { createContext } from '../src/context.ts';
import { TOKEN_URL } from '../src/vehicle/tesla/auth.ts';
import { PUBLIC_KEY_PATH } from '../src/vehicle/tesla/index.ts';
import { toExecuteResult, toVehicleStatus, VehicleDataSchema } from '../src/vehicle/tesla/mapping.ts';
import { clock, silentLog, testConfig } from './helpers.ts';

const VIN = '5YJ3E1EA7KF000001';
const FLEET = 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
const PROXY = 'https://proxy.internal:4443';

/** Fixture shaped like a `vehicle_data` response (charge, climate, vehicle and drive state). */
const vehicleData = (overrides: { shift_state?: string | null; charging_state?: string } = {}) => ({
  response: {
    display_name: 'Gauss',
    charge_state: {
      battery_level: 64,
      battery_range: 180.5,
      charging_state: overrides.charging_state ?? 'Charging',
      charger_power: 11,
      minutes_to_full_charge: 90,
      charge_port_door_open: true,
    },
    climate_state: { inside_temp: 18.5, driver_temp_setting: 21, is_climate_on: false },
    vehicle_state: { locked: true, sentry_mode: true, vehicle_name: 'Gauss' },
    drive_state: { shift_state: overrides.shift_state ?? null },
  },
});

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
  readonly auth: string | undefined;
}

type Route = (call: Call) => { status: number; body: unknown } | undefined;

/** Fake network: the first route returning a response wins; every call is recorded. */
function fakeFetch(...routes: Route[]) {
  const calls: Call[] = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      auth: headers.get('authorization') ?? undefined,
    };
    calls.push(call);
    for (const route of routes) {
      const result = route(call);
      if (result) return Promise.resolve(Response.json(result.body, { status: result.status }));
    }
    return Promise.resolve(Response.json({ error: 'not found' }, { status: 404 }));
  };
  return { calls, fetch: impl };
}

let tokenCount = 0;
/** Token endpoint that rotates refresh tokens like the real one. */
const tokenRoute: Route = (call) => {
  if (call.url !== TOKEN_URL) return undefined;
  tokenCount += 1;
  return {
    status: 200,
    body: { access_token: `access-${tokenCount}`, refresh_token: `refresh-${tokenCount}`, expires_in: 28_800 },
  };
};

function teslaContext(
  fetchImpl: typeof fetch,
  { now = Date.now, env = {} }: { now?: () => number; env?: Record<string, string> } = {},
) {
  const config = testConfig({
    PUBLIC_ORIGIN: 'https://car.example.com',
    TESLA_CLIENT_ID: 'client-id',
    TESLA_CLIENT_SECRET: 'client-secret',
    TESLA_VIN: VIN,
    TESLA_COMMAND_PROXY_URL: PROXY,
    ...env,
  });
  return createContext(config, { log: silentLog, now, fetch: fetchImpl });
}

/** Signs in through the real callback flow with a fake token endpoint. */
async function signIn(ctx: ReturnType<typeof teslaContext>) {
  const state = new URL(ctx.tesla?.auth.authorizeUrl() ?? '').searchParams.get('state') ?? '';
  await ctx.tesla?.auth.handleCallback('auth-code', state);
}

describe('Tesla mapping', () => {
  it('translates vehicle_data into the neutral status', () => {
    const now = Date.parse('2026-10-19T10:00:00Z');
    const status = toVehicleStatus(VehicleDataSchema.parse(vehicleData().response), now);
    assert.deepEqual(status, {
      name: 'Gauss',
      connection: 'online',
      updatedAt: '2026-10-19T10:00:00.000Z',
      batteryPercent: 64,
      rangeKm: 290,
      pluggedIn: true,
      charging: { powerKw: 11, endsAt: '2026-10-19T11:30:00.000Z' },
      chargePortOpen: true,
      locked: true,
      cabinTempC: 18.5,
      targetTempC: 21,
      climateOn: false,
      guardOn: true,
      moving: false,
    });
  });

  it('reads D, R and N as moving, P and no gear as parked', () => {
    const moving = (shift_state: string | null) =>
      toVehicleStatus(VehicleDataSchema.parse(vehicleData({ shift_state }).response), 0).moving;
    assert.deepEqual(['D', 'R', 'N', 'P', null].map(moving), [true, true, true, false, false]);
  });

  it('reads an unplugged vehicle', () => {
    const status = toVehicleStatus(
      VehicleDataSchema.parse(vehicleData({ charging_state: 'Disconnected' }).response),
      0,
    );
    assert.equal(status.pluggedIn, false);
    assert.equal(status.charging, null);
  });

  it('maps command answers, never turning a timeout into a success', () => {
    assert.equal(toExecuteResult(200, { response: { result: true, reason: '' } }), 'ok');
    assert.equal(toExecuteResult(200, { response: { result: false, reason: 'not_charging' } }), 'ok');
    assert.equal(toExecuteResult(200, { response: { result: false, reason: 'car_wash' } }), 'failed');
    assert.equal(toExecuteResult(408, null), 'timeout');
    assert.equal(toExecuteResult(500, null), 'failed');
  });
});

describe('TeslaAuth', () => {
  it('signs in with the authorization code and a single-use state', async () => {
    const net = fakeFetch(tokenRoute);
    const ctx = teslaContext(net.fetch);
    const url = new URL(ctx.tesla?.auth.authorizeUrl() ?? '');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://car.example.com/api/auth/tesla/callback');
    assert.doesNotMatch(url.searchParams.get('scope') ?? '', /location/);
    const state = url.searchParams.get('state') ?? '';
    await ctx.tesla?.auth.handleCallback('auth-code', state);
    const form = new URLSearchParams(net.calls[0]?.body);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('audience'), FLEET);
    await assert.rejects(ctx.tesla?.auth.handleCallback('auth-code', state) ?? Promise.resolve());
  });

  it('saves every rotated refresh token and refreshes only once for concurrent callers', async () => {
    const net = fakeFetch(tokenRoute);
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    const auth = ctx.tesla?.auth;
    assert.ok(auth);
    const before = tokenCount;
    await Promise.all([auth.refresh(), auth.refresh()]);
    assert.equal(tokenCount, before + 1);
    const form = new URLSearchParams(net.calls.at(-1)?.body);
    assert.equal(form.get('refresh_token'), `refresh-${before}`);
    await auth.refresh();
    assert.equal(new URLSearchParams(net.calls.at(-1)?.body).get('refresh_token'), `refresh-${before + 1}`);
  });

  it('refreshes in the background only after 25 days', async () => {
    const time = clock();
    const ctx = teslaContext(fakeFetch(tokenRoute).fetch, { now: time.now });
    await signIn(ctx);
    assert.equal(await ctx.tesla?.auth.refreshIfStale(), false);
    time.advance(25 * 24 * 3600_000);
    assert.equal(await ctx.tesla?.auth.refreshIfStale(), true);
  });
});

describe('TeslaFleetProvider', () => {
  const vehicleRoute =
    (state: string): Route =>
    (call) =>
      call.url === `${FLEET}/api/1/vehicles/${VIN}` ? { status: 200, body: { response: { state } } } : undefined;
  const dataRoute: Route = (call) =>
    call.url.startsWith(`${FLEET}/api/1/vehicles/${VIN}/vehicle_data`)
      ? { status: 200, body: vehicleData() }
      : undefined;
  const keyRoute: Route = (call) =>
    call.url === `${FLEET}/api/1/vehicles/fleet_status`
      ? { status: 200, body: { response: { key_paired_vins: [VIN], unpaired_vins: [] } } }
      : undefined;
  const commandRoute: Route = (call) =>
    call.url.startsWith(`${PROXY}/api/1/vehicles/${VIN}/command/`)
      ? { status: 200, body: { response: { result: true, reason: '' } } }
      : undefined;

  it('reads without location and meters every billed call', async () => {
    const net = fakeFetch(tokenRoute, vehicleRoute('online'), dataRoute);
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    const { status } = await ctx.service.refresh();
    assert.equal(status?.batteryPercent, 64);
    const dataCall = net.calls.find((c) => c.url.includes('vehicle_data'));
    assert.ok(dataCall);
    const endpoints = new URL(dataCall.url).searchParams.get('endpoints');
    assert.equal(endpoints, 'charge_state;climate_state;vehicle_state;drive_state');
    assert.equal(ctx.usage.today('data'), 2);
  });

  it('only checks the connection of a sleeping vehicle', async () => {
    const net = fakeFetch(tokenRoute, vehicleRoute('asleep'));
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    await ctx.service.refresh();
    assert.ok(!net.calls.some((c) => c.url.includes('vehicle_data') || c.url.includes('wake_up')));
  });

  it('sends signed commands through the proxy, after the key check', async () => {
    const net = fakeFetch(tokenRoute, vehicleRoute('online'), dataRoute, keyRoute, commandRoute);
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    assert.equal(await ctx.service.send('climate.setTemp', { value: 21.5 }), 'ok');
    const command = net.calls.find((c) => c.url.includes('/command/'));
    assert.equal(command?.url, `${PROXY}/api/1/vehicles/${VIN}/command/set_temps`);
    assert.deepEqual(JSON.parse(command.body ?? ''), { driver_temp: 21.5, passenger_temp: 21.5 });
    assert.match(command.auth ?? '', /^Bearer access-/);
    assert.equal(ctx.usage.today('commands'), 1);
    // The paired key is cached: a second command doesn't ask again.
    await ctx.service.send('guard.on');
    assert.equal(net.calls.filter((c) => c.url.endsWith('fleet_status')).length, 1);
  });

  it('refuses commands when the key is not paired', async () => {
    const unpaired: Route = (call) =>
      call.url.endsWith('fleet_status') ? { status: 200, body: { response: { key_paired_vins: [] } } } : undefined;
    const net = fakeFetch(tokenRoute, vehicleRoute('online'), unpaired, commandRoute);
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    assert.equal(await ctx.service.send('climate.on'), 'no_key');
    assert.ok(!net.calls.some((c) => c.url.includes('/command/')));
  });

  it('never resends a command after a 401, even once the token is refreshed', async () => {
    const unauthorized: Route = (call) =>
      call.url.includes('/command/') ? { status: 401, body: { error: 'invalid_token' } } : undefined;
    const net = fakeFetch(tokenRoute, vehicleRoute('online'), dataRoute, keyRoute, unauthorized);
    const ctx = teslaContext(net.fetch);
    await signIn(ctx);
    assert.equal(await ctx.service.send('climate.on'), 'failed');
    assert.equal(net.calls.filter((c) => c.url.includes('/command/')).length, 1);
  });

  it('wakes a sleeping vehicle before a command, polling its state', async () => {
    let state = 'asleep';
    const vehicle: Route = (call) =>
      call.url === `${FLEET}/api/1/vehicles/${VIN}` ? { status: 200, body: { response: { state } } } : undefined;
    const wake: Route = (call) => {
      if (!call.url.endsWith('/wake_up')) return undefined;
      state = 'online';
      return { status: 200, body: { response: { state: 'asleep' } } };
    };
    const net = fakeFetch(tokenRoute, vehicle, wake, dataRoute, keyRoute, commandRoute);
    // Fake timers: the 5 s polling delay must not slow the test down.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
    try {
      const ctx = teslaContext(net.fetch);
      await signIn(ctx);
      assert.equal(await ctx.service.send('climate.on'), 'ok');
      assert.equal(ctx.usage.today('wakes'), 1);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });
});

describe('Tesla routes', () => {
  it('serves the public key at the well-known path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gauss-key-'));
    const path = join(dir, 'public-key.pem');
    const ctx = teslaContext(fakeFetch().fetch, { env: { TESLA_PUBLIC_KEY_PATH: path } });
    const app = await buildApp(ctx);
    assert.equal((await app.inject({ url: PUBLIC_KEY_PATH })).statusCode, 404);
    writeFileSync(path, '-----BEGIN PUBLIC KEY-----\n');
    const response = await app.inject({ url: PUBLIC_KEY_PATH });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /BEGIN PUBLIC KEY/);
  });

  it('completes the sign-in on the OAuth callback, once', async () => {
    const ctx = teslaContext(fakeFetch(tokenRoute).fetch);
    const app = await buildApp(ctx);
    const state = new URL(ctx.tesla?.auth.authorizeUrl() ?? '').searchParams.get('state') ?? '';
    const url = `/api/auth/tesla/callback?code=abc&state=${state}`;
    assert.equal((await app.inject({ url })).statusCode, 200);
    assert.equal(ctx.tesla?.auth.hasTokens(), true);
    assert.equal((await app.inject({ url })).statusCode, 400);
  });
});
