export function dataAfterPeriodSelection<T>(
  data: T | null,
  currentPeriod: string,
  nextPeriod: string,
): T | null {
  return currentPeriod === nextPeriod ? data : null;
}

export function isLatestDashboardRequest(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId;
}
