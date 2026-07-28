import { ApiError } from "./http";

export function validIntakeIdempotencyKey(value: string | null): string {
  if (
    !value ||
    value.length < 8 ||
    value.length > 128 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new ApiError(
      400,
      "idempotency_key_invalid",
      "Provide an Idempotency-Key of 8 to 128 characters.",
    );
  }
  return value;
}

export function intakeImageExtension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return contentType === "image/heif" ? "heif" : "heic";
}

export async function receiptSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
