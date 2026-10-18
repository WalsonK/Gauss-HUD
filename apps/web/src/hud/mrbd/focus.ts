import { useEffect, type RefObject } from 'react';

/** Time for a page animation to finish and `inert` attributes to settle. */
const PAGE_SETTLE_MS = 400;

const HIDDEN = '[inert], [aria-hidden="true"]';

function firstVisibleControl(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('[data-uit-interactable]')) {
    if (!el.closest(HIDDEN)) return el;
  }
  return null;
}

/** Gives focus back to the first visible control when no visible control inside `root` holds it. */
export function ensureFocus(root: HTMLElement | null): void {
  if (!root) return;
  const active = document.activeElement;
  const ok =
    active instanceof HTMLElement &&
    root.contains(active) &&
    active.matches('[data-uit-interactable]') &&
    !active.closest(HIDDEN);
  if (!ok) firstVisibleControl(root)?.focus();
}

/** Call after a page or route change: focus once the new page is painted, and again once settled. */
export function refocusAfterChange(root: HTMLElement | null): void {
  requestAnimationFrame(() => {
    ensureFocus(root);
  });
  setTimeout(() => {
    ensureFocus(root);
  }, PAGE_SETTLE_MS);
}

/**
 * Directional input only works when a control has focus. A page that becomes inert, or a control
 * that unmounts, drops it; this restores it before the key is handled (pattern proven on device).
 */
export function useFocusSafetyNet(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    refocusAfterChange(rootRef.current);
    const onKeyDown = () => {
      ensureFocus(rootRef.current);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [rootRef]);
}
