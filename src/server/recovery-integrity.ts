type IntegrityIssueCollections = {
  missing: readonly unknown[];
  sizeMismatches: readonly unknown[];
  hashMismatches: readonly unknown[];
  orphanedObjects: readonly unknown[];
};

export function evidenceIntegrityHealthy(
  report: IntegrityIssueCollections,
): boolean {
  return (
    report.missing.length === 0 &&
    report.sizeMismatches.length === 0 &&
    report.hashMismatches.length === 0 &&
    report.orphanedObjects.length === 0
  );
}
