function bytesEqual(value: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => value[index] === byte);
}

export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.byteLength >= 3 && bytesEqual(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 8 &&
    bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp"
  ) {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return brand === "mif1" || brand === "msf1"
        ? "image/heif"
        : "image/heic";
    }
  }
  return null;
}

export const MAX_RECEIPT_SOURCE_DIMENSION = 12_000;
export const MAX_RECEIPT_SOURCE_PIXELS = 60_000_000;

function validDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0;
}

function pngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null;
  const chunk = new TextDecoder().decode(bytes.slice(12, 16));
  if (chunk !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return validDimensions(width, height) ? { width, height } : null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 1 >= bytes.byteLength) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.byteLength) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return validDimensions(width, height) ? { width, height } : null;
    }
    if (marker === 0xda) return null;
    offset += length;
  }
  return null;
}

export function imageDimensions(
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
): { width: number; height: number } | null {
  return contentType === "image/png"
    ? pngDimensions(bytes)
    : jpegDimensions(bytes);
}

export function safeReceiptImageDimensions(
  dimensions: { width: number; height: number },
): boolean {
  const { width, height } = dimensions;
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_RECEIPT_SOURCE_DIMENSION &&
    height <= MAX_RECEIPT_SOURCE_DIMENSION &&
    width <= MAX_RECEIPT_SOURCE_PIXELS / height
  );
}
