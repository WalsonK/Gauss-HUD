import type { CommandOutcome, VehicleCommand } from '@gauss-hud/shared';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HudClient, HudSnapshot, PairResult } from './client.ts';
import type { I18n } from './i18n/index.ts';

/** Only refreshes the "updated X min ago" labels: purely local, never a network call. */
const CLOCK_TICK_MS = 30_000;

export type HudPhase = 'loading' | 'pairing' | 'ready';

export interface RunningCommand {
  readonly command: VehicleCommand;
  readonly phase: 'sending' | 'waking';
}

export interface HudState {
  readonly phase: HudPhase;
  readonly snapshot: HudSnapshot | null;
  readonly refreshing: boolean;
  /** At most one command at a time. */
  readonly running: RunningCommand | null;
  /** Current time for relative labels. */
  readonly now: number;
  readonly pair: (code: string) => Promise<PairResult>;
  readonly refresh: () => Promise<void>;
  readonly send: (command: VehicleCommand, pin?: string) => Promise<CommandOutcome | 'busy'>;
}

const HudContext = createContext<HudState | null>(null);
const I18nContext = createContext<I18n | null>(null);

/**
 * Display-independent HUD state. Reads the vehicle once when the HUD opens (and on explicit
 * request); there is no polling.
 */
function useHudState(client: HudClient): HudState {
  const [phase, setPhase] = useState<HudPhase>('loading');
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<RunningCommand | null>(null);
  const [now, setNow] = useState(Date.now);
  const busy = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    // Shared promise: a double mount (React StrictMode) or a double press reads only once.
    refreshInFlight.current ??= (async () => {
      setRefreshing(true);
      try {
        setSnapshot(await client.refresh());
        setNow(Date.now());
      } finally {
        setRefreshing(false);
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [client]);

  const openHome = useCallback(async () => {
    setSnapshot(await client.snapshot());
    setPhase('ready');
    await refresh();
  }, [client, refresh]);

  useEffect(() => {
    let cancelled = false;
    void client.isPaired().then((paired) => {
      if (cancelled) return;
      if (paired) void openHome();
      else setPhase('pairing');
    });
    return () => {
      cancelled = true;
    };
  }, [client, openHome]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, CLOCK_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [phase]);

  const pair = useCallback(
    async (code: string) => {
      const result = await client.pair(code);
      if (result === 'ok') void openHome();
      return result;
    },
    [client, openHome],
  );

  const send = useCallback(
    async (command: VehicleCommand, pin?: string): Promise<CommandOutcome | 'busy'> => {
      if (busy.current) return 'busy';
      busy.current = true;
      setRunning({ command, phase: 'sending' });
      try {
        const outcome = await client.send(command, {
          pin,
          onProgress: (progress) => {
            if (progress.phase !== 'done') setRunning({ command, phase: progress.phase });
          },
        });
        setSnapshot(await client.snapshot());
        setNow(Date.now());
        return outcome;
      } finally {
        busy.current = false;
        setRunning(null);
      }
    },
    [client],
  );

  return useMemo(
    () => ({ phase, snapshot, refreshing, running, now, pair, refresh, send }),
    [phase, snapshot, refreshing, running, now, pair, refresh, send],
  );
}

export function HudProvider({ client, i18n, children }: { client: HudClient; i18n: I18n; children: ReactNode }) {
  const state = useHudState(client);
  return (
    <I18nContext value={i18n}>
      <HudContext value={state}>{children}</HudContext>
    </I18nContext>
  );
}

export function useHud(): HudState {
  const state = use(HudContext);
  if (!state) throw new Error('useHud() must be used inside <HudProvider>');
  return state;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error('useI18n() must be used inside <HudProvider>');
  return i18n;
}
