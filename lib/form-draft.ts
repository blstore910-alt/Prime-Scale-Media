/**
 * IndexedDB-backed form draft persistence.
 *
 * The bol-app session showed how easily typed input evaporates: browser
 * crashes, accidental navigation, laptop closes. For any form that takes
 * more than ~30 seconds to fill in, we keep an auto-saved copy in IDB
 * so the user can restore on next open.
 *
 * Scope:
 *   - Per browser + per form-key. NOT synced across devices — treat as
 *     a "second try" convenience, not source of truth.
 *   - TTL 7 days; older drafts are ignored on load.
 *   - Values are stored as plain JSON — do NOT put secrets in here.
 *
 * Usage (see hooks/use-form-draft.ts for the React wrapper):
 *
 *   const draft = await loadDraft("invoice-create");
 *   if (draft) prefill(draft.values);
 *   // ... on every change
 *   await saveDraft("invoice-create", currentValues);
 *   // ... on successful submit
 *   await clearDraft("invoice-create");
 */

const DB_NAME = "psm-form-drafts";
const STORE = "drafts";
const VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftRecord<T = unknown> = {
  formKey: string;
  values: T;
  savedAt: number;
  userScope?: string | null;
};

function isSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "formKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function scopedKey(formKey: string, userScope?: string | null): string {
  if (!userScope) return formKey;
  return `${formKey}::${userScope}`;
}

export async function saveDraft<T>(
  formKey: string,
  values: T,
  userScope?: string | null,
): Promise<void> {
  if (!isSupported()) return;
  try {
    const db = await openDb();
    const record: DraftRecord<T> = {
      formKey: scopedKey(formKey, userScope),
      values,
      savedAt: Date.now(),
      userScope: userScope ?? null,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silent — draft persistence must never break the form.
  }
}

export async function loadDraft<T>(
  formKey: string,
  userScope?: string | null,
): Promise<DraftRecord<T> | null> {
  if (!isSupported()) return null;
  try {
    const db = await openDb();
    const record = await new Promise<DraftRecord<T> | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(scopedKey(formKey, userScope));
        req.onsuccess = () =>
          resolve((req.result as DraftRecord<T> | undefined) ?? null);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    if (!record) return null;
    if (Date.now() - record.savedAt > TTL_MS) return null;
    return record;
  } catch {
    return null;
  }
}

export async function clearDraft(
  formKey: string,
  userScope?: string | null,
): Promise<void> {
  if (!isSupported()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(scopedKey(formKey, userScope));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignored
  }
}

/**
 * Pure debounce (no external dep). Used by the React hook.
 */
export function debounced<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
