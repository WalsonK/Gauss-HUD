import { VehicleCommandSchema } from '@gauss-hud/shared';
import { Toast } from '@wearables-ui-toolkit/mrbd';
import { useReactRouterNavigation } from '@wearables-ui-toolkit/mrbd/react-router';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import { DigitWheel } from './DigitWheel.tsx';

/** PIN route for protected commands (rear trunk). System Back returns to the commands. */
export function PinScreen() {
  const parsed = VehicleCommandSchema.safeParse(useParams().command);
  const { running, send } = useHud();
  const { t } = useI18n();
  const { navigateBack } = useReactRouterNavigation();
  const [notice, setNotice] = useState<string | null>(null);
  // Remounting the wheel clears the digits after a wrong PIN.
  const [attempt, setAttempt] = useState(0);

  if (!parsed.success) return <Navigate to="/" replace />;
  const command = parsed.data;

  const submit = async (pin: string) => {
    setNotice(null);
    const outcome = await send(command, pin);
    if (outcome === 'wrong_pin') {
      setNotice(t.outcome.wrong_pin);
      setAttempt((n) => n + 1);
      return;
    }
    Toast.show(outcome === 'busy' ? t.commandHints.busy : t.outcome[outcome]);
    navigateBack();
  };

  const pendingLabel = running ? (running.phase === 'waking' ? t.commandHints.waking : t.commandHints.sending) : null;

  return (
    <DigitWheel
      key={attempt}
      title={t.pin.title}
      subtitle={t.commands[command]}
      submitLabel={t.pin.validate}
      pendingLabel={pendingLabel}
      notice={notice}
      onSubmit={(pin) => void submit(pin)}
    />
  );
}
