import { CircularProgressBar, IconImage } from '@wearables-ui-toolkit/mrbd';
import { carIcon } from './icons.ts';
import styles from './hud.module.css';

const SIZE = 200;
// An SVG arc can't start and end on the same point: stop 2° short of a full turn (the round caps close it).
const START_DEG = 271;
const END_DEG = 629;

/** Battery as a full ring filling clockwise from the top, with the car in the middle (no number). */
export function BatteryRing({ progress, label }: { progress: number; label: string }) {
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
      <IconImage source={carIcon} className={styles.ringIcon} />
    </div>
  );
}
