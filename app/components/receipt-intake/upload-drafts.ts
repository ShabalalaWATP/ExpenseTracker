import type { LocalUpload } from "./types";

const DATABASE_NAME = "expense-tracker-local";
const STORE_NAME = "upload-drafts";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Private upload recovery is unavailable in this browser."));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Safari could not open the local recovery queue."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Safari could not update the local recovery queue."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await requestResult(
      operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME)),
    );
  } finally {
    database.close();
  }
}

export async function saveUploadDraft(draft: LocalUpload): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({
      ...draft,
      stage:
        draft.stage === "uploading" || draft.stage === "normalising"
          ? "queued"
          : draft.stage,
    }),
  );
}

export async function removeUploadDraft(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function listUploadDrafts(): Promise<LocalUpload[]> {
  const values = await withStore<LocalUpload[]>("readonly", (store) =>
    store.getAll(),
  );
  return values
    .filter((value) => value.file instanceof Blob)
    .map((value) => ({
      ...value,
      stage: navigator.onLine ? "queued" : "waiting-online",
    }));
}

export async function countUploadDrafts(): Promise<number> {
  return withStore("readonly", (store) => store.count());
}

export async function clearUploadDrafts(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
