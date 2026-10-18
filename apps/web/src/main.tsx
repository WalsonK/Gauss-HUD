import { isMockScenario } from '@gauss-hud/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HudProvider } from './core/hud.tsx';
import { createI18n, pickLocale } from './core/i18n/index.ts';
import { MOCK_PAIRING_CODE, MOCK_PIN, MockHudClient } from './core/mockClient.ts';
import { MrbdHud } from './hud/mrbd/MrbdHud.tsx';

// Phase 1a: the HUD runs on an in-browser mock. An HTTP client against the API replaces it later.
const scenario: unknown = import.meta.env.VITE_MOCK_SCENARIO;
const client = new MockHudClient(isMockScenario(scenario) ? { scenario } : {});
console.info(`[mock] pairing code ${MOCK_PAIRING_CODE}, trunk PIN ${MOCK_PIN}`);

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
