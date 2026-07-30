import { ApiError } from "./http";
import { detectImageType } from "./receipt-image-inspection";

export { detectImageType, imageDimensions } from "./receipt-image-inspection";

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
  return detected!;
}
