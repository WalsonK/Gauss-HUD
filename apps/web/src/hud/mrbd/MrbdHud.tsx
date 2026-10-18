import { App, SubNavigationPager, type SubNavigationItem } from '@wearables-ui-toolkit/mrbd';
import { ReactRouterNavigationProvider, ReactRouterPageTransition } from '@wearables-ui-toolkit/mrbd/react-router';
import { useMemo, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useHud, useI18n } from '../../core/hud.tsx';
import { CommandsPage } from './CommandsPage.tsx';
import { refocusAfterChange, useFocusSafetyNet } from './focus.ts';
import { gaugeIcon, slidersIcon } from './icons.ts';
import { PairingScreen } from './PairingScreen.tsx';
import { PinScreen } from './PinScreen.tsx';
import { StatusPage } from './StatusPage.tsx';
import './global.css';

interface HomePagerProps {
  pageIndex: number;
  onPageChange: (index: number) => void;
}

function HomePager({ pageIndex, onPageChange }: HomePagerProps) {
  const { t } = useI18n();
  const items = useMemo<SubNavigationItem[]>(
    () => [
      { label: t.tabs.status, icon: gaugeIcon },
      { label: t.tabs.commands, icon: slidersIcon },
    ],
    [t],
  );
  return (
    <SubNavigationPager
      items={items}
      homeIndex={0}
      currentPageIndex={pageIndex}
      onPageChange={onPageChange}
      ariaLabel={t.tabs.label}
    >
      <StatusPage />
      <CommandsPage />
    </SubNavigationPager>
  );
}

function Screens() {
  const { phase } = useHud();
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusSafetyNet(rootRef);
  // Kept above the routes so coming back from the PIN screen reopens the Commands tab.
  const [pageIndex, setPageIndex] = useState(0);
  const onPageChange = (index: number) => {
    setPageIndex(index);
    refocusAfterChange(rootRef.current);
  };

  return (
    <div id="hud" ref={rootRef}>
      {phase === 'pairing' && <PairingScreen />}
      {phase === 'ready' && (
        <ReactRouterPageTransition>
          {({ location }) => (
            <Routes location={location}>
              <Route path="/" element={<HomePager pageIndex={pageIndex} onPageChange={onPageChange} />} />
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
