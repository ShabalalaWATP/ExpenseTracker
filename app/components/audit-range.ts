export function auditMonthRange(month: string): {
  startDate: string;
  endDate: string;
} {
  const [year, monthNumber] = month.split("-").map(Number);
  const finalDay = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(8, 10);
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${finalDay}`,
  };
}
