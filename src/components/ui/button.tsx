import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // ── Existing ──────────────────────────────────────────────────────────
        default:
          "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",

        // ── New ───────────────────────────────────────────────────────────────
        // flat: used for active tab/filter buttons — subtle fill, no border
        flat: "border-transparent bg-[var(--bg-card-hover)] text-[var(--text-primary)] shadow-none hover:brightness-110",
        // flat-ghost: inactive state companion for flat (transparent bg, muted text)
        "flat-ghost":
          "border-transparent bg-transparent text-[var(--text-muted)] shadow-none hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-secondary)]",
        // soft: tinted dim bg + colored text + subtle border — requires color prop
        soft: "border",
      },

      // color — applies to `default` (solid) and `soft` (tinted) variants
      color: {
        purple: "",
        green:  "",
        amber:  "",
        blue:   "",
        red:    "",
      },

      size: {
        default:
          "h-8 gap-1.5 px-1.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-1.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-1.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },

    compoundVariants: [
      // ── default + color (solid fill) ──────────────────────────────────────
      {
        variant: "default",
        color: "purple",
        className:
          "bg-[var(--accent-purple)] text-white hover:brightness-110",
      },
      {
        variant: "default",
        color: "green",
        className:
          "bg-[var(--accent-green)] text-white hover:brightness-110",
      },
      {
        variant: "default",
        color: "amber",
        className:
          "bg-[var(--accent-amber)] text-black hover:brightness-110",
      },
      {
        variant: "default",
        color: "blue",
        className:
          "bg-[var(--accent-blue)] text-white hover:brightness-110",
      },
      {
        variant: "default",
        color: "red",
        className:
          "bg-[var(--accent-red)] text-white hover:brightness-110",
      },

      // ── soft + color (tinted dim bg) ──────────────────────────────────────
      {
        variant: "soft",
        color: "purple",
        className:
          "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)] border-[var(--accent-purple)]/30 hover:bg-[var(--accent-purple)]/20",
      },
      {
        variant: "soft",
        color: "green",
        className:
          "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[var(--accent-green)]/30 hover:bg-[var(--accent-green)]/20",
      },
      {
        variant: "soft",
        color: "amber",
        className:
          "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/20",
      },
      {
        variant: "soft",
        color: "blue",
        className:
          "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20",
      },
      {
        variant: "soft",
        color: "red",
        className:
          "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border-[var(--accent-red)]/30 hover:bg-[var(--accent-red)]/20",
      },
    ],

    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  color,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, color, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
