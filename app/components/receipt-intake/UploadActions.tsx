"use client";

import { useRef } from "react";

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/heic,image/heif";

export function UploadActions({
  busy,
  onFiles,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function receive(list: FileList | null, input: HTMLInputElement) {
    if (list?.length) onFiles(Array.from(list));
    input.value = "";
  }

  return (
    <div className="intake-actions" aria-label="Add receipts">
      <button
        className="intake-action primary"
        type="button"
        aria-label="Take receipt photo"
        disabled={busy}
        onClick={() => cameraRef.current?.click()}
      >
        <span className="action-mark camera-mark" aria-hidden="true" />
        <span>
          <strong>Take photo</strong>
          <small>Open the rear camera</small>
        </span>
      </button>
      <button
        className="intake-action"
        type="button"
        aria-label="Choose receipt photos from Photo Library"
        disabled={busy}
        onClick={() => libraryRef.current?.click()}
      >
        <span className="action-mark library-mark" aria-hidden="true" />
        <span>
          <strong>Choose photos</strong>
          <small>Up to 20 at once</small>
        </span>
      </button>
      <input
        ref={cameraRef}
        className="sr-only"
        type="file"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        accept={ACCEPTED_IMAGES}
        capture="environment"
        onChange={(event) => receive(event.target.files, event.currentTarget)}
      />
      <input
        ref={libraryRef}
        className="sr-only"
        type="file"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        accept={ACCEPTED_IMAGES}
        multiple
        onChange={(event) => receive(event.target.files, event.currentTarget)}
      />
    </div>
  );
}
