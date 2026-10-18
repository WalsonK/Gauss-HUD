/** Pairing codes and PINs are both entered with 6 digit wheels. */
export const CODE_LENGTH = 6;

export type Digits = readonly number[];

export const emptyDigits = (length = CODE_LENGTH): Digits => Array.from({ length }, () => 0);

/** Turns one wheel by one step, wrapping 9 ↔ 0. Out-of-range indexes leave the code unchanged. */
export function stepDigit(digits: Digits, index: number, delta: 1 | -1): Digits {
  const current = digits[index];
  if (current === undefined) return digits;
  return digits.map((d, i) => (i === index ? (current + delta + 10) % 10 : d));
}

export const toCode = (digits: Digits): string => digits.join('');
