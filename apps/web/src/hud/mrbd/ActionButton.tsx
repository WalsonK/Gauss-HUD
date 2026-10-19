import { Button, Toast, type IconSource } from '@wearables-ui-toolkit/mrbd';
import { useNavigate } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import type { QuickAction, QuickActionKey } from '../../core/view/commands.ts';
import { boltIcon, fanIcon, guardIcon, trunkIcon } from './icons.ts';

const ICONS: Record<QuickActionKey, IconSource> = {
  climate: fanIcon,
  trunk: trunkIcon,
  guard: guardIcon,
  charge: boltIcon,
};

/** Every button has the same width, so the column of pills lines up. */
const WIDTH = 220;

/** A long button with its icon and what it does ("Turn on"), next to the state it changes. */
export function ActionButton({ action, onLongPress }: { action: QuickAction; onLongPress?: () => void }) {
  const { running, send } = useHud();
  const { t } = useI18n();
  const navigate = useNavigate();

  const activate = async () => {
    if (running) {
      Toast.show(t.commandHints.busy);
      return;
    }
    if (action.needsPin) {
      void navigate(`/pin/${action.command}`);
      return;
    }
    const outcome = await send(action.command);
    Toast.show(outcome === 'busy' ? t.commandHints.busy : t.outcome[outcome]);
  };

  return (
    <Button
      icon={ICONS[action.key]}
      title={action.title}
      alwaysShowText
      width={WIDTH}
      showIconActiveIndicator={action.active}
      ariaLabel={action.label}
      onClick={() => void activate()}
      onLongPress={onLongPress}
    />
  );
}
