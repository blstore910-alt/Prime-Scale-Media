"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearDraft,
  debounced,
  loadDraft,
  saveDraft,
  type DraftRecord,
} from "@/lib/form-draft";

type UseFormDraftOptions<T> = {
  formKey: string;
  values: T;
  userScope?: string | null;
  saveDebounceMs?: number;
  enabled?: boolean;
};

type UseFormDraftReturn<T> = {
  restoredDraft: DraftRecord<T> | null;
  hasDraft: boolean;
  clear: () => Promise<void>;
  dismissDraft: () => void;
};

/**
 * Auto-save the given form values to IndexedDB. On mount, look for an
 * existing draft under this formKey and surface it as `restoredDraft`
 * so the caller can render a "You have unsaved changes from earlier —
 * restore?" banner.
 *
 * Call `clear()` after a successful submit to remove the draft.
 * `dismissDraft()` hides the restore banner without deleting the draft.
 */
export function useFormDraft<T>({
  formKey,
  values,
  userScope,
  saveDebounceMs = 500,
  enabled = true,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const [restoredDraft, setRestoredDraft] = useState<DraftRecord<T> | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  const saveRef = useRef<ReturnType<typeof debounced> | null>(null);
  const initialLoadDone = useRef(false);

  // Load on mount
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadDraft<T>(formKey, userScope).then((d) => {
      if (!cancelled) {
        setRestoredDraft(d);
        initialLoadDone.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, userScope, enabled]);

  // Debounced save on every value change
  useEffect(() => {
    if (!enabled) return;
    // Skip save while initial load is still in flight — otherwise we
    // race the load and overwrite the draft with defaults.
    if (!initialLoadDone.current) return;
    if (!saveRef.current) {
      saveRef.current = debounced(
        () => saveDraft(formKey, values, userScope),
        saveDebounceMs,
      );
    } else {
      saveRef.current.cancel();
      saveRef.current = debounced(
        () => saveDraft(formKey, values, userScope),
        saveDebounceMs,
      );
    }
    saveRef.current();
    return () => {
      saveRef.current?.cancel();
    };
  }, [formKey, values, userScope, saveDebounceMs, enabled]);

  return {
    restoredDraft,
    hasDraft: !!restoredDraft && !dismissed,
    async clear() {
      setRestoredDraft(null);
      await clearDraft(formKey, userScope);
    },
    dismissDraft() {
      setDismissed(true);
    },
  };
}
