import type { FastifyBaseLogger } from 'fastify';
import type { NtfyConfig } from './config.ts';

export type Notify = (title: string, message: string) => void;

/** Phone notification through ntfy; fire and forget, a failure is only logged. */
export function createNotify(config: NtfyConfig | null, log: FastifyBaseLogger): Notify {
  if (!config) return () => undefined;
  const url = `${config.url.replace(/\/+$/, '')}/${encodeURIComponent(config.topic)}`;
  return (title, message) => {
    const headers: Record<string, string> = { Title: title, Tags: 'car' };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    fetch(url, { method: 'POST', headers, body: message, signal: AbortSignal.timeout(10_000) })
      .then((response) => {
        if (!response.ok) log.warn({ status: response.status }, 'ntfy notification refused');
      })
      .catch((error: unknown) => {
        log.warn({ err: error }, 'ntfy notification failed');
      });
  };
}
