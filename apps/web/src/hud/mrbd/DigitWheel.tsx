import { Button, TextView } from '@wearables-ui-toolkit/mrbd';
import { useState } from 'react';
import { emptyDigits, stepDigit, toCode } from '../../core/digits.ts';
import { useI18n } from '../../core/hud.tsx';
import { chevronDownIcon, chevronUpIcon } from './icons.ts';
import styles from './hud.module.css';

interface Props {
  title: string;
  subtitle?: string;
  submitLabel: string;
  /** Shown on the submit button while the code is being checked. */
  pendingLabel?: string | null;
  notice?: string | null;
  onSubmit: (code: string) => void;
}

/**
 * Six digit wheels built only from toolkit buttons: arrows move focus between ▲ and ▼ (and across
 * columns), Enter turns the wheel. No key interception, so it works with the device's own
 * directional navigation. Codes are never typed or dictated through the composer.
 */
export function DigitWheel({ title, subtitle, submitLabel, pendingLabel, notice, onSubmit }: Props) {
  const { t } = useI18n();
  const [digits, setDigits] = useState(emptyDigits);
  const pending = Boolean(pendingLabel);

  const turn = (index: number, delta: 1 | -1) => {
    setDigits((current) => stepDigit(current, index, delta));
  };

  return (
    <div className={styles.screen}>
      <TextView textStyle="heading2" as="h1">
        {title}
      </TextView>
      {subtitle && (
        <TextView textStyle="body2" textColor="secondary" as="p">
          {subtitle}
        </TextView>
      )}
      <div className={styles.wheel}>
        {digits.map((digit, index) => {
          const position = index + 1;
          return (
            <div key={position} className={styles.wheelColumn}>
              <Button
                icon={chevronUpIcon}
                ariaLabel={t.wheel.increase(position)}
                disabled={pending}
                onClick={() => {
                  turn(index, 1);
                }}
              />
              <TextView
                className={styles.wheelDigit}
                textStyle="numeral2"
                aria-label={t.wheel.digit(position, digit)}
                as="span"
              >
                {digit}
              </TextView>
              <Button
                icon={chevronDownIcon}
                ariaLabel={t.wheel.decrease(position)}
                disabled={pending}
                onClick={() => {
                  turn(index, -1);
                }}
              />
            </div>
          );
        })}
      </div>
      <Button
        title={pendingLabel ?? submitLabel}
        disabled={pending}
        onClick={() => {
          onSubmit(toCode(digits));
        }}
      />
      <TextView className={styles.notice} textStyle="meta1" role="status" as="p">
        {notice}
      </TextView>
    </div>
  );
}
