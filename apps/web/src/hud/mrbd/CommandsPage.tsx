import { ListItem, Toast, VerticalList, type IconSource } from '@wearables-ui-toolkit/mrbd';
import { useNavigate } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import { toCommandRows, type CommandRow, type CommandRowKey } from '../../core/view/commands.ts';
import { boltIcon, fanIcon, lockIcon, plugIcon, trunkIcon } from './icons.ts';

const ROW_ICON: Record<CommandRowKey, IconSource> = {
  climate: fanIcon,
  charging: boltIcon,
  chargePort: plugIcon,
  lock: lockIcon,
  trunk: trunkIcon,
};

/** Screen 2: manual commands. Progress shows on the row, the result in a toast. */
export function CommandsPage() {
  const { snapshot, running, send } = useHud();
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const rows = toCommandRows(snapshot?.capabilities ?? [], snapshot?.status ?? null, i18n);

  const activate = async (row: CommandRow) => {
    if (running) {
      Toast.show(t.commandHints.busy);
      return;
    }
    if (row.needsPin) {
      void navigate(`/pin/${row.command}`);
      return;
    }
    const outcome = await send(row.command);
    Toast.show(outcome === 'busy' ? t.commandHints.busy : t.outcome[outcome]);
  };

  const subtitle = (row: CommandRow): string | undefined => {
    if (running?.command === row.command)
      return running.phase === 'waking' ? t.commandHints.waking : t.commandHints.sending;
    return row.needsPin ? t.commandHints.pinRequired : undefined;
  };

  return (
    <VerticalList insetForHeader ariaLabel={t.tabs.commands}>
      {rows.map((row) => (
        <ListItem
          key={row.key}
          title={row.label}
          subtitle={subtitle(row)}
          icon={ROW_ICON[row.key]}
          onClick={() => void activate(row)}
        />
      ))}
    </VerticalList>
  );
}
