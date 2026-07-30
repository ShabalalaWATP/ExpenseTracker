import { ApiError } from "./http";
import {
  detectImageType,
  imageDimensions,
  safeReceiptImageDimensions,
} from "./receipt-image-inspection";

export {
  detectImageType,
  imageDimensions,
  MAX_RECEIPT_SOURCE_DIMENSION,
  MAX_RECEIPT_SOURCE_PIXELS,
  safeReceiptImageDimensions,
} from "./receipt-image-inspection";

export function validateImageType(
  bytes: Uint8Array,
  declared: string | null,
): string {
  const cleanDeclared = declared?.split(";")[0].trim().toLowerCase() ?? "";
  const detected = detectImageType(bytes);
  const heifTypes = new Set(["image/heic", "image/heif"]);
  const compatible =
    detected === cleanDeclared ||
    (detected !== null &&
      (cleanDeclared === "" || cleanDeclared === "application/octet-stream")) ||
    (detected !== null &&
      heifTypes.has(detected) &&
      heifTypes.has(cleanDeclared));
  if (!compatible) {
    throw new ApiError(
      415,
      "receipt_type_invalid",
      "Upload a JPEG, PNG, HEIC or HEIF receipt image.",
    );
  }
  if (detected === "image/jpeg" || detected === "image/png") {
    const dimensions = imageDimensions(bytes, detected);
    if (dimensions && !safeReceiptImageDimensions(dimensions)) {
      throw new ApiError(
        413,
        "receipt_dimensions_too_large",
        "This receipt image has unsafe dimensions. Use a photo no larger than 60 megapixels.",
      );
    }
  }
  return detected!;
}
