import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// The same treatment the shells' own .btn got, applied here so the dialogs
// and forms built from shadcn match: a light source (a gradient brighter at
// the top, a hairline of white along the top edge), a shadow tinted with the
// button's own hue rather than grey, a real press, and a focus ring that is
// actually visible. Radii go up a step — rounded-md next to the app's 11-14px
// corners read as a different product.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[transform,box-shadow,filter,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-brand-strong text-white bg-gradient-to-b from-white/[.17] to-transparent to-[58%] shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_10px_22px_-14px_rgba(58,111,255,.85),0_2px_5px_-3px_rgba(20,30,80,.35)] hover:-translate-y-px hover:brightness-[1.04] active:brightness-[.98]",
        destructive:
          "bg-destructive text-destructive-foreground bg-gradient-to-b from-white/[.18] to-transparent to-[58%] shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_10px_22px_-14px_rgba(229,72,77,.9)] hover:-translate-y-px hover:brightness-[1.04]",
        outline:
          "border border-input bg-gradient-to-b from-white to-muted/60 shadow-[inset_0_1px_0_#fff,0_2px_5px_-4px_rgba(20,30,80,.4)] hover:border-ring hover:text-foreground hover:shadow-[inset_0_1px_0_#fff,0_8px_16px_-12px_rgba(20,30,80,.5)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
