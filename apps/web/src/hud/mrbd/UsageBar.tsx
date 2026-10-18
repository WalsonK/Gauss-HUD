import { Chip, ChipStyle, ProgressIndicator, ProgressIndicatorSize, TextView } from '@wearables-ui-toolkit/mrbd';
import type { StatusView } from '../../core/view/status.ts';
import styles from './hud.module.css';

/** Top strip: this month's API spend as a fill bar against the monthly credit, plus the asleep/offline badge. */
export function UsageBar({ usage, badge }: Pick<StatusView, 'usage' | 'badge'>) {
  return (
    <div className={styles.usage}>
      <div className={styles.usageRow}>
        <TextView textStyle="meta1" textColor="secondary" as="p">
          {usage?.text}
        </TextView>
        {badge && <Chip text={badge} chipStyle={ChipStyle.ELEVATED} />}
      </div>
      {usage && <ProgressIndicator value={usage.progress} size={ProgressIndicatorSize.THIN} aria-label={usage.label} />}
    </div>
  );
}
