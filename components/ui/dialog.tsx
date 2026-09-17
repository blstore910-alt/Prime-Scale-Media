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
      "fixed inset-0 z-50 bg-[#090e26]/55 backdrop-blur-[6px] backdrop-saturate-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
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
        "shadow-[0_2px_6px_-2px_rgba(20,30,80,.3),0_40px_80px_-40px_rgba(20,30,80,.65)]",
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
        className
      )}
      {...props}
    >
      {/* Grab handle, so the sheet reads as something you can push back down.
          Nothing to grab on a desktop, where it is a centred card. */}
      <div
        aria-hidden
        className="sticky top-0 -mt-1 mb-1 h-1 w-9 shrink-0 justify-self-center rounded-full bg-border sm:hidden"
      />
      {children}
      <DialogPrimitive.Close className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none cursor-pointer sm:right-4 sm:top-4">
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
      "flex flex-col space-y-1.5 border-b pb-3.5 pr-10 text-left",
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
      "text-lg font-bold leading-tight tracking-[-0.02em]",
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
