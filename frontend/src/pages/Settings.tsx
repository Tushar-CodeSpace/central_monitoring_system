import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import type { AlertConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const FIELDS: {
  key: keyof AlertConfig;
  label: string;
  hint: string;
  min: number;
  max?: number;
}[] = [
  {
    key: "ram_threshold_percent",
    label: "Memory alert threshold (%)",
    hint: "Raise a warning when a server's memory usage exceeds this share of total RAM.",
    min: 0,
    max: 100,
  },
  {
    key: "cpu_threshold_percent",
    label: "CPU alert threshold (%)",
    hint: "CPU level that starts counting towards a sustained-CPU warning.",
    min: 0,
    max: 100,
  },
  {
    key: "cpu_duration_seconds",
    label: "CPU sustained window (seconds)",
    hint: "How long CPU must stay above its threshold before the warning fires.",
    min: 30,
  },
  {
    key: "disk_threshold_percent",
    label: "Disk alert threshold (%)",
    hint: "Raise a warning when a server's disk usage exceeds this share.",
    min: 0,
    max: 100,
  },
];

export default function Settings() {
  const [form, setForm] = useState<AlertConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AlertConfig>("/settings")
      .then(setForm)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load settings")
      );
  }, []);

  function update(key: keyof AlertConfig, raw: string) {
    setForm((prev) => (prev ? { ...prev, [key]: Number(raw) } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await apiFetch<AlertConfig>("/settings", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setForm(saved);
      showToast({
        severity: "info",
        title: "Settings saved",
        message: "New thresholds apply from the next evaluation cycle (≤ 5s).",
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Save failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Alert thresholds — applied platform-wide</p>
      </div>

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Alert thresholds</CardTitle>
          <p className="text-xs text-slate-500">
            Stored centrally and picked up by the alert engine within seconds — no restart
            needed.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!form && !loadError ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))
          ) : form ? (
            FIELDS.map(({ key, label, hint, min, max }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={key} className="text-xs text-slate-400">
                  {label}
                </Label>
                <Input
                  id={key}
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
                <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
              </div>
            ))
          ) : null}

          <Button onClick={save} disabled={saving || !form} className="mt-2 self-start">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
