import React from "react";

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
  className = "",
}: ChartCardProps) {
  return (
    <div
      className={`bg-white shadow-sm rounded-xl border border-[#E8E4F0] ${className}`}
    >
      {/* CardHeader */}
      <div className="flex items-start justify-between p-5 pb-0">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 ml-4">{action}</div>}
      </div>

      {/* CardContent */}
      <div className="p-5">{children}</div>
    </div>
  );
}
