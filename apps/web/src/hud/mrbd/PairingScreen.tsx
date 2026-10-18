import { useState } from 'react';
import type { PairResult } from '../../core/client.ts';
import { useHud, useI18n } from '../../core/hud.tsx';
import { DigitWheel } from './DigitWheel.tsx';

/** Screen 0: first launch. The single-use code is generated on the server. */
export function PairingScreen() {
  const { pair } = useHud();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Exclude<PairResult, 'ok'> | null>(null);

  const submit = async (code: string) => {
    setPending(true);
    const outcome = await pair(code);
    setPending(false);
    if (outcome !== 'ok') setResult(outcome);
  };

  return (
    <DigitWheel
      title={t.pairing.title}
      subtitle={t.pairing.hint}
      submitLabel={t.pairing.validate}
      pendingLabel={pending ? t.pairing.checking : null}
      notice={result === 'invalid' ? t.pairing.invalid : result === 'too_many' ? t.pairing.tooMany : null}
      onSubmit={(code) => void submit(code)}
    />
  );
}
