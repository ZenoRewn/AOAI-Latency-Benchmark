"use client";

import { forwardRef, type CSSProperties, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends ComponentProps<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.07em",
      shimmerDuration = "2.4s",
      borderRadius = "12px",
      background = "linear-gradient(135deg, #8661C5 0%, #0078D4 100%)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-white/10 px-6 py-3 text-white shadow-[0_2px_10px_rgba(134,97,197,0.35)] [background:var(--bg)] [border-radius:var(--radius)]",
          "transition-all duration-300",
          "hover:shadow-[0_6px_18px_rgba(134,97,197,0.5)]",
          "active:translate-y-px",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
          "[&>span]:relative [&>span]:z-10",
          className
        )}
        {...props}
      >
        <span className="flex items-center gap-2 font-medium tracking-tight">
          {children}
        </span>
        {/* shimmer sweep */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden [border-radius:var(--radius)]",
            "[mask:linear-gradient(#fff,transparent_70%)]"
          )}
        >
          <div
            className="absolute inset-[-100%] animate-[shimmer-slide_var(--speed)_linear_infinite]"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 340deg, var(--shimmer-color) 360deg)",
            }}
          />
        </div>
        {/* inner plate for opaque button face */}
        <div
          className="absolute inset-[var(--cut)] -z-[1] [background:var(--bg)] [border-radius:calc(var(--radius)-var(--cut))]"
        />
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
