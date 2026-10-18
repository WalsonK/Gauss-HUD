import { Button, ButtonRail, Toast, type IconSource } from '@wearables-ui-toolkit/mrbd';
import { useNavigate } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import type { QuickAction, QuickActionKey } from '../../core/view/commands.ts';
import { boltIcon, fanIcon, guardIcon, plugIcon, trunkIcon } from './icons.ts';

const ICONS: Record<QuickActionKey, IconSource> = {
  trunk: trunkIcon,
  guard: guardIcon,
  chargePort: plugIcon,
  climate: fanIcon,
  charging: boltIcon,
};

/** Row of round buttons, left to right as in the phone app; the rail scrolls to the last ones. */
export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
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
          showIconActiveIndicator={action.active}
          ariaLabel={action.label}
          tooltipText={action.label}
          onClick={() => void activate(action)}
        />
      ))}
    </ButtonRail>
  );
}
