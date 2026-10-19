import { COMMAND_VALUES, type VehicleStatus } from '@gauss-hud/shared';
import { IsolatedControl, Toast } from '@wearables-ui-toolkit/mrbd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHud, useI18n } from '../../core/hud.tsx';
import type { QuickAction } from '../../core/view/commands.ts';
import { formatTemp } from '../../core/view/status.ts';
import { ActionButton } from './ActionButton.tsx';
import { fanIcon } from './icons.ts';
import styles from './hud.module.css';

const RANGE = COMMAND_VALUES['climate.setTemp'] ?? { min: 16, max: 28, step: 0.5 };
/** Quiet time after the last step before the target is sent: one command per adjustment. */
const SEND_DELAY_MS = 1500;
/** Matches the width of the action buttons. */
const WIDTH = 220;

const snap = (value: number) =>
  Math.min(RANGE.max, Math.max(RANGE.min, RANGE.min + Math.round((value - RANGE.min) / RANGE.step) * RANGE.step));

interface Props {
  status: VehicleStatus;
  action: QuickAction;
  canSetTemp: boolean;
  /** The row's state when not adjusting (cabin temperature and climate state). */
  state: ReactNode;
  /** Renders the target while adjusting, in the same layout as `state`. */
  renderTarget: (value: string, label: string) => ReactNode;
}

/**
 * Climate row. A tap turns climate on or off; a long press turns the button into a value control:
 * swipe left or right to step the target temperature, like the volume. The target is sent once,
 * after the swipes stop. Enter, or moving focus away, closes the control.
 */
export function ClimateRow({ status, action, canSetTemp, state, renderTarget }: Props) {
  const { send } = useHud();
  const i18n = useI18n();
  const { t } = i18n;
  const row = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Target being adjusted; null when the control is closed. */
  const [draft, setDraft] = useState<number | null>(null);
  /** After a close by Enter, focus goes back to the button (moving away keeps it where it went). */
  const refocus = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const open = draft !== null;
  useEffect(() => {
    if (!open && !refocus.current) return;
    refocus.current = false;
    row.current?.querySelector<HTMLElement>('[data-uit-interactable]')?.focus();
  }, [open]);

  const change = (raw: number) => {
    const value = snap(raw);
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (value === status.targetTempC) return;
      void send('climate.setTemp', { value }).then((outcome) => {
        Toast.show(outcome === 'busy' ? t.commandHints.busy : t.outcome[outcome]);
      });
    }, SEND_DELAY_MS);
  };

  const close = (backToButton: boolean) => {
    refocus.current = backToButton;
    setDraft(null);
  };

  const target = status.targetTempC;
  const label = open ? `${t.status.target} ${formatTemp(draft, i18n)}` : '';

  return (
    <div ref={row} className={styles.row}>
      {open ? renderTarget(formatTemp(draft, i18n), t.status.target) : state}
      {open ? (
        <IsolatedControl
          icon={fanIcon}
          minimumValue={RANGE.min}
          maximumValue={RANGE.max}
          value={draft}
          incrementPercentage={RANGE.step / (RANGE.max - RANGE.min)}
          onValueChanged={change}
          onClick={() => {
            close(true);
          }}
          onBlur={() => {
            close(false);
          }}
          aria-label={label}
          style={{ inlineSize: WIDTH }}
        />
      ) : (
        <ActionButton
          action={action}
          onLongPress={
            canSetTemp && target !== null
              ? () => {
                  setDraft(snap(target));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
