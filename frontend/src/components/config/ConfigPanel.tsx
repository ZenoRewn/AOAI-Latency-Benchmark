"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useDiscovery } from "@/hooks/useDiscovery";
import { useMsal } from "@/hooks/useMsal";
import { AppRegConfigDialog } from "@/components/auth/AppRegConfig";
import { getActiveConfig } from "@/lib/msal";
import {
  API_TYPE_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  REASONING_SUMMARY_OPTIONS,
} from "@/lib/constants";
import type {
  AppConfig,
  BenchmarkConfig,
  RegionConfig,
  DiscoveredResource,
} from "@/types/benchmark";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConfigPanelProps {
  onStart: (config: BenchmarkConfig) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfigPanel({ onStart }: ConfigPanelProps) {
  // ---- remote config ----
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const auth = useAuth();
  const msal = useMsal();
  const discovery = useDiscovery();

  useEffect(() => {
    apiFetch<AppConfig>("/api/config")
      .then(setAppConfig)
      .catch(() => {
        /* swallow – user will see empty defaults */
      })
      .finally(() => setConfigLoading(false));
  }, []);

  // ---- region state ----
  const [configuredRegions, setConfiguredRegions] = useState<RegionConfig[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<
    Set<string>
  >(new Set());
  const [manualName, setManualName] = useState("");
  const [manualEndpoint, setManualEndpoint] = useState("");
  const [manualApiKey, setManualApiKey] = useState("");

  // Region tab: defaults to Manual when the user is not signed in, auto-flips
  // to Auto Discover on sign-in.
  const [regionTab, setRegionTab] = useState<string>("manual");
  const [appRegOpen, setAppRegOpen] = useState(false);

  // ---- model state ----
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [customModel, setCustomModel] = useState("");

  // ---- test params ----
  const [mode, setMode] = useState<"benchmark" | "monitor">("benchmark");
  const [monitorInterval, setMonitorInterval] = useState(60);
  const [monitorDuration, setMonitorDuration] = useState(3600);
  const [selectedApiTypes, setSelectedApiTypes] = useState<Set<string>>(
    new Set(["chat"])
  );
  const [iterations, setIterations] = useState(5);
  const [rounds, setRounds] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [maxTokens, setMaxTokens] = useState(100);
  const [selectedEfforts, setSelectedEfforts] = useState<Set<string>>(
    new Set([""])
  );
  const [reasoningSummary, setReasoningSummary] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant."
  );
  const [userPrompt, setUserPrompt] = useState(
    "Write a short paragraph about cloud computing."
  );
  const [streaming, setStreaming] = useState(true);
  const [warmup, setWarmup] = useState(true);
  const [testCache, setTestCache] = useState(false);
  const [apiVersion, setApiVersion] = useState("2024-12-01-preview");

  // Apply remote defaults when config loads (React-recommended pattern)
  const [prevAppConfig, setPrevAppConfig] = useState<AppConfig | null>(null);
  if (appConfig && appConfig !== prevAppConfig) {
    setPrevAppConfig(appConfig);
    setApiVersion(appConfig.default_api_version);
    setIterations(appConfig.default_iterations);
    setMaxTokens(appConfig.default_max_tokens);
  }

  // Auto-flip to Auto Discover the first time the user signs in.
  const [wasSignedIn, setWasSignedIn] = useState(false);
  if (msal.signedIn && !wasSignedIn) {
    setWasSignedIn(true);
    setRegionTab("discover");
  }
  if (!msal.signedIn && wasSignedIn) {
    setWasSignedIn(false);
  }

  // ---------- helpers ----------

  const toggleSet = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Set<string>>>,
      value: string
    ) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    []
  );

  const addDiscoveredRegions = useCallback(() => {
    if (!discovery.resources.length) return;
    const existing = new Set(configuredRegions.map((r) => r.endpoint));
    const toAdd = discovery.resources
      .filter(
        (r: DiscoveredResource) =>
          selectedDiscovered.has(r.endpoint) && !existing.has(r.endpoint)
      )
      .map((r: DiscoveredResource) => ({
        name: r.name,
        endpoint: r.endpoint,
      }));
    if (toAdd.length) setConfiguredRegions((prev) => [...prev, ...toAdd]);
  }, [discovery.resources, selectedDiscovered, configuredRegions]);

  const addManualRegion = useCallback(() => {
    const name = manualName.trim();
    const endpoint = manualEndpoint.trim();
    if (!name || !endpoint) return;
    const normalised = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    if (configuredRegions.some((r) => r.endpoint === normalised)) return;
    setConfiguredRegions((prev) => [
      ...prev,
      { name, endpoint: normalised },
    ]);
    setManualName("");
    setManualEndpoint("");
  }, [manualName, manualEndpoint, configuredRegions]);

  const removeRegion = useCallback((endpoint: string) => {
    setConfiguredRegions((prev) => prev.filter((r) => r.endpoint !== endpoint));
  }, []);

  const addCustomModel = useCallback(() => {
    const m = customModel.trim();
    if (!m) return;
    setSelectedModels((prev) => new Set(prev).add(m));
    setCustomModel("");
  }, [customModel]);

  // ---------- submit ----------

  const handleStart = useCallback(() => {
    const config: BenchmarkConfig = {
      regions: configuredRegions,
      models: Array.from(selectedModels),
      api_types: Array.from(selectedApiTypes),
      iterations,
      rounds,
      max_tokens: maxTokens,
      timeout: 120,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      test_cache: testCache,
      api_key: manualApiKey || null,
      api_version: apiVersion,
      reasoning_efforts: Array.from(selectedEfforts),
      reasoning_summary: reasoningSummary || null,
      streaming,
      warmup,
      concurrency,
      mode,
      monitor_interval: monitorInterval,
      monitor_duration: monitorDuration,
    };
    onStart(config);
  }, [
    configuredRegions,
    selectedModels,
    selectedApiTypes,
    iterations,
    rounds,
    maxTokens,
    systemPrompt,
    userPrompt,
    testCache,
    apiVersion,
    selectedEfforts,
    reasoningSummary,
    streaming,
    warmup,
    concurrency,
    mode,
    monitorInterval,
    monitorDuration,
    manualApiKey,
    onStart,
  ]);

  const canStart =
    configuredRegions.length > 0 &&
    selectedModels.size > 0 &&
    selectedApiTypes.size > 0;

  // ---------- model groups ----------

  const modelGroups = appConfig?.models ?? {};
  const modelGroupKeys = Object.keys(modelGroups);

  // ---------- render ----------

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-muted-foreground">
          <svg
            className="size-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      {/* ====== Auth Status ====== */}
      <div className="bg-white shadow-sm rounded-xl border border-[#E8E4F0] p-5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Authentication
        </span>
        {msal.signedIn ? (
          <Badge variant="default">Entra ID SSO</Badge>
        ) : msal.configured ? (
          <Badge variant="secondary">SSO configured, not signed in</Badge>
        ) : auth.loading ? (
          <Badge variant="secondary">Checking...</Badge>
        ) : auth.method === "workload_identity" ? (
          <Badge variant="default">AKS Workload Identity</Badge>
        ) : auth.method === "managed_identity" ? (
          <Badge variant="default">Managed Identity</Badge>
        ) : auth.method === "service_principal" ? (
          <Badge variant="default">Service Principal</Badge>
        ) : auth.method === "azure_cli" ? (
          <Badge variant="default">Azure CLI</Badge>
        ) : auth.method === "env_vars" ? (
          <Badge variant="default">Environment</Badge>
        ) : (
          <Badge variant="outline">Manual endpoint + key</Badge>
        )}
        {msal.signedIn && msal.account && (
          <span className="text-xs text-muted-foreground truncate max-w-xs">
            {msal.account.username}
          </span>
        )}
        {!msal.signedIn && !msal.configured && !auth.loading && (
          <span className="text-xs text-muted-foreground">
            No SSO — paste endpoint + API key manually, or configure an App Registration.
          </span>
        )}

        {/* Action area on the right */}
        <div className="ml-auto flex items-center gap-2">
          {!msal.configured && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAppRegOpen(true)}
            >
              Configure SSO
            </Button>
          )}
          {msal.configured && !msal.signedIn && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={msal.signingIn}
                onClick={msal.signIn}
              >
                {msal.signingIn ? "Signing in…" : "Sign in with Entra ID"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAppRegOpen(true)}>
                Edit App Reg
              </Button>
            </>
          )}
          {msal.signedIn && (
            <>
              <Button size="sm" variant="ghost" onClick={msal.signOut}>
                Sign out
              </Button>
              <Button size="sm" variant="ghost" onClick={msal.resetConfig}>
                Reset SSO
              </Button>
            </>
          )}
        </div>

        {msal.error && (
          <span className="text-xs text-red-600 basis-full">{msal.error}</span>
        )}
      </div>

      <AppRegConfigDialog
        open={appRegOpen}
        initial={getActiveConfig()}
        onCancel={() => setAppRegOpen(false)}
        onSave={async (cfg) => {
          await msal.configure(cfg);
          setAppRegOpen(false);
        }}
      />

      {/* ====== Region Configuration ====== */}
      <Card className="shadow-sm rounded-xl border-[#E8E4F0]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-lg font-semibold">Region Configuration</CardTitle>
          <CardDescription>
            Add Azure OpenAI endpoints to benchmark. Use auto-discover or enter
            manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <Tabs value={regionTab} onValueChange={setRegionTab}>
            <TabsList>
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              <TabsTrigger value="discover" disabled={!msal.signedIn && auth.method !== "azure_cli"}>
                Auto Discover
              </TabsTrigger>
            </TabsList>

            {/* -- discover tab -- */}
            <TabsContent value="discover">
              <div className="space-y-3 pt-3">
                {discovery.loading ? (
                  <p className="text-sm text-muted-foreground">
                    Discovering resources...
                  </p>
                ) : discovery.error ? (
                  <p className="text-sm text-destructive">{discovery.error}</p>
                ) : discovery.resources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No resources found. Make sure you are logged in with Azure
                    CLI.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {discovery.resources.map((r) => (
                        <label
                          key={r.endpoint}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedDiscovered.has(r.endpoint)}
                            onCheckedChange={() =>
                              toggleSet(
                                setSelectedDiscovered as React.Dispatch<
                                  React.SetStateAction<Set<string>>
                                >,
                                r.endpoint
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {r.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.region}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addDiscoveredRegions}
                      disabled={selectedDiscovered.size === 0}
                    >
                      Add Selected
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* -- manual tab -- */}
            <TabsContent value="manual">
              <div className="space-y-3 pt-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Region name (e.g. East US)"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Endpoint URL (https://<resource>.openai.azure.com)"
                    value={manualEndpoint}
                    onChange={(e) => setManualEndpoint(e.target.value)}
                    className="flex-[2]"
                  />
                  <Button variant="outline" size="sm" onClick={addManualRegion}>
                    Add
                  </Button>
                </div>
                {!msal.signedIn && (
                  <div className="space-y-1">
                    <Label htmlFor="manual-api-key">API Key</Label>
                    <Input
                      id="manual-api-key"
                      type="password"
                      placeholder="Paste the endpoint's API key from Azure Portal → Keys and Endpoint"
                      value={manualApiKey}
                      onChange={(e) => setManualApiKey(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Applies to every manually added region. Sign in with Entra ID SSO to skip this.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* -- configured regions list -- */}
          {configuredRegions.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Configured Regions ({configuredRegions.length})
              </Label>
              <div className="divide-y rounded-lg border border-border">
                {configuredRegions.map((r) => (
                  <div
                    key={r.endpoint}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.endpoint}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeRegion(r.endpoint)}
                      aria-label={`Remove ${r.name}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="size-4"
                      >
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====== Model Selection ====== */}
      <Card className="shadow-sm rounded-xl border-[#E8E4F0]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-lg font-semibold">Model Selection</CardTitle>
          <CardDescription>
            Choose models to include in the benchmark run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <Tabs defaultValue={modelGroupKeys[0] ?? "custom"}>
            <TabsList className="flex-wrap">
              {modelGroupKeys.map((group) => (
                <TabsTrigger key={group} value={group}>
                  {group}
                </TabsTrigger>
              ))}
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            {modelGroupKeys.map((group) => (
              <TabsContent key={group} value={group}>
                <div className="grid gap-2 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                  {modelGroups[group].map((model) => (
                    <label
                      key={model}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedModels.has(model)}
                        onCheckedChange={() =>
                          toggleSet(setSelectedModels, model)
                        }
                      />
                      <span className="truncate text-sm">{model}</span>
                    </label>
                  ))}
                </div>
              </TabsContent>
            ))}

            <TabsContent value="custom">
              <div className="flex items-center gap-2 pt-3">
                <Input
                  placeholder="Enter model deployment name"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomModel();
                    }
                  }}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addCustomModel}>
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* selected models summary */}
          {selectedModels.size > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Array.from(selectedModels).map((m) => (
                <Badge
                  key={m}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => toggleSet(setSelectedModels, m)}
                >
                  {m}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="ml-0.5 size-3"
                  >
                    <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                  </svg>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ====== Test Parameters ====== */}
      <Card className="shadow-sm rounded-xl border-[#E8E4F0]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-lg font-semibold">Test Parameters</CardTitle>
          <CardDescription>
            Configure how the benchmark will run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-5 pb-5">
          {/* -- Mode toggle -- */}
          <div className="space-y-3">
            <Label>Mode</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setMode("benchmark")}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === "benchmark"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Benchmark
              </button>
              <button
                type="button"
                onClick={() => setMode("monitor")}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === "monitor"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Monitor
              </button>
            </div>
          </div>

          {/* -- Monitor params (conditional) -- */}
          {mode === "monitor" && (
            <div className="grid gap-4 rounded-lg border border-dashed border-border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monitor-interval">
                  Interval (seconds)
                </Label>
                <Input
                  id="monitor-interval"
                  type="number"
                  min={10}
                  value={monitorInterval}
                  onChange={(e) =>
                    setMonitorInterval(parseInt(e.target.value) || 60)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monitor-duration">
                  Duration (seconds)
                </Label>
                <Input
                  id="monitor-duration"
                  type="number"
                  min={60}
                  value={monitorDuration}
                  onChange={(e) =>
                    setMonitorDuration(parseInt(e.target.value) || 3600)
                  }
                />
              </div>
            </div>
          )}

          <Separator />

          {/* -- API Types -- */}
          <div className="space-y-3">
            <Label>API Types</Label>
            <div className="flex flex-wrap gap-2">
              {API_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedApiTypes.has(opt.value)}
                    onCheckedChange={() =>
                      toggleSet(setSelectedApiTypes, opt.value)
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* -- Numeric params grid -- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="iterations">Iterations</Label>
              <Input
                id="iterations"
                type="number"
                min={1}
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rounds">Rounds</Label>
              <Input
                id="rounds"
                type="number"
                min={1}
                value={rounds}
                onChange={(e) => setRounds(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="concurrency">Concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-tokens">Max Tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 100)}
              />
            </div>
          </div>

          <Separator />

          {/* -- Reasoning Effort -- */}
          <div className="space-y-3">
            <Label>Reasoning Effort</Label>
            <div className="flex flex-wrap gap-2">
              {REASONING_EFFORT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedEfforts.has(opt.value)}
                    onCheckedChange={() =>
                      toggleSet(setSelectedEfforts, opt.value)
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* -- Reasoning Summary -- */}
          <div className="space-y-2">
            <Label>Reasoning Summary</Label>
            <Select
              value={reasoningSummary}
              onValueChange={(val) => setReasoningSummary(val as string)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {REASONING_SUMMARY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value || "_off"}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* -- API Version -- */}
          <div className="space-y-2">
            <Label htmlFor="api-version">API Version</Label>
            <Input
              id="api-version"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* -- Prompts -- */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt</Label>
              <textarea
                id="system-prompt"
                rows={3}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-prompt">User Prompt</Label>
              <textarea
                id="user-prompt"
                rows={3}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
          </div>

          <Separator />

          {/* -- Toggles -- */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={streaming}
                onCheckedChange={(val) => setStreaming(val)}
              />
              <Label>Streaming</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={warmup}
                onCheckedChange={(val) => setWarmup(val)}
              />
              <Label>Warm-up</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={testCache}
                onCheckedChange={(val) => setTestCache(val)}
              />
              <Label>Cache Test</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====== Start Button ====== */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!canStart}
          onClick={handleStart}
          className="min-w-[200px] rounded-xl shadow-md"
        >
          {mode === "monitor" ? "Start Monitor" : "Start Benchmark"}
        </Button>
      </div>
    </div>
  );
}
