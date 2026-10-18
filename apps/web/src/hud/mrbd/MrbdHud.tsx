import { App } from '@wearables-ui-toolkit/mrbd';
import { ReactRouterNavigationProvider, ReactRouterPageTransition } from '@wearables-ui-toolkit/mrbd/react-router';
import { useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useHud } from '../../core/hud.tsx';
import { useFocusSafetyNet } from './focus.ts';
import { HomeScreen } from './HomeScreen.tsx';
import { PairingScreen } from './PairingScreen.tsx';
import { PinScreen } from './PinScreen.tsx';
import './global.css';

function Screens() {
  const { phase } = useHud();
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusSafetyNet(rootRef);

  return (
    <div id="hud" ref={rootRef}>
      {phase === 'pairing' && <PairingScreen />}
      {phase === 'ready' && (
        <ReactRouterPageTransition>
          {({ location }) => (
            <Routes location={location}>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/pin/:command" element={<PinScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </ReactRouterPageTransition>
      )}
    </div>
  );
}

/** Meta Ray-Ban Display front end. Everything toolkit-specific stays in this folder. */
export function MrbdHud() {
  return (
    <BrowserRouter>
      <ReactRouterNavigationProvider>
        <App>
          <Screens />
        </App>
      </ReactRouterNavigationProvider>
    </BrowserRouter>
  );
}
