const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function streamBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
