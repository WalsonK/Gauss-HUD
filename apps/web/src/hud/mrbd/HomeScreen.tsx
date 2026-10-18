import { IconImage, TextView } from '@wearables-ui-toolkit/mrbd';
import { useHud, useI18n } from '../../core/hud.tsx';
import { toQuickActions } from '../../core/view/commands.ts';
import { toStatusView } from '../../core/view/status.ts';
import { BatteryRing } from './BatteryRing.tsx';
import { lockIcon, lockOpenIcon } from './icons.ts';
import { QuickActions } from './QuickActions.tsx';
import { UsageBar } from './UsageBar.tsx';
import styles from './hud.module.css';

/** The single screen: API credit on top, vehicle at a glance, quick actions, then lock state and data age. */
export function HomeScreen() {
  const { snapshot, refreshing, running, now } = useHud();
  const i18n = useI18n();
  const { t } = i18n;
  const status = snapshot?.status ?? null;
  const view = status ? toStatusView(status, snapshot?.usage ?? null, now, i18n) : null;
  const actions = toQuickActions(snapshot?.capabilities ?? [], status, i18n);

  let statusLine = view?.updated ?? t.status.noData;
  if (refreshing) statusLine = t.status.refreshing;
  if (running) statusLine = running.phase === 'waking' ? t.commandHints.waking : t.commandHints.sending;

  return (
    <main className={styles.home} aria-label={t.home.label}>
      <UsageBar usage={view?.usage ?? null} badge={view?.badge ?? null} />

      <section className={styles.glance}>
        <div className={styles.side}>
          <TextView textStyle="heading1" as="p">
            {view?.cabin ?? '—'}
          </TextView>
          <TextView textStyle="body2" textColor="secondary" as="p">
            {view?.climate}
          </TextView>
        </div>
        {view && <BatteryRing progress={view.batteryProgress} value={view.battery} label={view.batteryLabel} />}
        <div className={`${styles.side} ${styles.sideEnd}`}>
          <TextView textStyle="heading1" as="p">
            {view?.range ?? '—'}
          </TextView>
          <TextView textStyle="body2" textColor="secondary" as="p">
            {view?.chargingValue}
          </TextView>
          {view?.chargingDetail && (
            <TextView textStyle="body2" textColor="secondary" as="p">
              {view.chargingDetail}
            </TextView>
          )}
        </div>
      </section>

      <nav aria-label={t.home.actions}>
        <QuickActions actions={actions} />
      </nav>

      <div className={styles.statusLine}>
        {status && (
          <>
            <IconImage source={status.locked ? lockIcon : lockOpenIcon} className={styles.statusIcon} />
            <TextView textStyle="meta1" textColor="secondary" as="span">
              {view?.lock} ·
            </TextView>
          </>
        )}
        <TextView textStyle="meta1" textColor="secondary" role="status" as="span">
          {statusLine}
        </TextView>
      </div>
    </main>
  );
}
