"use client";

import { useState } from "react";
import {
  DEFAULT_IMAGE_EDITS,
  normaliseImageEdits,
} from "./image";
import type { ImageEdits } from "./types";

export function ReceiptImageAdjuster({
  previewUrl,
  merchant,
  byteSize,
  aiModel,
  initialEdits,
  busy,
  canAnalyse,
  onAnalyse,
}: {
  previewUrl: string;
  merchant: string | null;
  byteSize: number;
  aiModel: string | null;
  initialEdits: Partial<ImageEdits>;
  busy: boolean;
  canAnalyse: boolean;
  onAnalyse: (edits: ImageEdits) => void;
}) {
  const [edits, setEdits] = useState(() =>
    normaliseImageEdits(initialEdits),
  );
  const crop = `${edits.cropTop * 100}% ${edits.cropRight * 100}% ${
    edits.cropBottom * 100
  }% ${edits.cropLeft * 100}%`;

  function rotate(delta: -90 | 90) {
    setEdits((current) => ({
      ...current,
      rotation: ((current.rotation + delta + 360) % 360) as ImageEdits["rotation"],
    }));
  }

  function change(
    field: keyof ImageEdits,
    value: number,
  ) {
    setEdits((current) =>
      normaliseImageEdits({ ...current, [field]: value }),
    );
  }

  return (
    <aside className="review-receipt">
      <div className="review-image adjusted-receipt">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Original receipt${merchant ? ` from ${merchant}` : ""}`}
          style={{
            clipPath: `inset(${crop})`,
            filter: `contrast(${edits.contrast})`,
            transform: `rotate(${edits.rotation}deg)`,
          }}
        />
      </div>
      {canAnalyse ? <><div className="image-tool-row" role="group" aria-label="Receipt rotation">
        <button type="button" onClick={() => rotate(-90)} disabled={busy}>
          Rotate left
        </button>
        <button type="button" onClick={() => rotate(90)} disabled={busy}>
          Rotate right
        </button>
        <button
          type="button"
          onClick={() => setEdits(DEFAULT_IMAGE_EDITS)}
          disabled={busy}
        >
          Reset
        </button>
      </div>
      <label className="image-slider">
        <span>Contrast</span>
        <input
          type="range"
          min="0.8"
          max="1.8"
          step="0.1"
          value={edits.contrast}
          onChange={(event) => change("contrast", Number(event.target.value))}
          disabled={busy}
        />
        <output>{Math.round(edits.contrast * 100)}%</output>
      </label>
      <details className="crop-controls">
        <summary>Crop edges</summary>
        {(
          [
            ["cropTop", "Top"],
            ["cropRight", "Right"],
            ["cropBottom", "Bottom"],
            ["cropLeft", "Left"],
          ] as const
        ).map(([field, label]) => (
          <label className="image-slider" key={field}>
            <span>{label}</span>
            <input
              type="range"
              min="0"
              max="0.4"
              step="0.02"
              value={edits[field]}
              onChange={(event) => change(field, Number(event.target.value))}
              disabled={busy}
            />
            <output>{Math.round(edits[field] * 100)}%</output>
          </label>
        ))}
      </details>
      <button
        className="secondary-button full-button"
        type="button"
        onClick={() => onAnalyse(edits)}
        disabled={busy}
      >
        {busy ? "Reading adjusted image…" : "Read with these adjustments"}
      </button>
      </> : (
        <p>AI image re-reading is unavailable. Enter and confirm the receipt details manually.</p>
      )}
      <p>
        Original secured · {(byteSize / 1_048_576).toFixed(1)} MB
        {aiModel ? ` · Last read by ${aiModel}` : ""}
      </p>
    </aside>
  );
}
