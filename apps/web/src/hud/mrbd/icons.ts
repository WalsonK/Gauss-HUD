import type { IconSource } from '@wearables-ui-toolkit/mrbd';

// Original icons drawn for this project (24×24 grid). No third-party artwork: they follow the symbols
// drivers already know from their car's phone app (fan, car with the trunk open, watching eye, bolt).
// Quick actions are filled, because thin strokes shimmer on the glasses' see-through display.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const fill = { fill: 'currentColor', fillRule: 'evenodd' } as const;
const icon = (...d: string[]): IconSource => ({
  viewBox: '0 0 24 24',
  paths: d.map((path) => ({ d: path, ...stroke })),
});
const solid = (...d: string[]): IconSource => ({
  viewBox: '0 0 24 24',
  paths: d.map((path) => ({ d: path, ...fill })),
});
/** Circle as a path, for `solid` shapes. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/** Climate: a three-blade fan around its hub. */
export const fanIcon = solid(
  'M11 9.7C9 7.2 9.4 2.6 12.8 2.2C16.2 1.8 16.8 5.6 13.4 9.6Z',
  'M14.5 12.3C17.7 11.8 21.4 14.4 20.1 17.6C18.7 20.7 15.1 19.4 13.4 14.4Z',
  'M10.5 14C9.3 17 5.2 19 3.1 16.2C1.1 13.5 4.1 11 9.2 12Z',
  circle(12, 12, 1.6),
);
/** Trunk: the car in profile with its trunk lid raised. */
export const trunkIcon = solid(
  'M1.5 16.5V13.8Q1.5 12.6 2.7 12.3L6.6 11.4L9.4 8.1Q9.9 7.5 10.8 7.5H14.8Q15.6 7.5 16 8.1L18 11.4V12.6H22.5V16.5H21.2A2.6 2.6 0 0 0 16 16.5H9A2.6 2.6 0 0 0 3.8 16.5Z',
  'M18.3 10.9L21.6 7.1Q22.1 6.6 22.6 7.1L23 7.5Q23.4 8 22.9 8.5L19.6 12.2Z',
  circle(6.4, 16.9, 1.9),
  circle(18.6, 16.9, 1.9),
);
/** Guard mode: a watching eye (ring and pupil). */
export const guardIcon = solid(`${circle(12, 12, 9)}${circle(12, 12, 6.8)}`, circle(12, 12, 3.4));
/** Charge port or charging: a bolt. */
export const boltIcon = solid('M13.8 2L4.8 13.6H11L9.8 22L19.2 10.2H13Z');
export const lockIcon = {
  viewBox: '0 0 24 24',
  paths: [
    { d: 'M5 12a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z', ...fill },
    { d: 'M8 11V8a4 4 0 0 1 8 0v3', ...stroke },
  ],
} satisfies IconSource;
export const lockOpenIcon = {
  viewBox: '0 0 24 24',
  paths: [
    { d: 'M5 12a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z', ...fill },
    { d: 'M8 11V8a4 4 0 0 1 7.5-2', ...stroke },
  ],
} satisfies IconSource;
export const chevronUpIcon = icon('M6 15l6-6 6 6');
export const chevronDownIcon = icon('M6 9l6 6 6-6');
