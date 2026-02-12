import { Slot } from "@radix-ui/react-slot";
import { RiLoader2Fill } from "@remixicon/react";
import React from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cx, focusRing } from "@/lib/utils";

const buttonVariants = tv({
  base: [
    // base
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-center text-sm font-medium shadow-sm transition-all duration-100 ease-in-out cursor-pointer",
    // disabled
    "disabled:pointer-events-none disabled:shadow-none",
    // focus
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        "border-transparent",
        "text-primary-action-foreground",
        "bg-primary-action",
        "hover:bg-primary-action/90",
        "disabled:opacity-50 disabled:bg-primary-action/50",
      ],
      secondary: [
        "border-border",
        "text-secondary-foreground",
        "bg-secondary",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:opacity-50 disabled:bg-secondary",
      ],
      light: [
        "shadow-none border-transparent",
        "text-foreground",
        "bg-muted",
        "hover:bg-muted/80",
        "disabled:opacity-50 disabled:bg-muted",
      ],
      ghost: [
        "shadow-none border-transparent",
        "text-foreground",
        "bg-transparent hover:bg-accent hover:text-accent-foreground",
        "disabled:opacity-50",
      ],
      destructive: [
        "border-transparent",
        "text-destructive-foreground",
        "bg-destructive",
        "hover:bg-destructive/90",
        "disabled:opacity-50 disabled:bg-destructive/50",
      ],
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

interface ButtonProps
  extends
    React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill
              className="size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">
              {loadingText ? loadingText : "Loading"}
            </span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
