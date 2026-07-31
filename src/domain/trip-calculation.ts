const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function canAggregateTrip(
  startDate: string,
  endDate: string,
  countryCodes: readonly string[] = [],
): boolean {
  if (
    !ISO_DATE.test(startDate) ||
    !ISO_DATE.test(endDate) ||
    endDate < startDate
  ) {
    return false;
  }
  const countries = new Set(
    countryCodes
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean),
  );
  if (
    countries.size > 1 ||
    (countries.size === 1 && !countries.has("GB"))
  ) {
    return false;
  }
  const nights = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
  return nights >= 2;
}

export function automaticTripCalculationMethod(
  startDate: string,
  endDate: string,
  countryCodes: readonly string[] = [],
): "daily" | "aggregate" {
  return canAggregateTrip(startDate, endDate, countryCodes)
    ? "aggregate"
    : "daily";
}
