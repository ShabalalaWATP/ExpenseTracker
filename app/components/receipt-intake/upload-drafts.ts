import type { LocalUpload } from "./types";

const DATABASE_NAME = "expense-tracker-local";
const STORE_NAME = "upload-drafts";
const STATE_STORE_NAME = "upload-draft-state";
const DATABASE_VERSION = 2;

type StoredFile = { id: string; file: File };
type StoredState = Omit<LocalUpload, "file">;

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
      if (!database.objectStoreNames.contains(STATE_STORE_NAME)) {
        database.createObjectStore(STATE_STORE_NAME, { keyPath: "id" });
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

function transactionCompletion(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(new Error("Safari could not commit the local recovery queue."));
    transaction.onerror = () => {
      // The abort event supplies the single transaction-level rejection.
    };
  });
}

async function withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, mode);
  const completion = transactionCompletion(transaction);
  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction already aborted or committed.
    }
    await completion.catch(() => {});
    throw error;
  } finally {
    database.close();
  }
}

function draftState(draft: LocalUpload): StoredState {
  const { file, ...state } = draft;
  void file;
  return {
    ...state,
    stage:
      state.stage === "uploading" || state.stage === "normalising"
        ? "queued"
        : state.stage,
  };
}

export async function saveUploadDraft(draft: LocalUpload): Promise<void> {
  await withTransaction(
    [STORE_NAME, STATE_STORE_NAME],
    "readwrite",
    async (transaction) => {
      await Promise.all([
        requestResult(
          transaction.objectStore(STORE_NAME).put({
            id: draft.id,
            file: draft.file,
          } satisfies StoredFile),
        ),
        requestResult(
          transaction
            .objectStore(STATE_STORE_NAME)
            .put(draftState(draft)),
        ),
      ]);
    },
  );
}

export async function saveUploadDraftState(draft: LocalUpload): Promise<void> {
  await withTransaction(STATE_STORE_NAME, "readwrite", async (transaction) =>
    requestResult(
      transaction.objectStore(STATE_STORE_NAME).put(draftState(draft)),
    ).then(() => undefined),
  );
}

export async function removeUploadDraft(id: string): Promise<void> {
  await withTransaction(
    [STORE_NAME, STATE_STORE_NAME],
    "readwrite",
    async (transaction) => {
      await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).delete(id)),
        requestResult(transaction.objectStore(STATE_STORE_NAME).delete(id)),
      ]);
    },
  );
}

export async function listUploadDrafts(): Promise<LocalUpload[]> {
  const [files, states] = await withTransaction(
    [STORE_NAME, STATE_STORE_NAME],
    "readonly",
    (transaction) =>
      Promise.all([
        requestResult<Array<StoredFile | LocalUpload>>(
          transaction.objectStore(STORE_NAME).getAll(),
        ),
        requestResult<StoredState[]>(
          transaction.objectStore(STATE_STORE_NAME).getAll(),
        ),
      ]),
  );
  const stateById = new Map(states.map((state) => [state.id, state]));
  return files.flatMap((stored) => {
    if (!(stored.file instanceof Blob)) return [];
    const legacy = stored as LocalUpload;
    const state = stateById.get(stored.id) ?? legacy;
    if (!state.idempotencyKey || !state.batchId || !state.defaults) return [];
    return [{
      ...state,
      file: stored.file as File,
      stage:
        !navigator.onLine && state.stage === "queued"
          ? "waiting-online"
          : state.stage,
    }];
  });
}

export async function countUploadDrafts(): Promise<number> {
  return withTransaction(STORE_NAME, "readonly", (transaction) =>
    requestResult(transaction.objectStore(STORE_NAME).count()),
  );
}

export async function clearUploadDrafts(): Promise<void> {
  await withTransaction(
    [STORE_NAME, STATE_STORE_NAME],
    "readwrite",
    async (transaction) => {
      await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).clear()),
        requestResult(transaction.objectStore(STATE_STORE_NAME).clear()),
      ]);
    },
  );
}
