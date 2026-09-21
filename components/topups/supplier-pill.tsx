"use client";

import { ExternalLink, Zap } from "lucide-react";

import type { SupplierLink } from "@/hooks/use-supplier-link";

/**
 * The link an admin follows to fund an account by hand.
 *
 * ADMIN-ONLY. This prints a supplier's name, which must never appear on
 * an advertiser or affiliate surface — only render it inside an admin
 * screen.
 *
 * Three states, and they are all worth saying out loud:
 *  - a link  -> the pill, which opens their dashboard in a new tab
 *  - API     -> there is an API for this type, so there is no supplier
 *               dashboard to log into. It does NOT mean anything has
 *               been funded: the admin still pushes it and checks.
 *  - nothing -> the type has no supplier recorded; point at where to
 *               put one rather than showing an empty space, because an
 *               empty space is what sent the admin guessing.
 */
export default function SupplierPill({
  link,
  compact,
}: {
  link: SupplierLink | null;
  compact?: boolean;
}) {
  if (!link) return null;

  // ── API WINS OVER THE LINK, BUT IT DOES NOT FUND ANYTHING ───────
  //
  // This said "Funded automatically", which is not true and is not what
  // the owner wants: nothing is pushed to the supplier on its own, and
  // it should not be. The admin checks the top-up and pushes it
  // themselves.
  //
  // On a card whose next control is "Verify", a green pill reading
  // "Funded automatically" tells the person about to press it that the
  // money is already on the account. It is not. So the pill says what
  // is actually true about this ACCOUNT TYPE -- there is an API, so no
  // supplier dashboard to go and log into -- and says nothing about
  // whether anything has happened.
  if (link.apiEnabled) {
    return (
      <span
        className="suppill auto"
        title="This type can be funded through the API — an admin still pushes it and checks it"
      >
        <Zap />
        API available
      </span>
    );
  }

  if (!link.url) {
    return (
      <span
        className="suppill none"
        title={`No supplier dashboard recorded for ${
          link.typeLabel || "this type"
        }. Settings -> Finance -> Ad-account types.`}
      >
        No supplier link
      </span>
    );
  }

  return (
    <a
      className="suppill"
      href={link.url}
      target="_blank"
      // noopener because the new tab gets window.opener otherwise, and
      // this is a link an admin clicks from inside their own session.
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open ${link.label} to do this top-up by hand${
        link.host ? ` (${link.host})` : ""
      }`}
    >
      <ExternalLink />
      {compact ? link.label : `Top up at ${link.label}`}
    </a>
  );
}

/** Scoped styles, injected once by whichever screen renders the pill. */
export const SUPPLIER_PILL_CSS = `
.suppill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 9px;
  border-radius:999px;border:1px solid var(--line-2);background:var(--panel-2);
  font-weight:700;font-size:.78rem;color:var(--ink);text-decoration:none;
  white-space:nowrap;transition:.13s;cursor:pointer}
.suppill:hover{border-color:var(--primary);background:var(--primary-tint);
  color:var(--primary-600)}
.suppill svg{width:13px;height:13px;flex:0 0 auto}
.suppill.auto{border-color:#cfe6d6;background:#eefaf1;color:#1f7a45;cursor:default}
.suppill.auto:hover{border-color:#cfe6d6;background:#eefaf1;color:#1f7a45}
.suppill.none{border-style:dashed;color:var(--faint);cursor:help}
.suppill.none:hover{border-color:var(--line-2);background:var(--panel-2);
  color:var(--faint)}
`;
