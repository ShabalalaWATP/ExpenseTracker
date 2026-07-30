"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LocalUpload } from "./types";
import {
  removeUploadDraft,
  saveUploadDraftState,
} from "./upload-drafts";

export function useLocalUploadQueue() {
  const [localUploads, setLocalUploadsState] = useState<LocalUpload[]>([]);
  const uploadsRef = useRef<LocalUpload[]>([]);

  const setLocalUploads: Dispatch<SetStateAction<LocalUpload[]>> = useCallback(
    (action) => {
      const next =
        typeof action === "function" ? action(uploadsRef.current) : action;
      uploadsRef.current = next;
      setLocalUploadsState(next);
    },
    [],
  );

  async function updateLocal(
    local: LocalUpload,
    changes: Partial<LocalUpload>,
  ): Promise<LocalUpload> {
    const changed = { ...local, ...changes };
    setLocalUploads((items) =>
      items.map((item) => (item.id === local.id ? changed : item)),
    );
    await saveUploadDraftState(changed).catch(() => {});
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
