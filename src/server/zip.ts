// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { concatBytes, utf8 } from "./binary.ts";

export type ZipEntry = {
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
};

const table = new Uint32Array(256);
for (let index = 0; index < table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  table[index] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): [number, number] {
  const safe = date.getUTCFullYear() < 1980 ? new Date("1980-01-01T00:00:00Z") : date;
  const time =
    (safe.getUTCHours() << 11) |
    (safe.getUTCMinutes() << 5) |
    Math.floor(safe.getUTCSeconds() / 2);
  const day =
    ((safe.getUTCFullYear() - 1980) << 9) |
    ((safe.getUTCMonth() + 1) << 5) |
    safe.getUTCDate();
  return [time, day];
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function safeName(value: string): string {
  const name = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!name || name.includes("../") || name.includes("\0")) {
    throw new Error("Unsafe ZIP entry name.");
  }
  return name;
}

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = utf8(safeName(entry.name));
    const checksum = crc32(entry.data);
    const [time, date] = dosDateTime(entry.modifiedAt ?? new Date());
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, date, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, entry.data.byteLength, true);
    local.view.setUint32(22, entry.data.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    const localEntry = concatBytes([local.bytes, name, entry.data]);
    locals.push(localEntry);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(12, time, true);
    central.view.setUint16(14, date, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, entry.data.byteLength, true);
    central.view.setUint32(24, entry.data.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint32(42, offset, true);
    centrals.push(concatBytes([central.bytes, name]));
    offset += localEntry.byteLength;
  }
  const centralBytes = concatBytes(centrals);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralBytes.byteLength, true);
  end.view.setUint32(16, offset, true);
  return concatBytes([...locals, centralBytes, end.bytes]);
}
