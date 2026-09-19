"use client";

import { copyText } from "@/lib/copy-text";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A value you can take with you.
 *
 * Detail sheets are where someone goes to GET a number — a VAT id, an IBAN,
 * a registration number, an email — and then paste it into an invoice, a
 * bank form or a reply. Selecting it by hand on a phone means a long-press,
 * a pair of drag handles and usually catching the label too.
 *
 * Renders "—" as plain text: there is nothing to copy, and offering a copy
 * button for an empty value is a control that does nothing.
 */
export default function Copyable({
  value,
  label,
  mono = false,
}: {
  value?: string | null;
  /** What was copied, for the confirmation. Defaults to "Value". */
  label?: string;
  mono?: boolean;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const text = (value ?? "").trim();
  if (!text || text === "—") {
    return <div className="d">—</div>;
  }

  const copy = async () => {
    try {
      if (!(await copyText(text))) throw new Error("copy refused");
      setState("done");
    } catch {
      // Blocked: an insecure context, a denied permission, or a browser that
      // refuses without a user gesture it recognises. Say so rather than
      // showing a tick for something that did not happen.
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      type="button"
      className={`copyable${mono ? " mono" : ""}${state === "done" ? " done" : ""}`}
      onClick={copy}
      title={state === "failed" ? "Clipboard blocked" : `Copy ${label ?? "value"}`}
      aria-label={`Copy ${label ?? "value"}: ${text}`}
    >
      <span className="cv">{text}</span>
      {state === "done" ? (
        <Check className="ci" aria-hidden />
      ) : (
        <Copy className="ci" aria-hidden />
      )}
      {state === "failed" && <span className="cfail">blocked</span>}
    </button>
  );
}
