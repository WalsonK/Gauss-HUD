import {
  ActionHint,
  Chip,
  ChipStyle,
  Container,
  MaterialLibrary,
  TextView,
  VisualState,
} from '@wearables-ui-toolkit/mrbd';
import { useState } from 'react';
import { useHud, useI18n } from '../../core/hud.tsx';
import { toStatusView } from '../../core/view/status.ts';
import styles from './hud.module.css';

function Figure({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div>
      <TextView textStyle="meta1" textColor="secondary" as="h2">
        {label}
      </TextView>
      <TextView textStyle="heading1" as="p">
        {value}
      </TextView>
      {detail && (
        <TextView textStyle="body2" textColor="secondary" as="p">
          {detail}
        </TextView>
      )}
    </div>
  );
}

/** Screen 1: one focusable page; Enter asks for a fresh read (only if the car is awake). */
export function StatusPage() {
  const { snapshot, refreshing, refresh, now } = useHud();
  const i18n = useI18n();
  const { t } = i18n;
  // No background: the 600×600 display is the frame. One material instance per Container.
  const [material] = useState(() => MaterialLibrary.unbounded());
  const status = snapshot?.status;
  const view = status ? toStatusView(status, snapshot.usage, now, i18n) : null;

  return (
    <div className={styles.page}>
      {view?.badge && (
        <div className={styles.badge}>
          <Chip text={view.badge} chipStyle={ChipStyle.ELEVATED} />
        </div>
      )}
      {/* The page keeps focus: visual state frozen so it shows neither background nor outline. */}
      <Container
        width="100%"
        height="100%"
        material={material}
        clipContent={false}
        visualStateOverride={VisualState.NONE}
        ariaLabel={t.status.ariaLabel}
        onClick={() => void refresh()}
      >
        <div className={styles.pageInner}>
          {view ? (
            <>
              <div className={styles.grid2}>
                <Figure label={t.status.battery} value={view.battery} />
                <Figure label={t.status.range} value={view.range} />
                <Figure label={view.charging} value={view.chargingValue} detail={view.chargingDetail} />
                <Figure label={t.status.cabin} value={view.cabin} detail={view.climate} />
              </div>
              <TextView textStyle="body1-emphasized" as="p">
                {view.lock}
              </TextView>
              <div className={styles.footer}>
                <TextView textStyle="meta1" textColor="secondary" as="p">
                  {refreshing ? t.status.refreshing : view.updated}
                </TextView>
                {view.cost && (
                  <TextView textStyle="meta1" textColor="secondary" as="p">
                    {view.cost}
                  </TextView>
                )}
              </div>
            </>
          ) : (
            <TextView textStyle="body1" textColor="secondary" as="p">
              {refreshing ? t.status.refreshing : t.status.noData}
            </TextView>
          )}
          <div className={styles.hint}>
            <ActionHint text={t.status.refreshHint} />
          </div>
        </div>
      </Container>
    </div>
  );
}
