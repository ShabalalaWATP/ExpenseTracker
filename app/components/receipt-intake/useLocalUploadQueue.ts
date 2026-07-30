"use client";

import { useEffect, useRef, useState } from "react";
import type { LocalUpload } from "./types";
import { removeUploadDraft, saveUploadDraft } from "./upload-drafts";

export function useLocalUploadQueue() {
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const uploadsRef = useRef<LocalUpload[]>([]);

  useEffect(() => {
    uploadsRef.current = localUploads;
  }, [localUploads]);

  async function updateLocal(
    local: LocalUpload,
    changes: Partial<LocalUpload>,
  ): Promise<LocalUpload> {
    const changed = { ...local, ...changes };
    setLocalUploads((items) =>
      items.map((item) => (item.id === local.id ? changed : item)),
    );
    await saveUploadDraft(changed).catch(() => {});
    return changed;
  }

  async function removeLocal(id: string) {
    setLocalUploads((items) => items.filter((item) => item.id !== id));
    await removeUploadDraft(id).catch(() => {});
  }

  return {
    localUploads,
    removeLocal,
    setLocalUploads,
    updateLocal,
    uploadsRef,
  };
}
