"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inspectToken, setUserToken } from "@/lib/userToken";

const AZ_COMMAND =
  "az account get-access-token --resource https://management.azure.com --query accessToken -o tsv";

interface TokenPasteProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function TokenPaste({ open, onClose, onSaved }: TokenPasteProps) {
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      setPasted("");
      setError(null);
      setCopied(false);
      return;
    }
    // Autofocus the command block first so the user's flow is "copy → terminal
    // → paste" without fiddling.
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AZ_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not access clipboard. Select the command and copy manually.");
    }
  }, []);

  const looksLikeJwt = pasted.trim().split(".").length === 3;
  const canSubmit = looksLikeJwt;

  const save = useCallback(() => {
    const trimmed = pasted.trim();
    const result = setUserToken(trimmed);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    onSaved?.();
    onClose();
  }, [pasted, onSaved, onClose]);

  // Cheap preview: show what the UI will display if the user submits this token.
  const preview = (() => {
    if (!looksLikeJwt) return null;
    const r = inspectToken(pasted.trim());
    if (!r.ok) return null;
    const minutes = Math.max(0, Math.floor((r.info.expiresAtMs - Date.now()) / 60_000));
    return {
      account: r.info.displayName,
      tenant: typeof r.info.claims.tid === "string" ? r.info.claims.tid : "",
      minutes,
    };
  })();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-[#E8E4F0] max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-[#E8E4F0] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#2D2B3A]">
              Sign in with your Azure credentials
            </h2>
            <p className="text-sm text-[#7A7490] mt-1">
              Paste a one-hour Azure Resource Manager access token. Everything you see
              below happens inside this browser tab — the token is kept in{" "}
              <code className="px-1 py-0.5 rounded bg-[#F3F0F9] text-[#6E56A2] text-xs">
                sessionStorage
              </code>{" "}
              and discarded when you close the tab.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#7A7490] hover:text-[#2D2B3A] text-xl leading-none p-1"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <ol className="space-y-4 text-sm text-[#2D2B3A]">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#8661C5] text-white text-xs flex items-center justify-center font-semibold">
                1
              </span>
              <div>
                <div className="font-medium">Open a terminal on your own machine</div>
                <div className="text-[#7A7490] text-xs mt-0.5">
                  Anywhere the Azure CLI is installed and you can run{" "}
                  <code className="px-1 py-0.5 rounded bg-[#F3F0F9] text-[#6E56A2]">az</code>.
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#8661C5] text-white text-xs flex items-center justify-center font-semibold">
                2
              </span>
              <div className="flex-1">
                <div className="font-medium">
                  Make sure you&apos;re signed in to the subscription you want to use
                </div>
                <div className="text-[#7A7490] text-xs mt-0.5">
                  Run <code className="px-1 py-0.5 rounded bg-[#F3F0F9] text-[#6E56A2]">az login</code>{" "}
                  if you haven&apos;t already, then{" "}
                  <code className="px-1 py-0.5 rounded bg-[#F3F0F9] text-[#6E56A2]">az account set -s &lt;subscription-id&gt;</code>{" "}
                  to pick the right one.
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#8661C5] text-white text-xs flex items-center justify-center font-semibold">
                3
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">Run this command and copy its output</div>
                <div className="mt-2 rounded-lg border border-[#E8E4F0] bg-[#F8F5FC] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E4F0]">
                    <span className="text-[10px] uppercase tracking-wide text-[#7A7490]">
                      Azure CLI
                    </span>
                    <button
                      type="button"
                      onClick={copyCommand}
                      className="text-xs px-2 py-1 rounded-md bg-white border border-[#E8E4F0] text-[#8661C5] hover:bg-[#F3F0F9] transition-colors font-medium"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="px-3 py-2 overflow-x-auto text-xs font-mono text-[#2D2B3A] whitespace-pre-wrap break-all">
                    {AZ_COMMAND}
                  </pre>
                </div>
                <p className="text-xs text-[#7A7490] mt-2">
                  Output is a long JWT string (three dot-separated segments). It&apos;s
                  valid for about an hour — we&apos;ll tell you when it&apos;s about to
                  expire.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#8661C5] text-white text-xs flex items-center justify-center font-semibold">
                4
              </span>
              <div className="flex-1">
                <div className="font-medium">Paste the token below</div>
                <textarea
                  ref={textareaRef}
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
                      e.preventDefault();
                      save();
                    }
                  }}
                  placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOi..."
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-[#E8E4F0] px-3 py-2 text-xs font-mono text-[#2D2B3A] placeholder:text-[#C9C0DB] focus:outline-none focus:ring-2 focus:ring-[#8661C5] focus:border-transparent break-all"
                  spellCheck={false}
                  autoComplete="off"
                />
                {preview && (
                  <div className="mt-2 text-xs text-[#6E56A2] bg-[#F3F0F9] rounded-md px-3 py-2">
                    Detected: <span className="font-semibold">{preview.account}</span>
                    {preview.tenant && (
                      <span className="text-[#7A7490]"> · tenant {preview.tenant.slice(0, 8)}…</span>
                    )}
                    <span className="text-[#7A7490]"> · {preview.minutes}m left</span>
                  </div>
                )}
                {error && (
                  <div className="mt-2 text-xs text-[#B9375E] bg-[#FDE7EE] rounded-md px-3 py-2">
                    {error}
                  </div>
                )}
              </div>
            </li>
          </ol>
        </div>

        <div className="px-6 py-4 border-t border-[#E8E4F0] flex items-center justify-between gap-3 bg-[#FAF9FC] rounded-b-2xl">
          <p className="text-xs text-[#7A7490]">
            We never store tokens server-side. They live only in this browser tab.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSubmit}>
              Use this token
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
