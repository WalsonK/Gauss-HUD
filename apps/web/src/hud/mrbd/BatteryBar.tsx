import { ProgressIndicator, TextView } from '@wearables-ui-toolkit/mrbd';
import type { StatusView } from '../../core/view/status.ts';
import styles from './hud.module.css';

/** Battery as a compact header, like a phone's: level, fill bar, and the charging session if any. */
export function BatteryBar({
  battery,
  batteryProgress,
  batteryLabel,
  chargingValue,
  chargingDetail,
}: Pick<StatusView, 'battery' | 'batteryProgress' | 'batteryLabel' | 'chargingValue' | 'chargingDetail'>) {
  const charge = [chargingValue, chargingDetail].filter(Boolean).join(' · ');
  return (
    <div className={styles.battery}>
      <TextView textStyle="heading1" aria-hidden as="span">
        {battery}
      </TextView>
      <ProgressIndicator className={styles.batteryFill} value={batteryProgress} aria-label={batteryLabel} />
      {charge && (
        <TextView textStyle="body2" textColor="secondary" as="span">
          {charge}
        </TextView>
      )}
    </div>
  );
}
