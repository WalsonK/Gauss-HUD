import type { IconSource } from '@wearables-ui-toolkit/mrbd';

// Original line icons drawn for this project (24×24 grid). No third-party artwork.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const icon = (...d: string[]): IconSource => ({
  viewBox: '0 0 24 24',
  paths: d.map((path) => ({ d: path, ...stroke })),
});

export const fanIcon = icon(
  'M12 12c0-4 1-7 4-7 2 0 3 2 1 4l-5 3',
  'M12 12c4 0 7 1 7 4 0 2-2 3-4 1l-3-5',
  'M12 12c0 4-1 7-4 7-2 0-3-2-1-4l5-3',
  'M12 12c-4 0-7-1-7-4 0-2 2-3 4-1l3 5',
);
export const boltIcon = icon('M13 3L5 14h6l-1 7 8-11h-6l1-7z');
export const plugIcon = icon('M9 3v5', 'M15 3v5', 'M6 8h12v3a6 6 0 0 1-12 0V8z', 'M12 17v4');
export const lockIcon = icon('M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3');
export const lockOpenIcon = icon('M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 7.5-2');
/** Guard mode: a shield with a watching eye. */
export const guardIcon = icon(
  'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  'M8.5 12s1.3-2 3.5-2 3.5 2 3.5 2-1.3 2-3.5 2-3.5-2-3.5-2z',
);
export const trunkIcon = icon('M3 13l2-5h14l2 5v5H3z', 'M3 13h18', 'M7 18v2', 'M17 18v2', 'M9 8l1-3h4l1 3');
export const chevronUpIcon = icon('M6 15l6-6 6 6');
export const chevronDownIcon = icon('M6 9l6 6 6-6');
