"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TokenPaste } from "./TokenPaste";
import { useUserToken } from "@/hooks/useUserToken";

export function SignInBar() {
  const { token, minutesLeft, expiringSoon, clear } = useUserToken();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-2">
      {expiringSoon && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#A5570F] bg-[#FEF3E2] border border-[#F4D5A2] rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F7B955]" />
          Token expires in {minutesLeft}m
        </span>
      )}

      {token ? (
        <>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-[#E8E4F0] bg-white hover:bg-[#F3F0F9] text-[#2D2B3A] transition-colors"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="w-2 h-2 rounded-full bg-[#22A06B]" />
            <span className="font-medium max-w-[200px] truncate">
              {token.displayName}
            </span>
            <span className="text-[#7A7490]">· {minutesLeft}m</span>
            <svg
              className="w-3 h-3 text-[#7A7490]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <>
              {/* click-away */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-[#E8E4F0] bg-white shadow-lg py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#2D2B3A] hover:bg-[#F3F0F9]"
                >
                  Refresh token…
                  <div className="text-[10px] text-[#7A7490] mt-0.5">
                    Paste a fresh one-hour token
                  </div>
                </button>
                <div className="border-t border-[#E8E4F0] my-1" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    clear();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#B9375E] hover:bg-[#FDE7EE]"
                >
                  Sign out
                  <div className="text-[10px] text-[#B9375E]/70 mt-0.5">
                    Clears the token from this tab
                  </div>
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <svg
            className="w-3.5 h-3.5 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0c0 3.042-4.03 9-9 9s-9-5.958-9-9 4.03-9 9-9 9 5.958 9 9z"
            />
          </svg>
          Sign in with Azure
        </Button>
      )}

      <TokenPaste open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
