// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { utf8 } from "./binary.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { buildZip } from "./zip.ts";

export type DocxBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string; bold?: boolean; muted?: boolean }
  | { kind: "pair"; label: string; value: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "image"; imageKey: string; altText: string };

export type DocxImage = {
  key: string;
  data: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  widthPx: number;
  heightPx: number;
};

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

type PreparedImage = DocxImage & {
  relationshipId: string;
  archiveName: string;
  drawingId: number;
};

const EMU_PER_INCH = 914_400;
const MAX_IMAGE_WIDTH_EMU = Math.round(6.4 * EMU_PER_INCH);
const MAX_IMAGE_HEIGHT_EMU = Math.round(7.5 * EMU_PER_INCH);

function imageExtent(image: DocxImage): { width: number; height: number } {
  const naturalWidth = (image.widthPx / 96) * EMU_PER_INCH;
  const naturalHeight = (image.heightPx / 96) * EMU_PER_INCH;
  const scale = Math.min(
    1,
    MAX_IMAGE_WIDTH_EMU / naturalWidth,
    MAX_IMAGE_HEIGHT_EMU / naturalHeight,
  );
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function imageParagraph(image: PreparedImage, altText: string): string {
  const extent = imageExtent(image);
  const description = escapeXml(altText.slice(0, 500));
  const name = escapeXml(`Receipt evidence ${image.drawingId}`);
  return (
    '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr><w:r><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${extent.width}" cy="${extent.height}"/>` +
    `<wp:docPr id="${image.drawingId}" name="${name}" descr="${description}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr>' +
    `<pic:cNvPr id="0" name="${name}" descr="${description}"/>` +
    '<pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>' +
    `<a:blip r:embed="${image.relationshipId}"/>` +
    '<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${extent.width}" cy="${extent.height}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></w:r></w:p>'
  );
}

function block(item: DocxBlock, images: ReadonlyMap<string, PreparedImage>): string {
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
    case "image": {
      const image = images.get(item.imageKey);
      if (!image) throw new Error(`Missing DOCX image: ${item.imageKey}`);
      return imageParagraph(image, item.altText);
    }
  }
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES =
  `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="jpg" ContentType="image/jpeg"/>' +
  '<Default Extension="png" ContentType="image/png"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  "</Types>";

const PACKAGE_RELS =
  `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  "</Relationships>";

function documentRelationships(images: readonly PreparedImage[]): string {
  return (
    `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    images
      .map(
        (image) =>
          `<Relationship Id="${image.relationshipId}" ` +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
          `Target="media/${image.archiveName}"/>`,
      )
      .join("") +
    "</Relationships>"
  );
}

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
  images?: readonly DocxImage[];
}): Uint8Array {
  const imageKeys = new Set<string>();
  const images: PreparedImage[] = (options.images ?? []).map((image, index) => {
    if (
      imageKeys.has(image.key) ||
      !image.key ||
      !Number.isSafeInteger(image.widthPx) ||
      !Number.isSafeInteger(image.heightPx) ||
      image.widthPx <= 0 ||
      image.heightPx <= 0
    ) {
      throw new Error("Invalid DOCX image metadata.");
    }
    imageKeys.add(image.key);
    return {
      ...image,
      relationshipId: `rIdImage${index + 1}`,
      archiveName: `receipt-${index + 1}.${image.contentType === "image/png" ? "png" : "jpg"}`,
      drawingId: index + 1,
    };
  });
  const imageMap = new Map(images.map((image) => [image.key, image]));
  const body =
    options.blocks.map((item) => block(item, imageMap)).join("") +
    "<w:sectPr>" +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>' +
    "</w:sectPr>";
  const document =
    `${XML_DECLARATION}<w:document` +
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${body}</w:body></w:document>`;
  return buildZip([
    { name: "[Content_Types].xml", data: utf8(CONTENT_TYPES), modifiedAt: options.createdAt },
    { name: "_rels/.rels", data: utf8(PACKAGE_RELS), modifiedAt: options.createdAt },
    { name: "docProps/core.xml", data: utf8(coreProperties(options.title, options.author, options.createdAt)), modifiedAt: options.createdAt },
    { name: "word/_rels/document.xml.rels", data: utf8(documentRelationships(images)), modifiedAt: options.createdAt },
    { name: "word/document.xml", data: utf8(document), modifiedAt: options.createdAt },
    ...images.map((image) => ({
      name: `word/media/${image.archiveName}`,
      data: image.data,
      modifiedAt: options.createdAt,
    })),
  ]);
}
