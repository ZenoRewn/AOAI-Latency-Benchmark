"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[minmax(320px,auto)] grid-cols-1 gap-4 md:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  colSpan?: 2 | 3 | 4 | 6;
}

export function BentoCard({
  children,
  className,
  title,
  description,
  action,
  colSpan = 6,
}: BentoCardProps) {
  const span: Record<number, string> = {
    2: "md:col-span-2",
    3: "md:col-span-3",
    4: "md:col-span-4",
    6: "md:col-span-6",
  };
  return (
    <div
      className={cn(
        "group/bento relative flex flex-col overflow-hidden rounded-xl border border-[#E8E4F0] bg-white shadow-sm transition-all duration-300",
        "hover:shadow-md hover:ring-1 hover:ring-[#8661C5]/20",
        span[colSpan],
        className
      )}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-[#E8E4F0]/70 px-5 py-4">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="relative flex-1 p-5">{children}</div>
    </div>
  );
}
