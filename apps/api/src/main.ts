import { buildApp } from './app.ts';
import { loadEnvFile, parseConfig } from './config.ts';
import { createContext } from './context.ts';
import { createLogger } from './logger.ts';

loadEnvFile();
const config = parseConfig();
const ctx = createContext(config, { log: createLogger(config.logLevel) });
const app = await buildApp(ctx);

for (const task of ctx.background) task.start();
app.addHook('onClose', () => {
  for (const task of ctx.background) task.stop();
  ctx.db.close();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}

await app.listen({ port: config.port, host: config.host });
