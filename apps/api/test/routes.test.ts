import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CSRF_HEADER } from '@gauss-hud/shared';
import { buildApp, SESSION_COOKIE } from '../src/app.ts';
import { testContext } from './helpers.ts';

const csrf = { [CSRF_HEADER]: '1' };

async function pairedApp() {
  const ctx = testContext();
  const app = await buildApp(ctx);
  const response = await app.inject({
    method: 'POST',
    url: '/api/pair',
    headers: csrf,
    payload: { code: ctx.pairing.createCode() },
  });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  assert.ok(cookie);
  return { app, ctx, cookies: { [SESSION_COOKIE]: cookie.value } };
}

describe('API routes', () => {
  it('sets a strict, HttpOnly, Secure session cookie on pairing', async () => {
    const ctx = testContext();
    const app = await buildApp(ctx);
    const response = await app.inject({
      method: 'POST',
      url: '/api/pair',
      headers: csrf,
      payload: { code: ctx.pairing.createCode() },
    });
    assert.deepEqual(response.json(), { result: 'ok' });
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    assert.equal(cookie?.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'Strict');
  });

  it('refuses a POST without the anti-CSRF header', async () => {
    const { app, cookies } = await pairedApp();
    const response = await app.inject({ method: 'POST', url: '/api/commands/climate.on', cookies, payload: {} });
    assert.equal(response.statusCode, 403);
  });

  it('refuses the data routes without a session', async () => {
    const app = await buildApp(testContext());
    assert.equal((await app.inject({ method: 'GET', url: '/api/snapshot' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/refresh', headers: csrf })).statusCode, 401);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/session' })).json(), { paired: false });
  });

  it('refuses any command outside the whitelist', async () => {
    const { app, cookies } = await pairedApp();
    for (const command of ['unlock', 'door_unlock', 'remote_start_drive', '__proto__']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/commands/${command}`,
        headers: csrf,
        cookies,
        payload: {},
      });
      assert.equal(response.statusCode, 400, command);
    }
  });

  it('streams command progress as server-sent events', async () => {
    const { app, cookies } = await pairedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/commands/climate.on',
      headers: csrf,
      cookies,
      payload: {},
    });
    assert.match(String(response.headers['content-type']), /^text\/event-stream/);
    assert.equal(response.body, 'data: {"phase":"sending"}\n\ndata: {"phase":"done","outcome":"ok"}\n\n');
  });

  it('limits pairing attempts', async () => {
    const app = await buildApp(testContext());
    const attempt = () => app.inject({ method: 'POST', url: '/api/pair', headers: csrf, payload: { code: '000000' } });
    for (let i = 0; i < 5; i++) assert.deepEqual((await attempt()).json(), { result: 'invalid' });
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json<{ result: string }>().result, 'too_many');
  });
});
