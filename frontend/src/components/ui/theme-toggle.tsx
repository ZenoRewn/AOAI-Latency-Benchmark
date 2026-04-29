"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  window.localStorage.setItem("theme", theme);
}

export function ThemeToggle({ className }: { className?: string }) {
  // Defer mount so SSR markup matches whatever the inline script set on <html>.
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "border border-[var(--border)] bg-[var(--card)] text-muted-foreground",
        "transition-colors hover:text-foreground hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className
      )}
    >
      {mounted ? (
        theme === "dark" ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}

/**
 * Inline script that runs before hydration to apply the saved theme
 * (or system preference) to <html>, preventing a light→dark flash.
 * Stringified so it can be injected via <Script strategy="beforeInteractive">.
 */
export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (mql.matches ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;
