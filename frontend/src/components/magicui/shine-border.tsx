"use client";

import { cn } from "@/lib/utils";

interface ShineBorderProps {
  borderWidth?: number;
  duration?: number;
  shineColor?: string | string[];
  className?: string;
  style?: React.CSSProperties;
}

export function ShineBorder({
  borderWidth = 1.5,
  duration = 10,
  shineColor = ["#8661C5", "#0078D4", "#8DC8E8"],
  className,
  style,
}: ShineBorderProps) {
  const colors = Array.isArray(shineColor) ? shineColor : [shineColor];
  const gradient = `radial-gradient(transparent, transparent, ${colors.join(",")}, transparent, transparent)`;
  return (
    <div
      style={
        {
          "--border-width": `${borderWidth}px`,
          "--duration": `${duration}s`,
          backgroundImage: gradient,
          backgroundSize: "300% 300%",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "var(--border-width)",
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] animate-[shine-pulse_var(--duration)_linear_infinite] will-change-[background-position]",
        className
      )}
    />
  );
}
