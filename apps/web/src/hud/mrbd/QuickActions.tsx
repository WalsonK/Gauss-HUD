import { Button, ButtonRail, Toast, type IconSource } from '@wearables-ui-toolkit/mrbd';
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

interface Props {
  actions: readonly QuickAction[];
  /** Short text shown on a button next to its icon, e.g. the cabin temperature on climate. */
  details?: Partial<Record<QuickActionKey, string>>;
}

/** Row of round buttons, most used first; the first one gets the focus, so it is one tap away. */
export function QuickActions({ actions, details = {} }: Props) {
  const { running, send } = useHud();
  const { t } = useI18n();
  const navigate = useNavigate();

  const activate = async (action: QuickAction) => {
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
    <ButtonRail centerContentWhenSmallerThanWidth>
      {actions.map((action) => (
        <Button
          key={action.key}
          icon={ICONS[action.key]}
          title={details[action.key]}
          alwaysShowText={Boolean(details[action.key])}
          showIconActiveIndicator={action.active}
          ariaLabel={action.label}
          tooltipText={action.label}
          onClick={() => void activate(action)}
        />
      ))}
    </ButtonRail>
  );
}
