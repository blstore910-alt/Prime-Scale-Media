"use client";

import { useRef, useState } from "react";
import { Archive, Undo2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// Swipe a row sideways to put it aside
// ─────────────────────────────────────────────────────────────────────
// Working a queue on a phone, the thing you want after reading an alert
// is for it to go away -- and the only control was "delete all read",
// which is all-or-nothing and destroys the row.
//
// Pointer events rather than touch events: one code path for a finger,
// a trackpad and a stylus, and the browser hands us capture so a swipe
// that leaves the element still finishes.
//
// Two things this gets right that a naive implementation does not:
//
//  * A SWIPE IS NOT A TAP. The row underneath opens a dialog. So the
//    click is suppressed once the finger has travelled far enough to be
//    a swipe -- otherwise every dismissal also opened the thing you were
//    dismissing.
//  * A VERTICAL DRAG IS A SCROLL. The first few pixels decide which it
//    is; if the finger is going down the page we let go entirely, so a
//    list cannot be made unscrollable by rows that grab every gesture.
//
// And a button, always: a swipe is invisible to a keyboard and to a
// screen reader, so it is the shortcut, never the only way.
// ─────────────────────────────────────────────────────────────────────

const THRESHOLD = 88; // px of travel that counts as "yes, archive it"
const SLOP = 10; // px before we decide horizontal vs vertical

export function SwipeToArchive({
  children,
  onArchive,
  archived,
  label,
  disabled,
}: {
  children: React.ReactNode;
  /** May return a promise; the row stays off screen until it settles. */
  onArchive: () => void | Promise<unknown>;
  /** Already in the archive: the gesture puts it back instead. */
  archived?: boolean;
  /** What is being put aside, for the button's accessible name. */
  label: string;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const swiped = useRef(false);

  const end = (commit: boolean) => {
    start.current = null;
    axis.current = "none";
    if (commit) {
      setGone(true);
      // Let the row travel off before the list re-renders without it.
      // A row that vanishes under the finger reads as a mis-tap.
      //
      // ── AND COME BACK IF IT DID NOT TAKE ──────────────────────────
      //
      // `gone` translates the row 110% off its own overflow:hidden
      // container. When the update is refused -- RLS, the row gone, a
      // zero-row write -- the toast appears and the row stays in the
      // list, so what was left was an empty grey band reading
      // "Archive" where an alert used to be. That alert can be "your
      // top-up was rejected", and it was unreadable until reload.
      //
      // onArchive may be sync or async; Promise.resolve covers both,
      // and a throw is caught rather than becoming unhandled.
      window.setTimeout(() => {
        Promise.resolve()
          .then(() => onArchive())
          .catch(() => {})
          .finally(() => {
            // Only if the parent did NOT remove us. If it did, this
            // component is unmounted and the setState is a no-op React
            // ignores.
            setGone(false);
            setDx(0);
          });
      }, 140);
      return;
    }
    setDx(0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || gone) return;
    // Mouse drags are not a gesture anybody expects; the button is there.
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = "none";
    swiped.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;

    if (axis.current === "none") {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      // Down the page: hands the gesture back to the scroller.
      if (axis.current === "y") {
        start.current = null;
        return;
      }
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Capture is a convenience; without it a swipe that leaves the
        // row simply ends, which pointercancel handles.
      }
    }

    if (axis.current !== "x") return;
    swiped.current = true;
    // Resistance past the threshold: it should feel like it is about to
    // go, not like a free-moving object with no decision point.
    const over = Math.max(0, Math.abs(mx) - THRESHOLD);
    const eased = Math.sign(mx) * (Math.abs(mx) - over * 0.65);
    setDx(eased);
  };

  const onPointerUp = () => {
    if (!start.current && axis.current !== "x") {
      setDx(0);
      return;
    }
    end(Math.abs(dx) >= THRESHOLD);
  };

  const past = Math.abs(dx) >= THRESHOLD;
  const Icon = archived ? Undo2 : Archive;
  const word = archived ? "Restore" : "Archive";

  return (
    <div className={"swiperow" + (gone ? " gone" : "")}>
      <div className={"swipeback" + (past ? " armed" : "")} aria-hidden>
        <Icon />
        <span>{word}</span>
      </div>

      <div
        className="swipefront"
        style={{
          transform: gone
            ? `translateX(${dx < 0 ? "-110%" : "110%"})`
            : `translateX(${dx}px)`,
          transition: start.current ? "none" : "transform .18s ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => end(false)}
        // A swipe must not also be a tap on the row underneath.
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {children}
        <button
          type="button"
          className="swipebtn"
          disabled={disabled}
          aria-label={`${word}: ${label}`}
          title={word}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            end(true);
          }}
        >
          <Icon />
        </button>
      </div>
    </div>
  );
}
