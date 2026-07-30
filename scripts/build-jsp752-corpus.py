"""Build ExpenseTracker's versioned JSP 752 retrieval corpus.

Usage:
    python scripts/build-jsp752-corpus.py SOURCE.pdf OUTPUT.json

The source must be the official JSP 752 v66.1 PDF. The generated JSON is
committed alongside the PDF so production policy answers do not depend on a
third-party vector database or a successful document download at query time.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader, __version__ as pypdf_version


POLICY_VERSION = "JSP 752 v66.1, May 2026"
PUBLICATION_URL = (
    "https://www.gov.uk/government/publications/"
    "jsp-752-tri-service-regulations-for-expenses-and-allowances"
)
PDF_URL = (
    "https://assets.publishing.service.gov.uk/media/"
    "69fc755e8cc72d2f863ea5af/JSP752_v66_May26.pdf"
)
LOCAL_PDF_PATH = "/policy/JSP752_v66.1_May_2026.pdf"
EXPECTED_PAGES = 663
EXPECTED_PYPDF_VERSION = "6.10.0"
EXPECTED_SOURCE_SHA256 = (
    "ebaad48bcd08ff3edea354df6ae6417e595cdb876f4f278fe01f8f1611fa131e"
)
REPEATED_HEADER = (
    "Before advising on or making a claim read the Principles in Ch 1 "
    "and Responsibilities in Ch 4"
)


def normalise_page(text: str) -> str:
    """Normalise extraction artefacts without paraphrasing the policy."""

    value = unicodedata.normalize("NFKC", text)
    value = value.replace("Ł", "£").replace("\x00", "").replace("\u00ad", "")
    value = value.replace(REPEATED_HEADER, "")
    value = re.sub(r"JSP 752 \(v66(?:\.1| 1)? May 26\)", "", value)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.splitlines()]

    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        if line:
            current.append(line)
            continue
        if current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs).strip()


def build_corpus(source: Path) -> dict[str, object]:
    if pypdf_version != EXPECTED_PYPDF_VERSION:
        raise ValueError(
            f"Expected pypdf {EXPECTED_PYPDF_VERSION}, found {pypdf_version}. "
            "Install the hashed policy requirements before regenerating."
        )
    source_bytes = source.read_bytes()
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    if source_sha256 != EXPECTED_SOURCE_SHA256:
        raise ValueError(
            "The source SHA-256 does not match the reviewed official JSP 752 "
            f"v66.1 PDF. Found {source_sha256}."
        )
    reader = PdfReader(str(source))
    if len(reader.pages) != EXPECTED_PAGES:
        raise ValueError(
            f"Expected {EXPECTED_PAGES} pages for {POLICY_VERSION}, "
            f"found {len(reader.pages)}."
        )

    pages = [
        {
            "page": index + 1,
            "text": normalise_page(page.extract_text() or ""),
        }
        for index, page in enumerate(reader.pages)
    ]
    joined_text = "\n".join(str(page["text"]) for page in pages)
    if "Tri-Service Regulations for Expenses and Allowances" not in joined_text:
        raise ValueError("The source does not appear to be JSP 752.")
    if "Aggregation of DS claims is permitted" not in joined_text:
        raise ValueError("The expected Day Subsistence section is missing.")

    return {
        "schemaVersion": 1,
        "document": {
            "title": "JSP 752 - Tri-Service Regulations for Expenses and Allowances",
            "version": POLICY_VERSION,
            "publicationUrl": PUBLICATION_URL,
            "pdfUrl": PDF_URL,
            "localPdfPath": LOCAL_PDF_PATH,
            "sourceSha256": source_sha256,
            "textSha256": hashlib.sha256(joined_text.encode("utf-8")).hexdigest(),
            "pageCount": len(pages),
        },
        "pages": pages,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    corpus = build_corpus(args.source)
    encoded_corpus = json.dumps(
        corpus,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    encoded_manifest = json.dumps(
        corpus["document"],
        ensure_ascii=False,
        indent=2,
    ) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != encoded_corpus:
            raise ValueError("The committed JSP 752 corpus is not reproducible.")
        if (
            args.manifest
            and args.manifest.read_text(encoding="utf-8") != encoded_manifest
        ):
            raise ValueError("The committed JSP 752 manifest is not reproducible.")
        print(f"Verified reproducible {POLICY_VERSION} corpus.")
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(encoded_corpus, encoding="utf-8")
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(encoded_manifest, encoding="utf-8")
    print(
        f"Wrote {corpus['document']['pageCount']} pages to {args.output} "
        f"from SHA-256 {corpus['document']['sourceSha256']}."
    )


if __name__ == "__main__":
    main()
