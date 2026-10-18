import { Chip, ChipStyle, ProgressIndicator, ProgressIndicatorSize, TextView } from '@wearables-ui-toolkit/mrbd';
import type { StatusView } from '../../core/view/status.ts';
import styles from './hud.module.css';

/**
 * Top strip, only when something is off: the asleep/offline badge, and this month's API spend as a
 * fill bar once it nears the monthly credit. Nothing otherwise.
 */
export function UsageBar({ usage, badge }: Pick<StatusView, 'usage' | 'badge'>) {
  const spend = usage?.alert ? usage : null;
  if (!spend && !badge) return null;
  return (
    <div className={styles.usage}>
      <div className={styles.usageRow}>
        <TextView textStyle="meta1" textColor="secondary" as="p">
          {spend?.text}
        </TextView>
        {badge && <Chip text={badge} chipStyle={ChipStyle.ELEVATED} />}
      </div>
      {spend && <ProgressIndicator value={spend.progress} size={ProgressIndicatorSize.THIN} aria-label={spend.label} />}
    </div>
  );
}
