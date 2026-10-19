import { ProgressIndicator, ProgressIndicatorSize, TextView } from '@wearables-ui-toolkit/mrbd';
import type { ReactNode } from 'react';
import { useHud, useI18n } from '../../core/hud.tsx';
import { toQuickActions, type QuickAction, type QuickActionKey } from '../../core/view/commands.ts';
import { toStatusView, type StatusView } from '../../core/view/status.ts';
import { ActionButton } from './ActionButton.tsx';
import { ClimateRow } from './ClimateRow.tsx';
import styles from './hud.module.css';

interface Row {
  key: QuickActionKey;
  /** Null when the vehicle reports no state for it (trunk). */
  state: ReactNode;
  /** The row stays without its button: it still shows a state (battery). */
  keepWithoutAction: boolean;
}

/** A state on the left: its value, and smaller lines under it. */
function State({ value, children }: { value?: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      {value && (
        <TextView textStyle="heading2" as="span">
          {value}
        </TextView>
      )}
      {children}
    </div>
  );
}

function Detail({ children }: { children: ReactNode }) {
  return (
    <TextView textStyle="meta1" textColor="secondary" as="span">
      {children}
    </TextView>
  );
}

/** This month's API spend as a bar: the amount inside the fill, the monthly credit at the end. */
function SpendBar({ usage }: { usage: NonNullable<StatusView['usage']> }) {
  return (
    <div className={styles.spend} role="img" aria-label={usage.label}>
      <div className={styles.spendTrack}>
        <div
          className={`${styles.spendFill} ${usage.alert ? styles.spendAlert : ''}`}
          style={{ inlineSize: `${usage.progress * 100}%` }}
        >
          {usage.cost}
        </div>
      </div>
      <TextView textStyle="meta1" textColor="secondary" as="span">
        {usage.credit}
      </TextView>
    </div>
  );
}

/**
 * The single screen: the vehicle's name, then one row per function with its state on the left and
 * the button that changes it on the right, then lock state and data age, and the API spend.
 */
export function HomeScreen() {
  const { snapshot, refreshing, running, now } = useHud();
  const i18n = useI18n();
  const { t } = i18n;
  const status = snapshot?.status ?? null;
  const view = status ? toStatusView(status, snapshot?.usage ?? null, now, i18n) : null;
  const actions = new Map<QuickActionKey, QuickAction>(
    toQuickActions(snapshot?.capabilities ?? [], status, i18n).map((action) => [action.key, action]),
  );

  let statusLine = view?.updated ?? t.status.noData;
  if (refreshing) statusLine = t.status.refreshing;
  if (running) statusLine = running.phase === 'waking' ? t.commandHints.waking : t.commandHints.sending;

  const rows: Row[] = view
    ? [
        {
          key: 'climate',
          state: (
            <State value={view.cabin}>
              <Detail>{view.climate}</Detail>
            </State>
          ),
          keepWithoutAction: false,
        },
        {
          key: 'trunk',
          state: null,
          keepWithoutAction: false,
        },
        {
          key: 'guard',
          state: (
            <State>
              <Detail>{view.guard}</Detail>
            </State>
          ),
          keepWithoutAction: false,
        },
        {
          key: 'charge',
          state: (
            <State value={view.battery}>
              {status?.charging && (
                <ProgressIndicator
                  className={styles.stateFill}
                  value={view.batteryProgress}
                  size={ProgressIndicatorSize.THIN}
                  aria-label={view.batteryLabel}
                />
              )}
              {view.chargingValue && (
                <Detail>{[view.chargingValue, view.chargingDetail].filter(Boolean).join(' · ')}</Detail>
              )}
            </State>
          ),
          keepWithoutAction: true,
        },
      ]
    : [];

  return (
    <main className={styles.home} aria-label={t.home.label}>
      <TextView className={styles.name} textStyle="heading2" as="h1">
        {view?.name}
      </TextView>

      <nav className={styles.panel} aria-label={t.home.actions}>
        {rows
          .filter((row) => row.keepWithoutAction || actions.has(row.key))
          .map((row) => {
            const action = actions.get(row.key);
            if (row.key === 'climate' && action && status) {
              return (
                <ClimateRow
                  key={row.key}
                  status={status}
                  action={action}
                  canSetTemp={snapshot?.capabilities.includes('climate.setTemp') ?? false}
                  state={row.state}
                  renderTarget={(value, label) => (
                    <State value={value}>
                      <Detail>{label}</Detail>
                    </State>
                  )}
                />
              );
            }
            return (
              <div key={row.key} className={styles.row}>
                {row.state ?? <span />}
                {action ? <ActionButton action={action} /> : <span />}
              </div>
            );
          })}
      </nav>

      <footer className={styles.footer}>
        <TextView textStyle="meta1" textColor="secondary" role="status" as="p">
          {[view?.lock, view?.badge, statusLine].filter(Boolean).join(' · ')}
        </TextView>
        {view?.usage && <SpendBar usage={view.usage} />}
      </footer>
    </main>
  );
}
