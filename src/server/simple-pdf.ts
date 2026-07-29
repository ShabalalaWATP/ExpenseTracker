// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { concatBytes, utf8 } from "./binary.ts";

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrap(lines: readonly string[], width = 96): string[] {
  return lines.flatMap((line) => {
    const words = line.split(/\s+/);
    const output: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) current = word;
      else if (`${current} ${word}`.length <= width) current += ` ${word}`;
      else {
        output.push(current);
        current = word;
      }
    }
    output.push(current);
    return output;
  });
}

function contentStream(
  title: string,
  lines: readonly string[],
  page: number,
  totalPages: number,
): string {
  const commands = lines
    .map((line) => `(${ascii(line)}) Tj\n0 -14 Td`)
    .join("\n");
  const heading = page === 1 ? title : `${title} (continued)`;
  return [
    "BT",
    "/F1 14 Tf",
    "50 790 Td",
    `(${ascii(heading)}) Tj`,
    "0 -24 Td",
    "/F1 10 Tf",
    commands,
    "ET",
    "BT",
    "/F1 8 Tf",
    "50 30 Td",
    `(ExpenseTracker | Page ${page} of ${totalPages}) Tj`,
    "ET",
  ].join("\n");
}

export function buildTextPdf(lines: readonly string[]): Uint8Array {
  const wrapped = wrap(lines);
  const title = wrapped.shift() || "ExpenseTracker";
  const pages = wrapped.reduce<string[][]>((result, line) => {
    const current = result.at(-1);
    if (!current || current.length >= 46) result.push([line]);
    else current.push(line);
    return result;
  }, []);
  if (!pages.length) pages.push([]);
  const fontId = 3 + pages.length * 2;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.set(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const streamId = pageId + 1;
    const stream = contentStream(title, page, index + 1, pages.length);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    objects.set(
      streamId,
      `<< /Length ${utf8(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const chunks = [utf8("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0].byteLength;
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = length;
    const chunk = utf8(`${id} 0 obj\n${objects.get(id)}\nendobj\n`);
    chunks.push(chunk);
    length += chunk.byteLength;
  }
  const xrefOffset = length;
  const xref = [
    `xref\n0 ${fontId + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}\n%%EOF`,
  ].join("\n");
  chunks.push(utf8(xref));
  return concatBytes(chunks);
}
