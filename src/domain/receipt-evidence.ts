export type ReceiptSource = {
  objectKey: string;
  contentType: string;
  original: boolean;
};

export function directReceiptPreviewObjectKey(
  ownerId: string,
  receiptId: string,
): string {
  return `receipt-previews/${ownerId}/${receiptId}.jpg`;
}

export function selectExpenseReceiptSource(
  receipt: {
    objectKey: string;
    contentType: string;
    analysisObjectKey: string | null;
  },
  download: boolean,
): ReceiptSource {
  const analysisContentType = receipt.analysisObjectKey?.toLowerCase().endsWith(".png")
    ? "image/png"
    : receipt.analysisObjectKey &&
        /\.(?:jpe?g)$/i.test(receipt.analysisObjectKey)
      ? "image/jpeg"
      : null;
  const originalNeedsBrowserPreview =
    receipt.contentType === "image/heic" || receipt.contentType === "image/heif";
  if (
    !download &&
    originalNeedsBrowserPreview &&
    receipt.analysisObjectKey &&
    analysisContentType
  ) {
    return {
      objectKey: receipt.analysisObjectKey,
      contentType: analysisContentType,
      original: false,
    };
  }
  return {
    objectKey: receipt.objectKey,
    contentType: receipt.contentType,
    original: true,
  };
}

export function receiptEvidenceUrls(expense: {
  id: string;
  receiptUrl?: string;
}) {
  const preview = `/api/expenses/${encodeURIComponent(expense.id)}/receipt`;
  return {
    preview,
    download: `${preview}?download=1`,
  };
}
