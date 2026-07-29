export function partitionByByteSize<T>(
  items: readonly T[],
  sizeOf: (item: T) => number,
  maximumBytes: number,
): T[][] {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("maximumBytes must be a positive safe integer");
  }
  const parts: T[][] = [[]];
  let partBytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("item byte size must be a non-negative safe integer");
    }
    if (partBytes > 0 && partBytes + size > maximumBytes) {
      parts.push([]);
      partBytes = 0;
    }
    parts.at(-1)!.push(item);
    partBytes += size;
  }
  return parts;
}
