import {
  CSRF_HEADER,
  type CommandOutcome,
  type CommandProgress,
  type HudSnapshot,
  type PairResult,
  type VehicleCommand,
} from '@gauss-hud/shared';
import type { HudClient, SendOptions } from './client.ts';

/** Same-origin calls only: the session cookie is HttpOnly and never touched here. */
async function call(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (method === 'POST') headers[CSRF_HEADER] = '1';
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`API ${response.url}: ${response.status}`);
  return (await response.json()) as T;
}

/** Parses the `data:` lines of a server-sent event stream, chunk boundaries included. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (data) yield JSON.parse(data);
    }
  }
}

/** The HUD backend over HTTP: the Fastify API on the same origin. */
export class HttpHudClient implements HudClient {
  async isPaired(): Promise<boolean> {
    return (await json<{ paired: boolean }>(await call('/session'))).paired;
  }

  async pair(code: string): Promise<PairResult> {
    const response = await call('/pair', { method: 'POST', body: { code } });
    if (response.status === 429) return 'too_many';
    return (await json<{ result: PairResult }>(response)).result;
  }

  async snapshot(): Promise<HudSnapshot> {
    return json<HudSnapshot>(await call('/snapshot'));
  }

  async refresh(): Promise<HudSnapshot> {
    return json<HudSnapshot>(await call('/refresh', { method: 'POST' }));
  }

  async send(command: VehicleCommand, { pin, value, onProgress }: SendOptions = {}): Promise<CommandOutcome> {
    const done = (outcome: CommandOutcome) => {
      onProgress?.({ phase: 'done', outcome });
      return outcome;
    };
    let response: Response;
    try {
      response = await call(`/commands/${encodeURIComponent(command)}`, { method: 'POST', body: { pin, value } });
    } catch {
      return done('failed');
    }
    if (!response.ok || !response.body) return done('failed');

    try {
      for await (const event of events(response.body)) {
        const progress = event as CommandProgress;
        onProgress?.(progress);
        if (progress.phase === 'done') return progress.outcome;
      }
    } catch {
      // Connection lost mid-command: the outcome is unknown, never resend. The next read tells.
      return done('timeout');
    }
    return done('timeout');
  }
}
