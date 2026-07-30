import type { ImageEdits } from "./types";

export const MAX_ANALYSIS_DIMENSION = 2560;
export const MAX_ANALYSIS_PIXELS = 5_000_000;
export const MAX_RECEIPT_SOURCE_DIMENSION = 12_000;
export const MAX_RECEIPT_SOURCE_PIXELS = 60_000_000;
const JPEG_QUALITY = 0.9;
const MAX_ANALYSIS_BYTES = 9 * 1_048_576;
const MAX_RECEIPT_BYTES = 20 * 1_048_576;
const IMAGE_PREPARATION_TIMEOUT_MS = 25_000;

export const DEFAULT_IMAGE_EDITS: ImageEdits = {
  rotation: 0,
  contrast: 1,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
};

export function normaliseImageEdits(
  value: Partial<ImageEdits> | null | undefined,
): ImageEdits {
  const rotation = [0, 90, 180, 270].includes(value?.rotation ?? 0)
    ? (value?.rotation ?? 0)
    : 0;
  const bounded = (input: number | undefined, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, Number.isFinite(input) ? input! : minimum));
  const result: ImageEdits = {
    rotation: rotation as ImageEdits["rotation"],
    contrast: bounded(value?.contrast, 0.8, 1.8) || 1,
    cropTop: bounded(value?.cropTop, 0, 0.4),
    cropRight: bounded(value?.cropRight, 0, 0.4),
    cropBottom: bounded(value?.cropBottom, 0, 0.4),
    cropLeft: bounded(value?.cropLeft, 0, 0.4),
  };
  if (result.cropLeft + result.cropRight >= 0.8) {
    result.cropLeft = 0;
    result.cropRight = 0;
  }
  if (result.cropTop + result.cropBottom >= 0.8) {
    result.cropTop = 0;
    result.cropBottom = 0;
  }
  return result;
}

export function cropGeometry(
  width: number,
  height: number,
  edits: ImageEdits,
) {
  const x = Math.round(width * edits.cropLeft);
  const y = Math.round(height * edits.cropTop);
  return {
    x,
    y,
    width: Math.max(
      1,
      width - x - Math.round(width * edits.cropRight),
    ),
    height: Math.max(
      1,
      height - y - Math.round(height * edits.cropBottom),
    ),
  };
}

export function canSelectReceipt(
  file: Pick<File, "size" | "type">,
): boolean {
  const supportedType = file.type === "" || file.type.startsWith("image/");
  return file.size > 0 && file.size <= MAX_RECEIPT_BYTES && supportedType;
}

export function receiptAnalysisImage(file: Blob): Promise<Blob> {
  return normaliseReceipt(file);
}

function bytesEqual(value: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => value[index] === byte);
}

function pngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.byteLength < 24 ||
    !bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return null;
  }
  if (new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.byteLength < 3 ||
    !bytesEqual(bytes, [0xff, 0xd8, 0xff])
  ) {
    return null;
  }
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
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    if (marker === 0xda) return null;
    offset += length;
  }
  return null;
}

export function safeReceiptSourceDimensions(
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

export async function validateReceiptSourceDimensions(file: Blob): Promise<void> {
  const firstBytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const png = pngDimensions(firstBytes);
  let dimensions = png;
  if (!dimensions && bytesEqual(firstBytes, [0xff, 0xd8, 0xff])) {
    dimensions = jpegDimensions(new Uint8Array(await file.arrayBuffer()));
  }
  if (dimensions && !safeReceiptSourceDimensions(dimensions)) {
    throw new Error(
      "This receipt image has unsafe dimensions. Use a photo no larger than 60 megapixels.",
    );
  }
}

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decoding failed."));
      }),
      "This photo took too long to prepare.",
    );
    return image;
  } catch {
    URL.revokeObjectURL(url);
    if ("createImageBitmap" in window) {
      try {
        return await withTimeout(
          createImageBitmap(file, { imageOrientation: "from-image" }),
          "This photo took too long to prepare.",
        );
      } catch {
        // The original remains secured even when a browser cannot decode it.
      }
    }
    throw new Error("This photo could not be prepared for analysis.");
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          IMAGE_PREPARATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function normaliseReceipt(
  file: Blob,
  requestedEdits: Partial<ImageEdits> = DEFAULT_IMAGE_EDITS,
): Promise<Blob> {
  await validateReceiptSourceDimensions(file);
  const source = await decodeImage(file);
  try {
    const width = source.width;
    const height = source.height;
    const edits = normaliseImageEdits(requestedEdits);
    const crop = cropGeometry(width, height, edits);
    const scale = Math.min(
      1,
      MAX_ANALYSIS_DIMENSION / Math.max(crop.width, crop.height),
      Math.sqrt(MAX_ANALYSIS_PIXELS / (crop.width * crop.height)),
    );
    const drawWidth = Math.max(1, Math.round(crop.width * scale));
    const drawHeight = Math.max(1, Math.round(crop.height * scale));
    const rotated = edits.rotation === 90 || edits.rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = rotated ? drawHeight : drawWidth;
    canvas.height = rotated ? drawWidth : drawHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((edits.rotation * Math.PI) / 180);
    context.filter = `contrast(${edits.contrast})`;
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
    let quality = JPEG_QUALITY;
    let blob: Blob | null = null;
    do {
      blob = await withTimeout(
        new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        ),
        "This photo took too long to convert.",
      );
      quality -= 0.1;
    } while (blob && blob.size > MAX_ANALYSIS_BYTES && quality >= 0.62);
    if (!blob) throw new Error("The photo could not be converted to JPEG.");
    if (blob.size > MAX_ANALYSIS_BYTES) {
      throw new Error(
        "This photo is too detailed to prepare safely. Move closer to the receipt and try again.",
      );
    }
    return blob;
  } finally {
    if (
      typeof ImageBitmap !== "undefined" &&
      source instanceof ImageBitmap
    ) {
      source.close();
    } else {
      URL.revokeObjectURL((source as HTMLImageElement).src);
    }
  }
}
