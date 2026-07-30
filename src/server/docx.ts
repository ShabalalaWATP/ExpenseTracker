// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { utf8 } from "./binary.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { buildZip } from "./zip.ts";

export type DocxBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string; bold?: boolean; muted?: boolean }
  | { kind: "pair"; label: string; value: string }
  | { kind: "table"; header: string[]; rows: string[][] };

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function run(text: string, options: { bold?: boolean; muted?: boolean; size?: number } = {}): string {
  const properties = [
    options.bold ? "<w:b/>" : "",
    `<w:sz w:val="${options.size ?? 21}"/>`,
    options.muted ? '<w:color w:val="595F5C"/>' : "",
  ].join("");
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(
  runs: string,
  options: { before?: number; after?: number; keepNext?: boolean } = {},
): string {
  const properties = [
    `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 120}"/>`,
    options.keepNext ? "<w:keepNext/>" : "",
  ].join("");
  return `<w:p><w:pPr>${properties}</w:pPr>${runs}</w:p>`;
}

function cell(text: string, options: { header?: boolean } = {}): string {
  const shading = options.header
    ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEAE0"/>'
    : "";
  return (
    `<w:tc><w:tcPr>${shading}<w:tcMar>` +
    '<w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>' +
    '<w:start w:w="80" w:type="dxa"/><w:end w:w="80" w:type="dxa"/>' +
    "</w:tcMar></w:tcPr>" +
    paragraph(run(text, { bold: options.header, size: 19 }), { after: 0 }) +
    "</w:tc>"
  );
}

function table(header: string[], rows: string[][]): string {
  const borders =
    "<w:tblBorders>" +
    ["top", "start", "bottom", "end", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D8D0C1"/>`)
      .join("") +
    "</w:tblBorders>";
  const head = `<w:tr>${header.map((text) => cell(text, { header: true })).join("")}</w:tr>`;
  const body = rows
    .map((row) => `<w:tr>${row.map((text) => cell(text)).join("")}</w:tr>`)
    .join("");
  return (
    "<w:tbl><w:tblPr>" +
    '<w:tblW w:w="5000" w:type="pct"/>' +
    borders +
    "</w:tblPr>" +
    head +
    body +
    "</w:tbl>" +
    paragraph("", { after: 120 })
  );
}

function block(item: DocxBlock): string {
  switch (item.kind) {
    case "title":
      return paragraph(run(item.text, { bold: true, size: 40 }), { after: 240 });
    case "heading":
      return paragraph(
        run(item.text, { bold: true, size: item.level === 1 ? 30 : 25 }),
        { before: item.level === 1 ? 300 : 200, after: 120, keepNext: true },
      );
    case "paragraph":
      return paragraph(run(item.text, { bold: item.bold, muted: item.muted }));
    case "pair":
      return paragraph(
        run(`${item.label}: `, { bold: true }) + run(item.value),
        { after: 60 },
      );
    case "table":
      return table(item.header, item.rows);
  }
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES =
  `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  "</Types>";

const PACKAGE_RELS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  "</Relationships>";

const DOCUMENT_RELS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function coreProperties(title: string, author: string, createdAt: Date): string {
  const stamp = createdAt.toISOString();
  return (
    `${XML_DECLARATION}<cp:coreProperties` +
    ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:dcterms="http://purl.org/dc/terms/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dc:creator>${escapeXml(author)}</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

export function buildDocx(options: {
  title: string;
  author: string;
  createdAt: Date;
  blocks: DocxBlock[];
}): Uint8Array {
  const body =
    options.blocks.map(block).join("") +
    "<w:sectPr>" +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>' +
    "</w:sectPr>";
  const document =
    `${XML_DECLARATION}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}</w:body></w:document>`;
  return buildZip([
    { name: "[Content_Types].xml", data: utf8(CONTENT_TYPES), modifiedAt: options.createdAt },
    { name: "_rels/.rels", data: utf8(PACKAGE_RELS), modifiedAt: options.createdAt },
    { name: "docProps/core.xml", data: utf8(coreProperties(options.title, options.author, options.createdAt)), modifiedAt: options.createdAt },
    { name: "word/_rels/document.xml.rels", data: utf8(DOCUMENT_RELS), modifiedAt: options.createdAt },
    { name: "word/document.xml", data: utf8(document), modifiedAt: options.createdAt },
  ]);
}
