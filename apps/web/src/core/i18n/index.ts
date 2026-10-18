import { en, type Messages } from './en.ts';
import { fr } from './fr.ts';

export type { Messages } from './en.ts';

export type Locale = 'en' | 'fr';

export interface I18n {
  readonly locale: Locale;
  readonly t: Messages;
}

const MESSAGES: Record<Locale, Messages> = { en, fr };

/** French for any `fr*` preference, English otherwise. */
export function pickLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'fr' || base === 'en') return base;
  }
  return 'en';
}

export const createI18n = (locale: Locale): I18n => ({ locale, t: MESSAGES[locale] });
