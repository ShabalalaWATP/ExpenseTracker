const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function automaticTripCalculationMethod(
  startDate: string,
  endDate: string,
): "daily" | "aggregate" {
  if (
    !ISO_DATE.test(startDate) ||
    !ISO_DATE.test(endDate) ||
    endDate < startDate
  ) {
    return "daily";
  }
  const calendarDays =
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  return calendarDays >= 3 ? "aggregate" : "daily";
}
