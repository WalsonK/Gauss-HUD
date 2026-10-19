import type { UsageSummary, VehicleStatus } from '@gauss-hud/shared';
import type { I18n } from '../i18n/index.ts';

/** Display-ready strings for the status screen; any HUD can lay them out its own way. */
export interface StatusView {
  /** The vehicle's own name; null when the vehicle API has none. */
  readonly name: string | null;
  /** Battery level from 0 to 1, for a gauge. */
  readonly batteryProgress: number;
  /** Spoken battery level, e.g. "Battery 72 %". */
  readonly batteryLabel: string;
  readonly battery: string;
  /** "Charging" / "Not charging". */
  readonly charging: string;
  /** Charging power, or whether the cable is plugged in; null when unplugged. */
  readonly chargingValue: string | null;
  readonly chargingDetail: string | null;
  readonly lock: string;
  readonly cabin: string;
  readonly climate: string;
  readonly guard: string;
  readonly updated: string;
  /** Asleep or offline: the figures come from the last read. */
  readonly badge: string | null;
  /**
   * API spend vs monthly credit: both amounts, spoken label, fill from 0 to 1, and whether it nears
   * the credit (from {@link USAGE_ALERT_RATIO}), to stand out.
   */
  readonly usage: {
    readonly cost: string;
    readonly credit: string;
    readonly label: string;
    readonly progress: number;
    readonly alert: boolean;
  } | null;
}

/** Share of the monthly credit from which the API spend is worth flagging. */
export const USAGE_ALERT_RATIO = 0.8;

/** A temperature as shown, e.g. "21,5 °C". */
export function formatTemp(celsius: number, { locale }: I18n): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(celsius)} °C`;
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
  let chargingValue: string | null = null;
  if (charging) chargingValue = `${number(charging.powerKw, 1)} kW`;
  else if (status.pluggedIn) chargingValue = t.status.pluggedIn;
  const chargingDetail = charging?.endsAt ? t.status.chargingEnds(time(charging.endsAt)) : null;

  const battery = `${number(status.batteryPercent)} %`;
  let usageView: StatusView['usage'] = null;
  if (usage) {
    const cost = money(usage.monthCost, usage.currency);
    const credit = money(usage.monthlyCredit, usage.currency);
    const progress = usage.monthlyCredit > 0 ? Math.min(1, usage.monthCost / usage.monthlyCredit) : 1;
    usageView = {
      cost,
      credit,
      label: t.status.usageLabel(cost, credit),
      progress,
      alert: progress >= USAGE_ALERT_RATIO,
    };
  }

  return {
    name: status.name,
    batteryProgress: status.batteryPercent / 100,
    batteryLabel: t.status.batteryLevel(battery),
    battery,
    charging: charging ? t.status.charging : t.status.notCharging,
    chargingValue,
    chargingDetail,
    lock: status.locked ? t.status.locked : t.status.unlocked,
    cabin: status.cabinTempC === null ? '—' : formatTemp(status.cabinTempC, i18n),
    climate: status.climateOn ? t.status.climateOn : t.status.climateOff,
    guard: status.guardOn ? t.status.guardOn : t.status.guardOff,
    updated: formatUpdated(status.updatedAt, now, i18n),
    badge: status.connection === 'asleep' ? t.status.asleep : status.connection === 'offline' ? t.status.offline : null,
    usage: usageView,
  };
}
