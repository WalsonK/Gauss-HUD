import { stdin, stdout } from 'node:process';
import { PAIRING_CODE_TTL_MS } from './auth/pairing.ts';
import { PIN_DIGITS } from './auth/pin.ts';
import { loadEnvFile, parseConfig } from './config.ts';
import { createContext } from './context.ts';
import { createLogger } from './logger.ts';
import { TESLA_COMMANDS, type CliCommand } from './vehicle/tesla/cli.ts';

/** Reads a line without echoing it (PIN, secrets). */
function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal');
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let answer = '';
    const done = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(answer.trim());
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          done(char === '\u0003' ? new Error('Cancelled') : undefined);
          return;
        }
        if (char === '\u007f' || char === '\b') answer = answer.slice(0, -1);
        else answer += char;
      }
    };
    stdin.on('data', onData);
  });
}

const COMMANDS: Record<string, CliCommand> = {
  pair: ({ pairing }) => {
    const code = pairing.createCode();
    console.log(`Pairing code: ${code} (single use, valid ${PAIRING_CODE_TTL_MS / 60_000} minutes)`);
  },

  'sessions:revoke': ({ pairing }) => {
    console.log(`Revoked ${pairing.revokeAll()} session(s). The glasses will ask for a new pairing code.`);
  },

  'pin:set': async ({ pin }) => {
    const first = await askHidden(`New PIN (${PIN_DIGITS} digits): `);
    const second = await askHidden('Repeat the PIN: ');
    if (first !== second) throw new Error('The two entries differ');
    await pin.set(first);
    console.log('PIN saved.');
  },

  ...TESLA_COMMANDS,
};

loadEnvFile();
const [name = '', ...args] = process.argv.slice(2);
const command = COMMANDS[name];
if (!command) {
  console.error(`Usage: gauss <${Object.keys(COMMANDS).join(' | ')}>`);
  process.exit(2);
}

const config = parseConfig();
const ctx = createContext(config, { log: createLogger('warn') });
try {
  await command(ctx, args);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  ctx.db.close();
}
