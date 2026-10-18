import { CircularProgressBar, TextView } from '@wearables-ui-toolkit/mrbd';
import styles from './hud.module.css';

const SIZE = 200;
// An SVG arc can't start and end on the same point: stop 2° short of a full turn (the round caps close it).
const START_DEG = 271;
const END_DEG = 629;

interface Props {
  progress: number;
  /** Battery level as displayed, e.g. "72 %". */
  value: string;
  label: string;
}

/** Battery as a full ring filling clockwise from the top, with the level in the middle. */
export function BatteryRing({ progress, value, label }: Props) {
  return (
    <div className={styles.ring} role="img" aria-label={label}>
      <CircularProgressBar
        progress={progress}
        size={SIZE}
        strokeWidthPx={14}
        startAngleDegrees={START_DEG}
        endAngleDegrees={END_DEG}
        aria-hidden
      />
      <TextView className={styles.ringValue} textStyle="numeral2" aria-hidden as="span">
        {value}
      </TextView>
    </div>
  );
}
