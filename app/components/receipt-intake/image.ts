import type { ImageEdits } from "./types";

export const MAX_ANALYSIS_DIMENSION = 4096;
export const MAX_ANALYSIS_PIXELS = 12_000_000;
const JPEG_QUALITY = 0.92;
const MAX_ANALYSIS_BYTES = 9 * 1_048_576;
const MAX_RECEIPT_BYTES = 20 * 1_048_576;

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

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari can decode some iPhone formats through an image element only.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This photo could not be prepared for analysis.");
  }
}

export async function normaliseReceipt(
  file: Blob,
  requestedEdits: Partial<ImageEdits> = DEFAULT_IMAGE_EDITS,
): Promise<Blob> {
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
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
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
