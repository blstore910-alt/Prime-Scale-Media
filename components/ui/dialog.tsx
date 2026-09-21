"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Tinted and blurred rather than 80% black. A flat black sheet hides
      // the page instead of putting the dialog in front of it, and it makes
      // every modal in the app feel like an interstitial.
      "fixed inset-0 z-50 bg-[#090e26]/62 backdrop-blur-[10px] backdrop-saturate-[1.6]",
      // A shade longer on the way in than on the way out. Opening is the
      // moment the page recedes and the dialog arrives, and it wants to
      // be felt; closing should just get out of the way.
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 grid gap-4 border bg-background overflow-y-auto duration-200",
        // THREE LAYERS, NOT ONE. A single soft drop shadow reads as a box
        // someone forgot to style: a hairline of light along the top edge
        // (the sheet catching the light it is lit by), a tight contact
        // shadow that seats it, and a long soft one that lifts it off the
        // page. This is the difference people mean by "it looks
        // expensive" — it is not a colour, it is the edge.
        "shadow-[inset_0_1px_0_rgba(255,255,255,.75),0_1px_3px_-1px_rgba(20,30,80,.28),0_28px_60px_-28px_rgba(20,30,80,.55),0_56px_110px_-60px_rgba(20,30,80,.7)]",
        "border-[color:var(--line,rgba(20,30,80,.10))]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        // On a phone it is a sheet: attached to the edge it came from, square
        // against that edge, and it slides up from it. A floating centred box
        // is the giveaway that something was designed for a desktop first —
        // and it sits over the thumb rail rather than under it.
        "inset-x-0 bottom-0 top-auto w-full max-h-[92dvh] rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
        "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
        // From sm up it becomes the centred card again.
        //
        // NOTE FOR CALL SITES: the width here is `sm:max-w-lg`, so a call
        // site that wants a wider dialog must ALSO use the sm: prefix.
        // `className="max-w-2xl"` looks like it works and does not: below sm
        // it caps a sheet that should be full width, and from sm up this
        // prefixed class wins, so the dialog silently stays lg. Four call
        // sites were written that way.
        "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:max-h-[90dvh]",
        "sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:p-6 sm:pb-6",
        "sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=closed]:slide-out-to-bottom-4",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        // The easing is the whole trick. A linear or ease-out dialog
        // arrives; one that overshoots a hair and settles has been placed
        // there. Kept small — a bouncing money dialog is a toy.
        "[animation-timing-function:cubic-bezier(.16,1,.3,1)]",
        className
      )}
      {...props}
    >
      {/* Grab handle, so the sheet reads as something you can push back down.
          Nothing to grab on a desktop, where it is a centred card. */}
      <div
        aria-hidden
        /* mx-auto, NOT justify-self-center. justify-self only does anything
            in a grid, and DialogContent's base display is grid — but any
            call site that overrides it to `flex flex-col` (the wallet
            top-up, the ad-account request, the fund form) silently loses
            the centring, and the handle drops to the left edge of the
            sheet. An auto margin centres it under both. */
          /* ABSOLUTE IN THE TOP PADDING, NOT STICKY IN THE FLOW. Sticky
             kept it pinned over whatever scrolled under it, and in the
             flow it landed on the title ("Fund this ad account", the
             rules editor) -- the owner saw a grey bar through text twice.
             The sheet has 20px of top padding; the bar sits at 8px and is
             6px tall, so it can never touch the first line. */
          className="pointer-events-none absolute left-1/2 top-2 z-10 h-1.5 w-11 -translate-x-1/2 rounded-full bg-[color:var(--line-2,rgba(20,30,80,.18))] sm:hidden"
      />
      {children}
      {/* 36px, not 32: this is the control people reach for by mistake
          and then cannot hit. It also gets a resting ground now, so it
          reads as a button before the pointer is over it. */}
      <DialogPrimitive.Close className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-transparent bg-[color:var(--panel-2,rgba(20,30,80,.04))] text-muted-foreground transition-[background-color,color,border-color,transform] duration-150 hover:border-[color:var(--line,rgba(20,30,80,.12))] hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none cursor-pointer sm:right-4 sm:top-4">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  // A hairline under the title, so a dialog has a head and a body rather
  // than one undifferentiated column of text. pr-10 keeps the title clear of
  // the close button instead of running under it.
  <div
    className={cn(
      // The rule fades toward the right rather than stopping dead at the
      // edge, so the head reads as part of the card instead of a band
      // stuck across it.
      "relative flex flex-col space-y-1 pb-4 pr-10 text-left",
      "after:absolute after:inset-x-0 after:bottom-0 after:h-px",
      "after:bg-[linear-gradient(90deg,var(--line,rgba(20,30,80,.14)),transparent)]",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  // Full-width stacked buttons on a phone — a 90px button floating at the
  // right edge of a sheet is hard to hit and looks unfinished — and a
  // hairline above, matching the header.
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t pt-4 [&>button]:w-full sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0 sm:[&>button]:w-auto",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      // The brand display face, the size the rest of the app uses for a
      // card heading. A dialog title set in the body face at the body
      // weight is why these read as forms rather than as moments.
      "font-[family-name:var(--hd,inherit)] text-[1.15rem] font-extrabold leading-tight tracking-[-0.025em]",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
