"use client";

import React, { useCallback } from "react";

import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: ChartCardProps) {
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);

  const handleLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--mx", "50%");
    e.currentTarget.style.setProperty("--my", "50%");
  }, []);

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        "surface-glow rounded-xl flex flex-col shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between p-5 pb-0">
        <div>
          <h3 className="panel-title">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 ml-4">{action}</div>}
      </div>

      <div className="flex-1 p-5 pt-4">{children}</div>
    </div>
  );
}
