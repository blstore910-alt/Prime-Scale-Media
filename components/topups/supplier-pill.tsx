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
  //
  // AND IT SAYS WHAT TO DO, because the other two pills do.
  // "Top up at Rockads" is an instruction. "No supplier link" points at
  // the setting that fixes it. "API available" was a property of the
  // account type -- true, and no use to the person reading it.
  //
  // The owner, 29-09, on the first attempt ("Fund in this app"):
  // "fund manually is toch corrector?" Yes, and it is the better word
  // for the reason that matters: NOTHING here happens on its own. The
  // API exists, but no top-up is pushed until a person presses it --
  // and on production SUPPLIER1_MODE is not "live", so today the push
  // reaches the mock. A label promising the app does it would be
  // making a promise the app is not currently keeping.
  //
  // He also suggested "at supplier", and that one would be wrong HERE:
  // this is the branch where there is no supplier dashboard at all --
  // which is exactly what separates it from its neighbour, "Top up at
  // Rockads". So: manually, and the tooltip says where.
  if (link.apiEnabled) {
    return (
      <span
        className="suppill auto"
        title="No supplier dashboard for this type — the top-up is pushed from this app. Nothing is sent on its own: an admin still pushes it and checks it landed."
      >
        <Zap />
        Fund manually
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
