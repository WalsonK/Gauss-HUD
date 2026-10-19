import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { CSRF_HEADER, VehicleCommandSchema, type PairResult } from '@gauss-hud/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Context } from './context.ts';

export const SESSION_COOKIE = 'gauss_session';
const SESSION_MAX_AGE_S = 365 * 24 * 3600;

const PairBodySchema = z.object({ code: z.string() });
const CommandBodySchema = z.object({
  pin: z.string().max(32).optional(),
  value: z.number().optional(),
});

/** Fastify app: the HUD API under `/api`, extra routes from the context, and the compiled HUD. */
export async function buildApp(ctx: Context): Promise<FastifyInstance> {
  const { config, pairing, service } = ctx;
  const app = Fastify({
    trustProxy: config.trustProxy,
    loggerInstance: ctx.log,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
  });
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  // Anti-CSRF: every state-changing API request must carry the custom header.
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || !request.url.startsWith('/api/')) return;
    if (request.headers[CSRF_HEADER] !== '1') await reply.code(403).send({ error: 'forbidden' });
  });

  const requireSession = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pairing.verify(request.cookies[SESSION_COOKIE])) await reply.code(401).send({ error: 'unauthorized' });
  };

  // Container healthcheck: polled every 30 s, so kept out of the info logs.
  app.get('/api/health', { logLevel: 'warn' }, () => ({ ok: true }));

  app.get('/api/session', (request) => ({ paired: pairing.verify(request.cookies[SESSION_COOKIE]) }));

  app.post(
    '/api/pair',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          errorResponseBuilder: (_request, context) => ({
            statusCode: context.statusCode,
            result: 'too_many' satisfies PairResult,
          }),
        },
      },
    },
    async (request, reply) => {
      const body = PairBodySchema.safeParse(request.body);
      const token = body.success ? pairing.redeem(body.data.code) : null;
      if (!token) return { result: 'invalid' satisfies PairResult };
      request.log.info('glasses paired');
      void reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_MAX_AGE_S,
      });
      return { result: 'ok' satisfies PairResult };
    },
  );

  app.get('/api/snapshot', { preHandler: requireSession }, () => service.snapshot());

  app.post(
    '/api/refresh',
    { preHandler: requireSession, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    () => service.refresh(),
  );

  app.post(
    '/api/commands/:command',
    { preHandler: requireSession, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const command = VehicleCommandSchema.safeParse((request.params as { command: string }).command);
      const body = CommandBodySchema.safeParse(request.body ?? {});
      if (!command.success || !body.success) return reply.code(400).send({ error: 'unknown_command' });

      // Progress is streamed as server-sent events, so the HUD never has to poll.
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      });
      await service.send(command.data, {
        ...body.data,
        ip: request.ip,
        onProgress: (progress) => reply.raw.write(`data: ${JSON.stringify(progress)}\n\n`),
      });
      reply.raw.end();
    },
  );

  for (const register of ctx.routes) await register(app);

  // The compiled HUD, with a single-page-app fallback. Absent in development (Vite serves it).
  if (existsSync(join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/'))
        return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
