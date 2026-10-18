import type { UsageSummary, VehicleStatus } from '@gauss-hud/shared';
import type { I18n } from '../i18n/index.ts';

/** Display-ready strings for the status screen; any HUD can lay them out its own way. */
export interface StatusView {
  readonly battery: string;
  readonly range: string;
  /** "Charging" / "Not charging". */
  readonly charging: string;
  /** Charging power, or whether the cable is plugged in. */
  readonly chargingValue: string;
  readonly chargingDetail: string | null;
  readonly lock: string;
  readonly cabin: string;
  readonly climate: string;
  readonly updated: string;
  /** Asleep or offline: the figures come from the last read. */
  readonly badge: string | null;
  readonly cost: string | null;
}

export function formatUpdated(updatedAt: string, now: number, { t }: I18n): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000));
  if (minutes < 1) return t.status.updatedJustNow;
  if (minutes < 120) return t.status.updatedMinutes(minutes);
  return t.status.updatedHours(Math.floor(minutes / 60));
}

export function toStatusView(status: VehicleStatus, usage: UsageSummary | null, now: number, i18n: I18n): StatusView {
  const { locale, t } = i18n;
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(Date.parse(iso));
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);

  const { charging } = status;
  let chargingValue = '—';
  if (charging) chargingValue = `${number(charging.powerKw, 1)} kW`;
  else if (status.pluggedIn) chargingValue = t.status.pluggedIn;
  const chargingDetail = charging?.endsAt ? t.status.chargingEnds(time(charging.endsAt)) : null;

  return {
    battery: `${number(status.batteryPercent)} %`,
    range: `${number(status.rangeKm)} km`,
    charging: charging ? t.status.charging : t.status.notCharging,
    chargingValue,
    chargingDetail,
    lock: status.locked ? t.status.locked : t.status.unlocked,
    cabin: status.cabinTempC === null ? '—' : `${number(status.cabinTempC, 1)} °C`,
    climate: status.climateOn ? t.status.climateOn : t.status.climateOff,
    updated: formatUpdated(status.updatedAt, now, i18n),
    badge: status.connection === 'asleep' ? t.status.asleep : status.connection === 'offline' ? t.status.offline : null,
    cost: usage && t.status.cost(money(usage.monthCost, usage.currency), money(usage.monthlyCredit, usage.currency)),
  };
}
