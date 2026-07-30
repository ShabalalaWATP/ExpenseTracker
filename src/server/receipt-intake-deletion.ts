export type ReceiptIntakeObjectKeys = {
  originalObjectKey: string;
  analysisObjectKey: string | null;
  previousAnalysisObjectKey?: string | null;
};

export type ReceiptObjectStore = {
  delete(key: string): Promise<unknown>;
};

export async function deleteReceiptIntakeAfterRecord(
  keys: ReceiptIntakeObjectKeys,
  discardRecord: () => Promise<unknown>,
  objectStore: ReceiptObjectStore,
  finalizeRecord: () => Promise<unknown> = async () => {},
): Promise<void> {
  // The database tombstone is trigger-protected by the claim-period lock and
  // retains every object key until R2 confirms deletion.
  await discardRecord();

  await Promise.all([
    objectStore.delete(keys.originalObjectKey),
    keys.analysisObjectKey
      ? objectStore.delete(keys.analysisObjectKey)
      : Promise.resolve(),
    keys.previousAnalysisObjectKey &&
    keys.previousAnalysisObjectKey !== keys.analysisObjectKey
      ? objectStore.delete(keys.previousAnalysisObjectKey)
      : Promise.resolve(),
  ]);
  await finalizeRecord();
}
