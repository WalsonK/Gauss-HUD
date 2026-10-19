import { isMockScenario } from '@gauss-hud/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HudProvider } from './core/hud.tsx';
import type { HudClient } from './core/client.ts';
import { HttpHudClient } from './core/httpClient.ts';
import { createI18n, pickLocale } from './core/i18n/index.ts';
import { MOCK_PAIRING_CODE, MOCK_PIN, MockHudClient } from './core/mockClient.ts';
import { MrbdHud } from './hud/mrbd/MrbdHud.tsx';

// The API by default; VITE_MOCK_SCENARIO runs the HUD alone on an in-browser mock instead.
const scenario: unknown = import.meta.env.VITE_MOCK_SCENARIO;
let client: HudClient;
if (isMockScenario(scenario)) {
  client = new MockHudClient({ scenario });
  console.info(`[mock] pairing code ${MOCK_PAIRING_CODE}, trunk PIN ${MOCK_PIN}`);
} else {
  client = new HttpHudClient();
}

const i18n = createI18n(pickLocale(navigator.languages));
document.documentElement.lang = i18n.locale;

const mount = document.getElementById('root');
if (!mount) throw new Error('Missing #root element');

// The display is chosen here: another HUD would only swap this component.
createRoot(mount).render(
  <StrictMode>
    <HudProvider client={client} i18n={i18n}>
      <MrbdHud />
    </HudProvider>
  </StrictMode>,
);
