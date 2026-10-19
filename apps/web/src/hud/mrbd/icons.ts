import type { IconSource } from '@wearables-ui-toolkit/mrbd';

// Original icons drawn for this project (24×24 grid). No third-party artwork: they follow the symbols
// drivers already know from their car's phone app (fan, car with the trunk open, watching eye, bolt).
// Most are filled, because thin strokes shimmer on the glasses' see-through display; the trunk stays a
// line drawing, as in that app, where a filled car would hide the open lid.
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
/** Trunk: the rear of the car in profile, its lid raised, one wheel on the ground line. */
export const trunkIcon = icon(
  'M3 7C8 7 12 8 14.2 9.2S18 11.5 18.5 12.1',
  'M14.2 9.2L18.1 5L19.9 7',
  'M18.5 12.1C21 12.8 21.6 14 20.4 15.2C19.6 16 20.8 17 19.8 17.7C19.2 18.1 18 18.2 14.9 18.2',
  'M3 18.2H9.1',
  'M9.1 18a2.9 2.9 0 1 0 5.8 0a2.9 2.9 0 1 0-5.8 0',
);
/** Guard mode: a watching eye (ring and pupil). */
export const guardIcon = solid(`${circle(12, 12, 9)}${circle(12, 12, 6.8)}`, circle(12, 12, 3.4));
/** Charge port or charging: a bolt. */
export const boltIcon = solid('M13.8 2L4.8 13.6H11L9.8 22L19.2 10.2H13Z');
export const chevronUpIcon = icon('M6 15l6-6 6 6');
export const chevronDownIcon = icon('M6 9l6 6 6-6');
