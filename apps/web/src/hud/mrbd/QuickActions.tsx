import { Button, ButtonRail, Toast, type IconSource } from '@wearables-ui-toolkit/mrbd';
import { useNavigate } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import type { QuickAction, QuickActionKey } from '../../core/view/commands.ts';
import { boltIcon, fanIcon, guardIcon, lockIcon, lockOpenIcon, plugIcon, trunkIcon } from './icons.ts';

function iconFor(action: QuickAction, locked: boolean): IconSource {
  const icons: Record<QuickActionKey, IconSource> = {
    lock: locked ? lockIcon : lockOpenIcon,
    trunk: trunkIcon,
    guard: guardIcon,
    chargePort: plugIcon,
    climate: fanIcon,
    charging: boltIcon,
  };
  return icons[action.key];
}

/** Row of round buttons, left to right as in the phone app; the rail scrolls to the last ones. */
export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  const { snapshot, running, send } = useHud();
  const { t } = useI18n();
  const navigate = useNavigate();
  const locked = snapshot?.status?.locked ?? false;

  const activate = async (action: QuickAction) => {
    if (running) {
      Toast.show(t.commandHints.busy);
      return;
    }
    if (action.done) {
      Toast.show(t.commandHints.alreadyLocked);
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
          icon={iconFor(action, locked)}
          showIconActiveIndicator={action.active}
          ariaLabel={action.label}
          tooltipText={action.label}
          onClick={() => void activate(action)}
        />
      ))}
    </ButtonRail>
  );
}
