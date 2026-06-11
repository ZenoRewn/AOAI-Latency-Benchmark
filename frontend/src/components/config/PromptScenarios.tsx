"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { PromptScenario } from "@/types/benchmark";

interface PromptScenariosProps {
  currentSystem: string;
  currentUser: string;
  onLoad: (system: string, user: string) => void;
}

const STORAGE_KEY = "aoai-benchmark:promptScenarios.v1";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function PromptScenarios({
  currentSystem,
  currentUser,
  onLoad,
}: PromptScenariosProps) {
  const [scenarios, setScenarios] = usePersistedState<PromptScenario[]>(
    STORAGE_KEY,
    [],
  );
  const [selectedId, setSelectedId] = useState<string>("");

  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) return;
      setSelectedId(id);
      const sc = scenarios.find((s) => s.id === id);
      if (sc) onLoad(sc.system, sc.user);
    },
    [scenarios, onLoad],
  );

  const handleSave = useCallback(() => {
    const name = window.prompt("Scenario name:")?.trim();
    if (!name) return;
    const sc: PromptScenario = {
      id: makeId(),
      name,
      system: currentSystem,
      user: currentUser,
      createdAt: Date.now(),
    };
    setScenarios((prev) => [...prev, sc]);
    setSelectedId(sc.id);
  }, [currentSystem, currentUser, setScenarios]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    const sc = scenarios.find((s) => s.id === selectedId);
    if (!sc) return;
    if (!window.confirm(`Delete scenario "${sc.name}"?`)) return;
    setScenarios((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId("");
  }, [selectedId, scenarios, setScenarios]);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Prompt Scenario</Label>
        <Select
          value={selectedId || undefined}
          onValueChange={handleSelect}
        >
          <SelectTrigger className="w-56">
            <SelectValue
              placeholder={
                scenarios.length === 0
                  ? "No saved scenarios"
                  : "Load scenario..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" size="sm" onClick={handleSave}>
        Save as...
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={!selectedId}
      >
        Delete
      </Button>
    </div>
  );
}
