export function formatMoney(pence: number | undefined): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((Number.isFinite(pence) ? pence ?? 0 : 0) / 100);
}

export function formatCurrencyMinor(
  minor: number | null | undefined,
  currency = "GBP",
  minorUnitDigits = 2,
): string {
  if (!Number.isFinite(minor)) return "Not available";
  const digits = Number.isInteger(minorUnitDigits)
    ? Math.min(6, Math.max(0, minorUnitDigits))
    : 2;
  const safeCurrency = currency.toUpperCase();
  const amount = (minor ?? 0) / 10 ** digits;
  if (!/^[A-Z]{3}$/.test(safeCurrency)) {
    return `${safeCurrency || "Currency"} ${amount.toFixed(digits)}`;
  }
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(digits)}`;
  }
}

export function countryName(countryCode: string | null | undefined): string {
  if (!countryCode) return "Country not provided";
  try {
    return (
      new Intl.DisplayNames(["en-GB"], { type: "region" }).of(
        countryCode.toUpperCase(),
      ) ?? countryCode.toUpperCase()
    );
  } catch {
    return countryCode.toUpperCase();
  }
}

export function parsePence(value: string): number {
  const normalised = value.trim().replace(/[£,\s]/g, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalised)) return Number.NaN;
  const [pounds, decimal = ""] = normalised.split(".");
  return Number(pounds) * 100 + Number(decimal.padEnd(2, "0"));
}

export function penceInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function localDate(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish && dates.length < 93) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
