export type ReceiptIntakeObjectKeys = {
  originalObjectKey: string;
  analysisObjectKey: string | null;
};

export type ReceiptObjectStore = {
  delete(key: string): Promise<unknown>;
};

export async function deleteReceiptIntakeAfterRecord(
  keys: ReceiptIntakeObjectKeys,
  deleteRecord: () => Promise<unknown>,
  objectStore: ReceiptObjectStore,
): Promise<void> {
  // The database delete is trigger-protected by the claim-period lock. Never
  // remove evidence until that authoritative state transition has succeeded.
  await deleteRecord();

  await Promise.all([
    objectStore.delete(keys.originalObjectKey),
    keys.analysisObjectKey
      ? objectStore.delete(keys.analysisObjectKey)
      : Promise.resolve(),
  ]);
}
