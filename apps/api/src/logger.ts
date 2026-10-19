import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';
import type { Config } from './config.ts';

/** Shared by the server and the context. Never logs query strings, cookies or authorization headers. */
export function createLogger(level: Config['logLevel']): FastifyBaseLogger {
  return pino({
    level,
    serializers: {
      // An OAuth callback carries its authorization code in the query string.
      req: (req: { method: string; url: string; ip?: string }) => ({
        method: req.method,
        url: req.url.split('?')[0],
        ip: req.ip,
      }),
    },
  });
}
