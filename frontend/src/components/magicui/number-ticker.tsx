"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  decimals?: number;
  className?: string;
  delay?: number;
  suffix?: string;
  prefix?: string;
}

export function NumberTicker({
  value,
  decimals = 0,
  className,
  delay = 0,
  suffix = "",
  prefix = "",
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    damping: 60,
    stiffness: 120,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  useEffect(() => {
    if (!isInView) return;
    const t = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(t);
  }, [isInView, motionValue, value, delay]);

  useEffect(() => {
    return spring.on("change", (latest) => {
      if (!ref.current) return;
      ref.current.textContent =
        prefix +
        Number(latest).toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) +
        suffix;
    });
  }, [spring, decimals, prefix, suffix]);

  return (
    <span
      ref={ref}
      className={cn("tabular-nums", className)}
    >
      {prefix}
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  );
}
