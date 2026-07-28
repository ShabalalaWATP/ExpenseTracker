const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.9;
const MAX_RECEIPT_BYTES = 20 * 1_048_576;

export function canSelectReceipt(
  file: Pick<File, "size" | "type">,
): boolean {
  const supportedType = file.type === "" || file.type.startsWith("image/");
  return file.size > 0 && file.size <= MAX_RECEIPT_BYTES && supportedType;
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

export async function normaliseReceipt(file: File): Promise<Blob> {
  const source = await decodeImage(file);
  try {
    const width = source.width;
    const height = source.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("The photo could not be converted to JPEG.");
    return blob;
  } finally {
    if (source instanceof ImageBitmap) source.close();
    else URL.revokeObjectURL(source.src);
  }
}
