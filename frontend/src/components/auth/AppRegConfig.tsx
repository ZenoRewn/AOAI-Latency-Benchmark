"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppRegConfig } from "@/lib/msal";

interface AppRegConfigDialogProps {
  open: boolean;
  initial?: AppRegConfig | null;
  onCancel: () => void;
  onSave: (cfg: AppRegConfig) => void | Promise<void>;
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function AppRegConfigDialog({
  open,
  initial,
  onCancel,
  onSave,
}: AppRegConfigDialogProps) {
  const [clientId, setClientId] = useState("");
  const [tenant, setTenant] = useState("organizations");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setClientId(initial?.client_id ?? "");
      setTenant(initial?.tenant ?? "organizations");
      setSubmitting(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const clientIdValid = GUID_RE.test(clientId.trim());
  const tenantValid = tenant.trim().length > 0;
  const canSave = clientIdValid && tenantValid && !submitting;

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      await onSave({ client_id: clientId.trim(), tenant: tenant.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[#2D2B3A]">
          Configure Entra ID App Registration
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Point this app at an Entra ID App Registration you control. The client
          id and tenant live only in this browser&apos;s <code>localStorage</code>.
        </p>

        <ol className="mt-4 space-y-2 rounded-lg border border-[#E8E4F0] bg-[#FAF8FD] p-4 text-xs text-[#2D2B3A]">
          <li>
            1. In Azure Portal, register a new <strong>Single-page application</strong> with
            redirect URI <code className="text-[11px]">{typeof window !== "undefined" ? window.location.origin : ""}</code>.
          </li>
          <li>
            2. Under <em>API permissions</em>, add delegated permissions for:
            <div className="mt-1 ml-2 space-y-0.5">
              <div><code className="text-[11px]">Azure Service Management</code> → <code>user_impersonation</code></div>
              <div><code className="text-[11px]">Azure OpenAI / Cognitive Services</code> → <code>user_impersonation</code></div>
            </div>
          </li>
          <li>3. Grant admin consent (or let each user consent on sign-in).</li>
          <li>4. Copy the Application (client) ID and Directory (tenant) ID below.</li>
        </ol>

        <div className="mt-5 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="client-id">Application (client) ID</Label>
            <Input
              id="client-id"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {clientId && !clientIdValid && (
              <p className="text-xs text-red-600">Must be a GUID.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tenant">Directory (tenant) ID</Label>
            <Input
              id="tenant"
              placeholder="tenant GUID, or 'organizations' / 'common'"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Use <code>organizations</code> if your app is multi-tenant, or paste a tenant GUID to lock sign-in to one directory.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {submitting ? "Signing in…" : "Save & Sign in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
